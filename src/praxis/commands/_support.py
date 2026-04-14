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
from praxis.runtime.approval_records import approval_history_snapshot
from praxis.runtime.adapters.harness import compile_dispatch_bundle, load_adapter_harness
from praxis.runtime.context.bundle import load_dispatch_bundle_status
from praxis.runtime.observability.trace_summary import build_trace_summary
from praxis.runtime.policy_records import policy_history_snapshot
from praxis.runtime.orchestrator import advance_run, build_dispatch, continue_run, initialize_run, resume_run
from praxis.runtime.state.contract_validation import ContractValidationError, validate_contract_payload
from praxis.runtime.state.durable_state import (
    RecoveryRequiredError,
    dump_json,
    inspect_handoff_file,
    load_events,
    load_json,
    recover_pending_transaction,
    validate_state_payloads,
)
from praxis.runtime.tool_broker import tool_usage_snapshot
from praxis.runtime.workers.dispatch import dispatch_worker
from praxis.runtime.workers.planning import build_worker_plan, ensure_run_vnext_defaults, sync_worker_cursor
from praxis.runtime.workers.sidecar import list_sidecar_workers


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

    planned_worker = build_worker_plan(run)
    planned_worker_id = None if planned_worker is None else planned_worker.get("worker_id")
    planned_reuse_policy = None if planned_worker is None else planned_worker.get("reuse_policy")
    planned_resume_strategy = None if planned_worker is None else planned_worker.get("resume_strategy")

    needs_worker_identity = current.get("worker_id") is None or (
        planned_worker_id is not None
        and planned_reuse_policy != "reuse_story_worker"
        and current.get("worker_id") != planned_worker_id
    )
    needs_pending_action = (
        routing.get("next_action") == "run_stage"
        and routing.get("pending_worker_action") is None
    )
    needs_resume_strategy = (
        routing.get("next_action") == "run_stage"
        and routing.get("resume_strategy") != planned_resume_strategy
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


def _linked_artifact_summary(
    *,
    repo_root: Path,
    rel_path: str | None,
    contract_name: str,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    summary = {
        "path": rel_path,
        "linked": rel_path is not None,
        "exists": False,
        "schema_valid": None,
    }
    if rel_path is None:
        return summary, None

    artifact_path = repo_root / rel_path
    if not artifact_path.exists():
        return summary, None

    summary["exists"] = True
    try:
        payload = load_json(artifact_path)
    except Exception as exc:  # pragma: no cover - load_json normally handles valid JSON files
        summary["schema_valid"] = False
        summary["validation_error"] = str(exc)
        return summary, None

    try:
        validate_contract_payload(contract_name, payload)
    except ContractValidationError as exc:
        summary["schema_valid"] = False
        summary["validation_error"] = str(exc)
        return summary, None

    summary["schema_valid"] = True
    return summary, payload


def _summarize_trace_stream(*, repo_root: Path, trace_path: str | None) -> dict[str, Any]:
    summary = {
        "path": trace_path,
        "linked": trace_path is not None,
        "exists": False,
        "schema_valid": None,
    }
    if trace_path is None:
        return summary

    full_path = repo_root / trace_path
    if not full_path.exists():
        return summary

    summary["exists"] = True
    try:
        events = load_events(full_path)
    except Exception as exc:  # pragma: no cover - load_events only reads local files
        summary["schema_valid"] = False
        summary["validation_error"] = str(exc)
        return summary

    summary["event_count"] = len(events)
    if events:
        summary["last_event_type"] = events[-1].get("type")
        summary["last_event_reason_code"] = events[-1].get("reason_code")
        summary["last_event_reason"] = events[-1].get("reason")
        summary["last_event_recorded_at"] = events[-1].get("ts")

    try:
        for index, event in enumerate(events):
            validate_contract_payload("trace-event.schema.json", event)
    except ContractValidationError as exc:
        summary["schema_valid"] = False
        summary["validation_error"] = f"events[{index}]: {exc}"
        return summary

    summary["schema_valid"] = True
    return summary


def build_active_runtime_snapshot(
    *,
    repo_root: Path,
    dispatch_bundle: dict[str, Any] | None,
) -> dict[str, Any]:
    bundle = dispatch_bundle or {}

    worker_summary, worker_record = _linked_artifact_summary(
        repo_root=repo_root,
        rel_path=bundle.get("worker_record_path"),
        contract_name="worker-record.schema.json",
    )
    if worker_record is not None:
        worker_summary.update(
            {
                "worker_id": worker_record["worker_id"],
                "run_id": worker_record["run_id"],
                "status": worker_record["status"],
                "worker_class": worker_record["worker_class"],
                "permission_profile": worker_record["permission_profile"],
                "worktree_mode": worker_record["worktree_mode"],
                "worktree_path": worker_record["worktree_path"],
                "session_id": worker_record["session_id"],
                "dispatch_id": worker_record.get("dispatch_id"),
                "dispatch_record_path": worker_record.get("dispatch_record_path"),
                "launch_record_path": worker_record["launch_record_path"],
                "trace_path": worker_record["trace_path"],
                "isolation_mode": (worker_record.get("isolation") or {}).get("mode"),
                "runtime_state_channel": (worker_record.get("isolation") or {}).get("runtime_state_channel"),
            }
        )

    session_summary, session_record = _linked_artifact_summary(
        repo_root=repo_root,
        rel_path=bundle.get("session_record_path"),
        contract_name="session-record.schema.json",
    )
    if session_record is not None:
        session_summary.update(
            {
                "session_id": session_record["session_id"],
                "worker_id": session_record["worker_id"],
                "resumable": session_record["resumable"],
                "resumable_reason_code": session_record.get("resumable_reason_code"),
                "resumable_reason": session_record.get("resumable_reason"),
                "provider_locator_present": session_record.get("provider_locator") is not None,
                "current_stage": session_record.get("current_stage"),
                "current_slice_id": session_record.get("current_slice_id"),
                "permission_profile": session_record.get("permission_profile"),
                "worktree_mode": session_record.get("worktree_mode"),
                "last_resume_outcome": session_record.get("last_resume_outcome"),
            }
        )

    launch_summary, launch_record = _linked_artifact_summary(
        repo_root=repo_root,
        rel_path=bundle.get("native_launch_record_path"),
        contract_name="native-launch.schema.json",
    )
    if launch_record is not None:
        launch_summary.update(
            {
                "recorded_at": launch_record["recorded_at"],
                "adapter": launch_record["adapter"],
                "session_id": launch_record["session"]["id"],
                "stage": launch_record["dispatch"]["stage"],
                "slice_id": launch_record["dispatch"]["slice_id"],
                "boundary_handoff_path": launch_record["dispatch"]["boundary_handoff_path"],
                "handoff_injected": launch_record["context"]["handoff_injected"],
                "worker_id": (launch_record.get("worker") or {}).get("worker_id"),
                "worker_class": (launch_record.get("worker") or {}).get("worker_class"),
                "launch_surface": (launch_record.get("worker") or {}).get("launch_surface"),
                "worktree_mode": (launch_record.get("worker") or {}).get("worktree_mode"),
                "dispatch_record_path": (launch_record.get("bundle") or {}).get("dispatch_record_path"),
                "trace_path": (launch_record.get("harness") or {}).get("trace_path"),
            }
        )

    resume_summary, resume_record = _linked_artifact_summary(
        repo_root=repo_root,
        rel_path=bundle.get("native_resume_record_path"),
        contract_name="native-resume.schema.json",
    )
    if resume_record is not None:
        resume_summary.update(
            {
                "recorded_at": resume_record["recorded_at"],
                "adapter": resume_record["adapter"],
                "worker_id": resume_record["worker_id"],
                "requested_session_id": resume_record["requested_session_id"],
                "resolved_session_id": resume_record["resolved_session_id"],
                "outcome": resume_record["outcome"],
                "reason_code": resume_record["reason_code"],
                "reason": resume_record["reason"],
                "prompt_injected": resume_record["prompt_injected"],
                "trace_path": resume_record["trace_path"],
                "session_record_path": resume_record["session_record_path"],
            }
        )

    trace_path = None
    if worker_record is not None:
        trace_path = worker_record.get("trace_path")
    elif launch_record is not None:
        trace_path = (launch_record.get("harness") or {}).get("trace_path")
    elif resume_record is not None:
        trace_path = resume_record.get("trace_path")
    trace_summary = _summarize_trace_stream(repo_root=repo_root, trace_path=trace_path)

    return {
        "worker_record": worker_summary,
        "session_record": session_summary,
        "launch_record": launch_summary,
        "resume_record": resume_summary,
        "trace_stream": trace_summary,
    }


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
    dispatch_bundle = load_dispatch_bundle_status(repo_root=repo_root, run=run, dispatch=dispatch)
    approvals = approval_history_snapshot(repo_root=repo_root)
    policies = policy_history_snapshot(repo_root=repo_root)
    active_runtime = build_active_runtime_snapshot(
        repo_root=repo_root,
        dispatch_bundle=dispatch_bundle,
    )
    sidecars = list_sidecar_workers(repo_root=repo_root)
    active_dispatch_id = None if dispatch_bundle is None else dispatch_bundle.get("dispatch_id")
    tool_usage = {
        "active_dispatch": tool_usage_snapshot(repo_root=repo_root, dispatch_id=active_dispatch_id),
        "overall": tool_usage_snapshot(repo_root=repo_root),
    }

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
        "dispatch_bundle": dispatch_bundle,
        "active_runtime": active_runtime,
        "sidecars": {
            "count": len(sidecars),
            "items": sidecars,
        },
        "tool_usage": tool_usage,
        "approvals": approvals,
        "policies": policies,
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
