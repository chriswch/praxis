from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from praxis.cli.exit_codes import (
    BLOCKED_EXIT,
    ENVIRONMENT_EXIT,
    GENERIC_FAILURE_EXIT,
    INVALID_INPUT_EXIT,
    NO_ACTIVE_RUN_EXIT,
    OUTPUT_VERSION,
    CliContractError,
)
from praxis.runtime.adapters.harness import build_worker_launch_payload, load_adapter_harness
from praxis.runtime.observability.trace_summary import build_trace_summary
from praxis.runtime.orchestrator import advance_run, build_dispatch, continue_run, initialize_run, resume_run
from praxis.runtime.state.contract_validation import ContractValidationError
from praxis.runtime.state.durable_state import (
    RecoveryRequiredError,
    dump_json,
    inspect_handoff_file,
    load_json,
    recover_pending_transaction,
    validate_state_payloads,
)
from praxis.runtime.workers.dispatch import dispatch_worker
from praxis.runtime.workers.planning import ensure_run_vnext_defaults, sync_worker_cursor


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def run_path(repo_root: Path) -> Path:
    return repo_root / ".praxis" / "run.json"


def ledger_path(repo_root: Path) -> Path:
    return repo_root / ".praxis" / "story-ledger.json"


def resolve_repo_root(repo_root_value: str) -> Path:
    return Path(repo_root_value).resolve()


def validate_timestamp(value: str) -> str:
    if not value.endswith("Z"):
        raise CliContractError(
            code="invalid_argument",
            message="--timestamp must be an ISO 8601 UTC timestamp with a trailing 'Z'.",
            exit_code=INVALID_INPUT_EXIT,
        )
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise CliContractError(
            code="invalid_argument",
            message="--timestamp must be an ISO 8601 UTC timestamp with a trailing 'Z'.",
            exit_code=INVALID_INPUT_EXIT,
        ) from exc
    if parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        raise CliContractError(
            code="invalid_argument",
            message="--timestamp must be in UTC.",
            exit_code=INVALID_INPUT_EXIT,
        )
    return value


def command_timestamp(raw_timestamp: str | None) -> str:
    return validate_timestamp(raw_timestamp) if raw_timestamp else utc_now()


def ensure_output_version(version: int) -> None:
    if version != OUTPUT_VERSION:
        raise CliContractError(
            code="unsupported_output_version",
            message=f"Praxis output version {version} is not supported; use --output-version 1.",
            exit_code=INVALID_INPUT_EXIT,
        )


def load_run_or_error(repo_root: Path) -> dict[str, Any]:
    recover_pending_transaction(repo_root)
    path = run_path(repo_root)
    if not path.exists():
        raise CliContractError(
            code="no_active_run",
            message="Praxis could not find an active run under .praxis/run.json.",
            exit_code=NO_ACTIVE_RUN_EXIT,
            details={"run_path": str(path)},
            retryable=True,
        )
    run = load_json(path)
    ensure_run_vnext_defaults(run)
    sync_cursor_if_needed(run)
    validate_state_payloads(run=run)
    return run


def sync_cursor_if_needed(run: dict[str, Any]) -> None:
    current = run.get("current", {})
    routing = run.get("routing", {})
    if current.get("stage") is None:
        return

    needs_worker_identity = current.get("worker_id") is None
    needs_pending_action = (
        routing.get("next_action") == "run_stage"
        and routing.get("pending_worker_action") is None
    )
    needs_resume_strategy = (
        routing.get("next_action") == "run_stage"
        and routing.get("resume_strategy") is None
    )
    if needs_worker_identity or needs_pending_action or needs_resume_strategy:
        sync_worker_cursor(run)


def resolve_repo_path(repo_root: Path, value: str) -> Path:
    candidate = Path(value)
    if candidate.is_absolute():
        return candidate
    return repo_root / candidate


