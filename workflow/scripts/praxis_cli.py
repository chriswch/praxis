from __future__ import annotations

import argparse
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .contract_validation import ContractValidationError
from .durable_state import (
    RecoveryRequiredError,
    dump_json,
    inspect_handoff_file,
    load_json,
    recover_pending_transaction,
    validate_state_payloads,
)
from .harness_config import build_worker_launch_payload, load_adapter_harness
from .orchestrator import advance_run, build_dispatch, continue_run, initialize_run, resume_run
from .trace_summary import build_trace_summary
from .worker_dispatch import dispatch_worker
from .worker_runtime import ensure_run_vnext_defaults, sync_worker_cursor

_OUTPUT_VERSION = 1
_NO_ACTIVE_RUN_EXIT = 3
_BLOCKED_EXIT = 3
_INVALID_INPUT_EXIT = 2
_ENVIRONMENT_EXIT = 4
_GENERIC_FAILURE_EXIT = 1


class CliArgumentError(ValueError):
    """Raised when CLI parsing should stop with a contract error."""


class CliContractError(RuntimeError):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        exit_code: int,
        details: dict[str, Any] | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.exit_code = exit_code
        self.details = details or {}
        self.retryable = retryable


class PraxisArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise CliArgumentError(message)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _run_path(repo_root: Path) -> Path:
    return repo_root / ".praxis" / "run.json"


def _ledger_path(repo_root: Path) -> Path:
    return repo_root / ".praxis" / "story-ledger.json"


def _add_global_options(parser: argparse.ArgumentParser, *, suppress_defaults: bool) -> None:
    parser.add_argument(
        "--repo-root",
        default=argparse.SUPPRESS if suppress_defaults else ".",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        default=argparse.SUPPRESS if suppress_defaults else False,
    )
    parser.add_argument(
        "--output-version",
        type=int,
        default=argparse.SUPPRESS if suppress_defaults else _OUTPUT_VERSION,
    )