def load_object_json_arg(repo_root: Path, value: str | None, *, flag_name: str) -> dict[str, Any] | None:
    if value is None:
        return None
    path = resolve_repo_path(repo_root, value)
    if not path.exists():
        raise CliContractError(
            code="missing_required_artifact",
            message=f"Praxis could not find the artifact passed to {flag_name}: {value}.",
            exit_code=INVALID_INPUT_EXIT,
            details={"path": str(path)},
        )
    payload = load_json(path)
    if not isinstance(payload, dict):
        raise CliContractError(
            code="invalid_argument",
            message=f"{flag_name} must point to a JSON object.",
            exit_code=INVALID_INPUT_EXIT,
            details={"path": str(path)},
        )
    return payload


def build_handoff_status(repo_root: Path, run: dict[str, Any], ledger: dict[str, Any] | None) -> dict[str, Any] | None:
    handoff_path = run.get("routing", {}).get("boundary_handoff_path")
    if handoff_path:
        return inspect_handoff_file(repo_root / handoff_path)

    if ledger is None:
        return None

    stories = ledger.get("stories", {})
    active_story_id = stories.get("active")
    if not active_story_id:
        return None
    active_story = stories.get("items", {}).get(active_story_id, {})
    carry_forward_from = active_story.get("carry_forward_from")
    if not carry_forward_from:
        return None
    previous_story = stories.get("items", {}).get(carry_forward_from, {})
    previous_handoff = previous_story.get("handoff_path")
    if not previous_handoff:
        return None
    return inspect_handoff_file(repo_root / previous_handoff)


def build_run_snapshot(repo_root: Path) -> dict[str, Any]:
    recovery_result = recover_pending_transaction(repo_root)
    run = load_run_or_error(repo_root)
    dispatch = build_dispatch(repo_root, run=deepcopy(run))

    ledger: dict[str, Any] | None = None
    ledger_snapshot: dict[str, Any] | None = None
    path = ledger_path(repo_root)
    if path.exists():
        ledger = load_json(path)
        validate_state_payloads(ledger=ledger)
        stories = ledger.get("stories", {})
        ledger_snapshot = {
            "active_story": stories.get("active"),
            "last_completed": stories.get("last_completed"),
        }

    handoff_status = build_handoff_status(repo_root, run, ledger)

    return {
        "workflow": run.get("workflow"),
        "workflow_version": run.get("workflow_version"),
        "run_id": run.get("run_id"),
        "run_status": run.get("status"),
        "mode": run.get("mode"),
        "execution_mode": run.get("execution", {}).get("mode"),
        "current": {
            "scope": run.get("current", {}).get("scope"),
            "slice_id": run.get("current", {}).get("slice_id"),
            "stage": run.get("current", {}).get("stage"),
            "artifact_dir": run.get("current", {}).get("artifact_dir"),
            "worker_id": run.get("current", {}).get("worker_id"),
            "session_id": run.get("current", {}).get("session_id"),
        },
        "routing": {
            "next_action": run.get("routing", {}).get("next_action"),
            "next_stage": run.get("routing", {}).get("next_stage"),
            "next_slice_id": run.get("routing", {}).get("next_slice_id"),
            "boundary_handoff_path": run.get("routing", {}).get("boundary_handoff_path"),
            "stop_reason_code": run.get("routing", {}).get("stop_reason_code"),
            "reason": run.get("routing", {}).get("reason"),
            "pending_worker_action": run.get("routing", {}).get("pending_worker_action"),
            "resume_strategy": run.get("routing", {}).get("resume_strategy"),
        },
        "ledger": ledger_snapshot,
        "handoff_status": handoff_status,
        "dispatch": dispatch,
        "trace": build_trace_summary(
            repo_root=repo_root,
            dispatch=dispatch,
            recovery_result=recovery_result,
        ),
    }