def _add_timestamp_option(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--timestamp")


def build_parser() -> PraxisArgumentParser:
    parser = PraxisArgumentParser(prog="praxis", description="Praxis workflow control-plane CLI.")
    _add_global_options(parser, suppress_defaults=False)
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run")
    _add_global_options(run_parser, suppress_defaults=True)
    _add_timestamp_option(run_parser)
    run_parser.add_argument("--workflow", choices=["craft", "forge"], required=True)
    run_parser.add_argument("--entry-task", required=True)
    run_parser.add_argument("--adapter", choices=["claude", "codex"], required=True)
    run_parser.add_argument("--execution-mode", choices=["manual", "autopilot"], default="manual")
    run_parser.add_argument("--entrypoint")

    status_parser = subparsers.add_parser("status")
    _add_global_options(status_parser, suppress_defaults=True)

    continue_parser = subparsers.add_parser("continue")
    _add_global_options(continue_parser, suppress_defaults=True)
    _add_timestamp_option(continue_parser)

    resume_parser = subparsers.add_parser("resume")
    _add_global_options(resume_parser, suppress_defaults=True)
    _add_timestamp_option(resume_parser)

    dispatch_parser = subparsers.add_parser("dispatch")
    _add_global_options(dispatch_parser, suppress_defaults=True)
    _add_timestamp_option(dispatch_parser)
    dispatch_parser.add_argument("--session-id")

    submit_parser = subparsers.add_parser("submit-stage-result")
    _add_global_options(submit_parser, suppress_defaults=True)
    _add_timestamp_option(submit_parser)
    submit_parser.add_argument("--stage-result-path", required=True)
    submit_parser.add_argument("--slice-map-path", default=".praxis/slice-map.json")
    submit_parser.add_argument("--commit-meta-path")
    submit_parser.add_argument("--handoff-data-path")
    submit_parser.add_argument("--dirty-path", action="append", default=[])
    submit_parser.add_argument("--gate-failure", action="append", default=[])
    submit_parser.add_argument("--cancel-requested", action="store_true")

    launch_parser = subparsers.add_parser("build-worker-launch")
    _add_global_options(launch_parser, suppress_defaults=True)

    harness_parser = subparsers.add_parser("harness")
    _add_global_options(harness_parser, suppress_defaults=True)
    harness_subparsers = harness_parser.add_subparsers(dest="harness_command", required=True)

    show_adapter_parser = harness_subparsers.add_parser("show-adapter")
    _add_global_options(show_adapter_parser, suppress_defaults=True)
    show_adapter_parser.add_argument("--adapter", choices=["claude", "codex"], required=True)

    return parser


def _command_name(args: argparse.Namespace) -> str:
    if args.command == "harness":
        return f"harness {args.harness_command}"
    return str(args.command)


def _guess_command(argv: list[str]) -> str:
    for index, token in enumerate(argv):
        if token == "harness" and index + 1 < len(argv) and argv[index + 1] == "show-adapter":
            return "harness show-adapter"
        if token in {
            "run",
            "status",
            "continue",
            "resume",
            "dispatch",
            "submit-stage-result",
            "build-worker-launch",
        }:
            return token
    return "praxis"


def _resolve_repo_root(args: argparse.Namespace) -> Path:
    return Path(getattr(args, "repo_root", ".")).resolve()


def _validate_timestamp(value: str) -> str:
    if not value.endswith("Z"):
        raise CliContractError(
            code="invalid_argument",
            message="--timestamp must be an ISO 8601 UTC timestamp with a trailing 'Z'.",
            exit_code=_INVALID_INPUT_EXIT,
        )
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise CliContractError(
            code="invalid_argument",
            message="--timestamp must be an ISO 8601 UTC timestamp with a trailing 'Z'.",
            exit_code=_INVALID_INPUT_EXIT,
        ) from exc
    if parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        raise CliContractError(
            code="invalid_argument",
            message="--timestamp must be in UTC.",
            exit_code=_INVALID_INPUT_EXIT,
        )
    return value


def _command_timestamp(args: argparse.Namespace) -> str:
    value = getattr(args, "timestamp", None)
    return _validate_timestamp(value) if value else _utc_now()


def _ensure_output_version(version: int) -> None:
    if version != _OUTPUT_VERSION:
        raise CliContractError(
            code="unsupported_output_version",
            message=f"Praxis output version {version} is not supported; use --output-version 1.",
            exit_code=_INVALID_INPUT_EXIT,
        )


def _load_run_or_error(repo_root: Path) -> dict[str, Any]:
    recover_pending_transaction(repo_root)
    run_path = _run_path(repo_root)
    if not run_path.exists():
        raise CliContractError(
            code="no_active_run",
            message="Praxis could not find an active run under .praxis/run.json.",
            exit_code=_NO_ACTIVE_RUN_EXIT,
            details={"run_path": str(run_path)},
            retryable=True,
        )
    run = load_json(run_path)
    ensure_run_vnext_defaults(run)
    _sync_cursor_if_needed(run)
    validate_state_payloads(run=run)
    return run


def _sync_cursor_if_needed(run: dict[str, Any]) -> None:
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


def _resolve_repo_path(repo_root: Path, value: str) -> Path:
    candidate = Path(value)
    if candidate.is_absolute():
        return candidate
    return repo_root / candidate


def _load_object_json_arg(repo_root: Path, value: str | None, *, flag_name: str) -> dict[str, Any] | None:
    if value is None:
        return None
    path = _resolve_repo_path(repo_root, value)
    if not path.exists():
        raise CliContractError(
            code="missing_required_artifact",
            message=f"Praxis could not find the artifact passed to {flag_name}: {value}.",
            exit_code=_INVALID_INPUT_EXIT,
            details={"path": str(path)},
        )
    payload = load_json(path)
    if not isinstance(payload, dict):
        raise CliContractError(
            code="invalid_argument",
            message=f"{flag_name} must point to a JSON object.",
            exit_code=_INVALID_INPUT_EXIT,
            details={"path": str(path)},
        )
    return payload


def _build_handoff_status(repo_root: Path, run: dict[str, Any], ledger: dict[str, Any] | None) -> dict[str, Any] | None:
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
    run = _load_run_or_error(repo_root)
    dispatch = build_dispatch(repo_root, run=deepcopy(run))

    ledger: dict[str, Any] | None = None
    ledger_snapshot: dict[str, Any] | None = None
    ledger_path = _ledger_path(repo_root)
    if ledger_path.exists():
        ledger = load_json(ledger_path)
        validate_state_payloads(ledger=ledger)
        stories = ledger.get("stories", {})
        ledger_snapshot = {
            "active_story": stories.get("active"),
            "last_completed": stories.get("last_completed"),
        }

    handoff_status = _build_handoff_status(repo_root, run, ledger)

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


def _success_envelope(
    *,
    command: str,
    timestamp: str,
    repo_root: Path,
    data: dict[str, Any],
) -> dict[str, Any]:
    return {
        "ok": True,
        "output_version": _OUTPUT_VERSION,
        "command": command,
        "timestamp": timestamp,
        "repo_root": str(repo_root),
        "data": data,
    }


def _error_envelope(
    *,
    command: str,
    timestamp: str,
    repo_root: Path,
    error: CliContractError,
) -> dict[str, Any]:
    return {
        "ok": False,
        "output_version": _OUTPUT_VERSION,
        "command": command,
        "timestamp": timestamp,
        "repo_root": str(repo_root),
        "error": {
            "code": error.code,
            "message": error.message,
            "details": error.details,
            "retryable": error.retryable,
        },
    }


def _emit_success(*, json_mode: bool, command: str, timestamp: str, repo_root: Path, data: dict[str, Any]) -> None:
    if json_mode:
        print(dump_json(_success_envelope(command=command, timestamp=timestamp, repo_root=repo_root, data=data)), end="")
        return
    print(_render_human_success(command=command, data=data), end="")


def _emit_error(*, json_mode: bool, command: str, timestamp: str, repo_root: Path, error: CliContractError, parser: PraxisArgumentParser) -> None:
    if json_mode:
        print(dump_json(_error_envelope(command=command, timestamp=timestamp, repo_root=repo_root, error=error)), end="")
        return
    parser.print_usage(sys.stderr)
    print(f"praxis: error [{error.code}]: {error.message}", file=sys.stderr)


def _render_human_success(*, command: str, data: dict[str, Any]) -> str:
    if command in {"run", "status", "continue", "resume", "dispatch", "submit-stage-result"}:
        run = data["run"]
        transition = data.get("transition_action")
        prefix = f"Praxis {command}"
        if transition is not None:
            prefix = f"{prefix} -> {transition}"
        return (
            f"{prefix}\n"
            f"run: {run['run_id']}\n"
            f"status: {run['run_status']}\n"
            f"stage: {run['current']['stage']}\n"
            f"next: {run['routing']['next_action']}\n"
        )
    if command == "build-worker-launch":
        launch = data["launch"]
        dispatch = launch["dispatch"]
        return (
            "Praxis build-worker-launch\n"
            f"adapter: {launch['adapter']}\n"
            f"stage: {dispatch['stage']}\n"
            f"worker: {launch['worker']['worker_id']}\n"
        )
    if command == "harness show-adapter":
        harness = data["harness"]
        return (
            "Praxis harness show-adapter\n"
            f"adapter: {harness['adapter']}\n"
            f"config: {harness['config_path']}\n"
            f"worker launch: {harness['worker_launch_command']}\n"
        )
    return f"Praxis {command} succeeded.\n"


def _normalize_resume_action(raw_action: str, repo_root: Path) -> str:
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
            exit_code=_BLOCKED_EXIT,
            details={"stop_reason_code": snapshot["routing"]["stop_reason_code"]},
            retryable=True,
        )
    if raw_action == "resume_inconsistent":
        raise CliContractError(
            code="invalid_run_state",
            message=snapshot["routing"]["reason"] or "Praxis resume found inconsistent durable state.",
            exit_code=_BLOCKED_EXIT,
            details={"stop_reason_code": snapshot["routing"]["stop_reason_code"]},
        )
    raise CliContractError(
        code="internal_error",
        message=f"Praxis resume returned an unsupported transition action: {raw_action}.",
        exit_code=_GENERIC_FAILURE_EXIT,
    )