def normalize_resume_action(raw_action: str, repo_root: Path) -> str:
    if raw_action in {"resume_active", "resume_waiting", "resume_waiting_confirmation", "resume_terminal"}:
        return raw_action
    if raw_action == "resume_manual_wait":
        return "resume_waiting_confirmation"
    if raw_action in {"resume_autopilot_activation", "resume_replayed_activation"}:
        return "activate_next_story_from_boundary"
    if raw_action == "resume_cancelled":
        return "resume_terminal"
    snapshot = build_run_snapshot(repo_root)
    if raw_action == "resume_blocked":
        raise CliContractError(
            code="blocked",
            message=snapshot["routing"]["reason"] or "Praxis resume is blocked until the current stop condition is resolved.",
            exit_code=BLOCKED_EXIT,
            details={"stop_reason_code": snapshot["routing"]["stop_reason_code"]},
            retryable=True,
        )
    if raw_action == "resume_inconsistent":
        raise CliContractError(
            code="invalid_run_state",
            message=snapshot["routing"]["reason"] or "Praxis resume found inconsistent durable state.",
            exit_code=BLOCKED_EXIT,
            details={"stop_reason_code": snapshot["routing"]["stop_reason_code"]},
        )
    raise CliContractError(
        code="internal_error",
        message=f"Praxis resume returned an unsupported transition action: {raw_action}.",
        exit_code=GENERIC_FAILURE_EXIT,
    )


def normalize_dispatch_action(raw_action: str) -> str:
    if raw_action in {"launch_worker", "resume_fallback_relaunch"}:
        return raw_action
    if raw_action == "worker_resumed":
        return "launch_worker"
    raise CliContractError(
        code="internal_error",
        message=f"Praxis dispatch returned an unsupported transition action: {raw_action}.",
        exit_code=GENERIC_FAILURE_EXIT,
    )


def classify_unexpected_exception(command: str, exc: Exception) -> CliContractError:
    if isinstance(exc, CliContractError):
        return exc
    if isinstance(exc, ContractValidationError):
        return CliContractError(
            code="contract_validation_failed",
            message=str(exc),
            exit_code=INVALID_INPUT_EXIT,
        )
    if isinstance(exc, RecoveryRequiredError):
        return CliContractError(
            code="environment_error",
            message=exc.message,
            exit_code=ENVIRONMENT_EXIT,
            details={"recovery_code": exc.code},
            retryable=True,
        )
    if isinstance(exc, FileNotFoundError):
        code = "missing_required_artifact"
        exit_code = INVALID_INPUT_EXIT
        if command in {"build-worker-launch", "harness show-adapter"}:
            code = "missing_adapter_harness"
            exit_code = ENVIRONMENT_EXIT
        return CliContractError(
            code=code,
            message=str(exc),
            exit_code=exit_code,
            retryable=code == "missing_adapter_harness",
        )
    if isinstance(exc, ValueError):
        message = str(exc)
        if "out-of-order stage result" in message or "different artifact scope" in message:
            return CliContractError(
                code="stage_result_mismatch",
                message=message,
                exit_code=INVALID_INPUT_EXIT,
            )
        if "Cannot initialize a new run because .praxis/run.json already exists." in message:
            return CliContractError(
                code="run_already_exists",
                message="Praxis already has an active run in this repo.",
                exit_code=BLOCKED_EXIT,
                retryable=True,
            )
        if "continue-run only applies" in message or "can only dispatch a worker when" in message:
            return CliContractError(
                code="blocked",
                message=message,
                exit_code=BLOCKED_EXIT,
                retryable=True,
            )
        if "Cannot resume" in message or "Inconsistent durable state" in message:
            return CliContractError(
                code="invalid_run_state",
                message=message,
                exit_code=BLOCKED_EXIT,
            )
        if "Unsupported" in message:
            return CliContractError(
                code="invalid_argument",
                message=message,
                exit_code=INVALID_INPUT_EXIT,
            )
    if isinstance(exc, RuntimeError):
        return CliContractError(
            code="environment_error",
            message=str(exc),
            exit_code=ENVIRONMENT_EXIT,
            retryable=True,
        )
    return CliContractError(
        code="internal_error",
        message=str(exc),
        exit_code=GENERIC_FAILURE_EXIT,
        retryable=True,
    )