def _normalize_dispatch_action(raw_action: str) -> str:
    if raw_action in {"launch_worker", "resume_fallback_relaunch"}:
        return raw_action
    if raw_action == "worker_resumed":
        return "launch_worker"
    raise CliContractError(
        code="internal_error",
        message=f"Praxis dispatch returned an unsupported transition action: {raw_action}.",
        exit_code=_GENERIC_FAILURE_EXIT,
    )


def _run_command(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    recover_pending_transaction(repo_root)
    if _run_path(repo_root).exists():
        raise CliContractError(
            code="run_already_exists",
            message="Praxis already has an active run in this repo.",
            exit_code=_BLOCKED_EXIT,
            details={"run_path": str(_run_path(repo_root))},
            retryable=True,
        )
    initialize_run(
        repo_root=repo_root,
        workflow=args.workflow,
        entry_task=args.entry_task,
        adapter=args.adapter,
        execution_mode=args.execution_mode,
        entrypoint=args.entrypoint,
        timestamp=timestamp,
    )
    return {"transition_action": "run_stage", "run": build_run_snapshot(repo_root)}


def _status_command(repo_root: Path) -> dict[str, Any]:
    return {"run": build_run_snapshot(repo_root)}


def _continue_command(repo_root: Path, timestamp: str) -> dict[str, Any]:
    run = _load_run_or_error(repo_root)
    next_action = run.get("routing", {}).get("next_action")
    if next_action != "confirm_then_run":
        raise CliContractError(
            code="blocked",
            message="Praxis can only continue when run.routing.next_action is 'confirm_then_run'.",
            exit_code=_BLOCKED_EXIT,
            details={"next_action": next_action},
            retryable=True,
        )
    action = continue_run(repo_root=repo_root, timestamp=timestamp)
    return {"transition_action": action, "run": build_run_snapshot(repo_root)}


def _resume_command(repo_root: Path, timestamp: str) -> dict[str, Any]:
    _load_run_or_error(repo_root)
    action = _normalize_resume_action(resume_run(repo_root=repo_root, timestamp=timestamp), repo_root)
    return {"transition_action": action, "run": build_run_snapshot(repo_root)}


def _dispatch_command(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    run = _load_run_or_error(repo_root)
    current_stage = run.get("current", {}).get("stage")
    if current_stage is None:
        raise CliContractError(
            code="invalid_run_state",
            message="Praxis cannot dispatch a worker without an active stage.",
            exit_code=_BLOCKED_EXIT,
        )
    next_action = run.get("routing", {}).get("next_action")
    if next_action != "run_stage":
        raise CliContractError(
            code="blocked",
            message="Praxis can only dispatch a worker when run.routing.next_action is 'run_stage'.",
            exit_code=_BLOCKED_EXIT,
            details={"next_action": next_action},
            retryable=True,
        )
    pending_action = run.get("routing", {}).get("pending_worker_action")
    if pending_action != "resume_or_launch":
        raise CliContractError(
            code="blocked",
            message="Praxis can only dispatch a worker when run.routing.pending_worker_action is 'resume_or_launch'.",
            exit_code=_BLOCKED_EXIT,
            details={"pending_worker_action": pending_action},
            retryable=True,
        )
    action = _normalize_dispatch_action(
        dispatch_worker(repo_root=repo_root, timestamp=timestamp, session_id=args.session_id)
    )
    return {"transition_action": action, "run": build_run_snapshot(repo_root)}


def _submit_stage_result_command(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    _load_run_or_error(repo_root)
    stage_result_path = _resolve_repo_path(repo_root, args.stage_result_path)
    if not stage_result_path.exists():
        raise CliContractError(
            code="missing_required_artifact",
            message=f"Praxis could not find the stage result artifact: {args.stage_result_path}.",
            exit_code=_INVALID_INPUT_EXIT,
            details={"path": str(stage_result_path)},
        )
    action = advance_run(
        repo_root=repo_root,
        stage_result_path=Path(args.stage_result_path),
        slice_map_path=Path(args.slice_map_path),
        commit_meta=_load_object_json_arg(repo_root, args.commit_meta_path, flag_name="--commit-meta-path"),
        handoff_data=_load_object_json_arg(repo_root, args.handoff_data_path, flag_name="--handoff-data-path"),
        dirty_paths=args.dirty_path or None,
        gate_failures=args.gate_failure or None,
        cancel_requested=args.cancel_requested,
        timestamp=timestamp,
    )
    return {"transition_action": action, "run": build_run_snapshot(repo_root)}


def _build_worker_launch_command(repo_root: Path) -> dict[str, Any]:
    run = _load_run_or_error(repo_root)
    if run.get("current", {}).get("stage") is None:
        raise CliContractError(
            code="invalid_run_state",
            message="Praxis cannot build a worker launch payload without an active stage.",
            exit_code=_BLOCKED_EXIT,
        )
    try:
        payload = build_worker_launch_payload(repo_root=repo_root)
    except FileNotFoundError as exc:
        raise CliContractError(
            code="missing_adapter_harness",
            message=str(exc),
            exit_code=_ENVIRONMENT_EXIT,
            details={"repo_root": str(repo_root)},
        ) from exc
    return {"launch": payload}


def _show_adapter_command(args: argparse.Namespace, repo_root: Path) -> dict[str, Any]:
    try:
        config_path, payload = load_adapter_harness(repo_root=repo_root, adapter=args.adapter)
    except FileNotFoundError as exc:
        raise CliContractError(
            code="missing_adapter_harness",
            message=str(exc),
            exit_code=_ENVIRONMENT_EXIT,
            details={"repo_root": str(repo_root), "adapter": args.adapter},
        ) from exc
    return {
        "harness": {
            "config_path": config_path,
            "adapter": payload["adapter"],
            "instructions_path": payload["instructions_path"],
            "project_config_path": payload["project_config_path"],
            "hooks_path": payload["hooks_path"],
            "agents_path": payload["agents_path"],
            "worker_launch_command": payload["worker_launch_command"],
            "extension_points": payload["extension_points"],
            "compatibility": payload.get("compatibility"),
        }
    }


def execute_command(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    if args.command == "run":
        return _run_command(args, repo_root, timestamp)
    if args.command == "status":
        return _status_command(repo_root)
    if args.command == "continue":
        return _continue_command(repo_root, timestamp)
    if args.command == "resume":
        return _resume_command(repo_root, timestamp)
    if args.command == "dispatch":
        return _dispatch_command(args, repo_root, timestamp)
    if args.command == "submit-stage-result":
        return _submit_stage_result_command(args, repo_root, timestamp)
    if args.command == "build-worker-launch":
        return _build_worker_launch_command(repo_root)
    if args.command == "harness" and args.harness_command == "show-adapter":
        return _show_adapter_command(args, repo_root)
    raise CliContractError(
        code="invalid_argument",
        message=f"Unsupported Praxis command: {_command_name(args)}.",
        exit_code=_INVALID_INPUT_EXIT,
    )


def _classify_unexpected_exception(command: str, exc: Exception) -> CliContractError:
    if isinstance(exc, CliContractError):
        return exc
    if isinstance(exc, ContractValidationError):
        return CliContractError(
            code="contract_validation_failed",
            message=str(exc),
            exit_code=_INVALID_INPUT_EXIT,
        )
    if isinstance(exc, RecoveryRequiredError):
        return CliContractError(
            code="environment_error",
            message=exc.message,
            exit_code=_ENVIRONMENT_EXIT,
            details={"recovery_code": exc.code},
            retryable=True,
        )
    if isinstance(exc, FileNotFoundError):
        code = "missing_required_artifact"
        exit_code = _INVALID_INPUT_EXIT
        if command in {"build-worker-launch", "harness show-adapter"}:
            code = "missing_adapter_harness"
            exit_code = _ENVIRONMENT_EXIT
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
                exit_code=_INVALID_INPUT_EXIT,
            )
        if "Cannot initialize a new run because .praxis/run.json already exists." in message:
            return CliContractError(
                code="run_already_exists",
                message="Praxis already has an active run in this repo.",
                exit_code=_BLOCKED_EXIT,
                retryable=True,
            )
        if "continue-run only applies" in message or "can only dispatch a worker when" in message:
            return CliContractError(
                code="blocked",
                message=message,
                exit_code=_BLOCKED_EXIT,
                retryable=True,
            )
        if "Cannot resume" in message or "Inconsistent durable state" in message:
            return CliContractError(
                code="invalid_run_state",
                message=message,
                exit_code=_BLOCKED_EXIT,
            )
        if "Unsupported" in message:
            return CliContractError(
                code="invalid_argument",
                message=message,
                exit_code=_INVALID_INPUT_EXIT,
            )
    if isinstance(exc, RuntimeError):
        return CliContractError(
            code="environment_error",
            message=str(exc),
            exit_code=_ENVIRONMENT_EXIT,
            retryable=True,
        )
    return CliContractError(
        code="internal_error",
        message=str(exc),
        exit_code=_GENERIC_FAILURE_EXIT,
        retryable=True,
    )


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    parser = build_parser()
    json_mode_requested = "--json" in argv
    timestamp = _utc_now()
    command = _guess_command(argv)
    repo_root = Path(".").resolve()

    try:
        args = parser.parse_args(argv)
        command = _command_name(args)
        repo_root = _resolve_repo_root(args)
        timestamp = _command_timestamp(args)
        _ensure_output_version(getattr(args, "output_version", _OUTPUT_VERSION))
        data = execute_command(args, repo_root, timestamp)
        _emit_success(
            json_mode=bool(getattr(args, "json", False)),
            command=command,
            timestamp=timestamp,
            repo_root=repo_root,
            data=data,
        )
        return 0
    except CliArgumentError as exc:
        error = CliContractError(
            code="invalid_argument",
            message=str(exc),
            exit_code=_INVALID_INPUT_EXIT,
        )
        _emit_error(
            json_mode=json_mode_requested,
            command=command,
            timestamp=timestamp,
            repo_root=repo_root,
            error=error,
            parser=parser,
        )
        return error.exit_code
    except Exception as exc:  # pragma: no cover - exercised through focused contract tests
        error = _classify_unexpected_exception(command, exc)
        _emit_error(
            json_mode=json_mode_requested,
            command=command,
            timestamp=timestamp,
            repo_root=repo_root,
            error=error,
            parser=parser,
        )
        return error.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
