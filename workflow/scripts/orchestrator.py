from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .durable_state import (
    commit_transaction,
    dump_events,
    dump_json,
    extend_event_log,
    inspect_handoff_file,
    load_json as _load_json,
    load_optional_json,
    recover_pending_transaction,
    validate_state_payloads,
)
from .routing import resolve_next_stage_for_result
from .run_state import update_run_from_stage_result
from .story_boundary import (
    activate_next_story_from_boundary,
    checkpoint_story_boundary,
    initialize_story_queue,
    pause_autopilot_for_stage_result,
    resume_story_run_from_disk,
)
from .trace_summary import build_trace_summary


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _run_path(repo_root: Path) -> Path:
    return repo_root / ".praxis" / "run.json"


def _ledger_path(repo_root: Path) -> Path:
    return repo_root / ".praxis" / "story-ledger.json"


def _validate_stage_alignment(run: dict[str, Any], stage_result: dict[str, Any]) -> None:
    current = run["current"]
    expected_stage = current.get("stage")
    current_artifact_dir = current.get("artifact_dir")
    result_stage = stage_result["stage"]
    result_artifact_dir = stage_result["artifact_dir"]

    if expected_stage != result_stage:
        raise ValueError(
            "Cannot advance the run from an out-of-order stage result: "
            f"run.current.stage={expected_stage!r}, stage_result.stage={result_stage!r}."
        )

    if current_artifact_dir != result_artifact_dir:
        raise ValueError(
            "Cannot advance the run from a different artifact scope: "
            f"run.current.artifact_dir={current_artifact_dir!r}, "
            f"stage_result.artifact_dir={result_artifact_dir!r}."
        )


def _requires_boundary_transition(
    *,
    run: dict[str, Any],
    stage_result: dict[str, Any],
    next_stage: str | None,
) -> bool:
    if run["mode"] != "multi_slice":
        return False

    route_kind = stage_result["route"]["kind"]
    if route_kind in {"done", "next_slice"}:
        return True

    return route_kind == "proceed" and next_stage is None


def _snapshot(repo_root: Path) -> dict[str, Any]:
    recover_pending_transaction(repo_root)
    run = _load_json(_run_path(repo_root))
    dispatch = build_dispatch(repo_root)
    payload = {
        "workflow": run.get("workflow"),
        "run_status": run.get("status"),
        "mode": run.get("mode"),
        "execution_mode": run.get("execution", {}).get("mode"),
        "current_scope": run.get("current", {}).get("scope"),
        "current_slice_id": run.get("current", {}).get("slice_id"),
        "current_stage": run.get("current", {}).get("stage"),
        "next_action": run.get("routing", {}).get("next_action"),
        "next_stage": run.get("routing", {}).get("next_stage"),
        "next_slice_id": run.get("routing", {}).get("next_slice_id"),
        "boundary_handoff_path": run.get("routing", {}).get("boundary_handoff_path"),
        "stop_reason_code": run.get("routing", {}).get("stop_reason_code"),
        "reason": run.get("routing", {}).get("reason"),
        "trace": build_trace_summary(repo_root=repo_root, dispatch=dispatch),
    }
    handoff_path = run.get("routing", {}).get("boundary_handoff_path")
    if handoff_path:
        payload["handoff_status"] = inspect_handoff_file(repo_root / handoff_path)
    if _ledger_path(repo_root).exists():
        ledger = _load_json(_ledger_path(repo_root))
        payload["ledger_active_story"] = ledger.get("stories", {}).get("active")
        payload["ledger_last_completed"] = ledger.get("stories", {}).get("last_completed")
        if "handoff_status" not in payload:
            active_story_id = ledger.get("stories", {}).get("active")
            if active_story_id:
                active_story = ledger.get("stories", {}).get("items", {}).get(active_story_id, {})
                carry_forward_from = active_story.get("carry_forward_from")
                if carry_forward_from:
                    handoff_path = ledger["stories"]["items"].get(carry_forward_from, {}).get("handoff_path")
                    if handoff_path:
                        payload["handoff_status"] = inspect_handoff_file(repo_root / handoff_path)
    return payload


def build_dispatch(repo_root: Path) -> dict[str, Any]:
    recover_pending_transaction(repo_root)
    run = _load_json(_run_path(repo_root))
    current = run["current"]
    routing = run["routing"]
    stage = routing.get("next_stage") or current.get("stage")
    artifact_dir = current.get("artifact_dir")

    dispatch = {
        "action": routing.get("next_action"),
        "workflow": run.get("workflow"),
        "adapter": run.get("runtime", {}).get("adapter"),
        "entrypoint": run.get("runtime", {}).get("entrypoint"),
        "scope": current.get("scope"),
        "slice_id": current.get("slice_id"),
        "artifact_dir": artifact_dir,
        "stage": stage,
        "boundary_handoff_path": routing.get("boundary_handoff_path"),
    }

    if stage is not None and artifact_dir:
        dispatch["stage_result_path"] = f"{artifact_dir}/results/{stage}.json"

    return dispatch


def _print_result(
    *,
    repo_root: Path,
    command: str,
    transition_action: str | None = None,
) -> None:
    payload = _snapshot(repo_root)
    payload["command"] = command
    payload["dispatch"] = payload["trace"]["dispatch"]
    if transition_action is not None:
        payload["transition_action"] = transition_action
    print(dump_json(payload), end="")


def _commit_run_only(*, repo_root: Path, run: dict[str, Any], timestamp: str, operation: str, metadata: dict[str, Any] | None = None) -> None:
    validate_state_payloads(run=run)
    commit_transaction(
        repo_root=repo_root,
        operation=operation,
        files={".praxis/run.json": dump_json(run)},
        timestamp=timestamp,
        metadata=metadata or {},
    )


def _resume_event(
    *,
    run: dict[str, Any],
    timestamp: str,
    source: str,
    resume_action: str,
) -> dict[str, Any]:
    current = run.get("current", {})
    routing = run.get("routing", {})
    runtime = run.get("runtime", {})
    return {
        "ts": timestamp,
        "type": "run_resumed",
        "adapter": runtime.get("adapter"),
        "source": source,
        "resume_action": resume_action,
        "scope": current.get("scope"),
        "slice_id": current.get("slice_id"),
        "artifact_dir": current.get("artifact_dir"),
        "stage": current.get("stage"),
        "boundary_handoff_path": routing.get("boundary_handoff_path"),
        "reason_code": routing.get("stop_reason_code"),
        "reason": routing.get("reason") or f"{source} restored the run cursor.",
    }


def _commit_run_with_events(
    *,
    repo_root: Path,
    run: dict[str, Any],
    timestamp: str,
    operation: str,
    new_events: list[dict[str, Any]],
    metadata: dict[str, Any] | None = None,
) -> None:
    events = extend_event_log(repo_root, new_events)
    validate_state_payloads(run=run, events=events)
    commit_transaction(
        repo_root=repo_root,
        operation=operation,
        files={
            ".praxis/run.json": dump_json(run),
            ".praxis/events.jsonl": dump_events(events),
        },
        timestamp=timestamp,
        metadata=metadata or {},
    )


def initialize_run(
    *,
    repo_root: Path,
    workflow: str,
    entry_task: str,
    adapter: str,
    execution_mode: str,
    entrypoint: str | None,
    timestamp: str,
) -> None:
    repo_root = repo_root.resolve()
    recover_pending_transaction(repo_root)
    run_path = _run_path(repo_root)

    if run_path.exists():
        raise ValueError("Cannot initialize a new run because .praxis/run.json already exists.")

    if workflow not in {"craft", "forge"}:
        raise ValueError(f"Unsupported workflow: {workflow!r}.")
    if adapter not in {"claude", "codex"}:
        raise ValueError(f"Unsupported adapter: {adapter!r}.")
    if execution_mode not in {"manual", "autopilot"}:
        raise ValueError(f"Unsupported execution mode: {execution_mode!r}.")

    praxis_dir = repo_root / ".praxis"
    praxis_dir.mkdir(parents=True, exist_ok=True)
    (praxis_dir / "results").mkdir(parents=True, exist_ok=True)

    run = {
        "version": 3,
        "workflow": workflow,
        "status": "running",
        "entry_task": entry_task,
        "mode": "single_story",
        "runtime": {
            "adapter": adapter,
            "entrypoint": entrypoint or f"praxis:{workflow}",
        },
        "execution": {
            "mode": execution_mode,
            "fresh_context_per_story": True,
        },
        "current": {
            "scope": "root",
            "slice_id": None,
            "artifact_dir": ".praxis",
            "stage": "clarifying-intent",
        },
        "routing": {
            "next_action": "run_stage",
            "next_stage": "clarifying-intent",
            "next_slice_id": None,
            "reason": "Run initialized. Start with clarifying-intent.",
            "stop_reason_code": None,
            "boundary_handoff_path": None,
        },
        "timestamps": {
            "created_at": timestamp,
            "updated_at": timestamp,
        },
    }

    _commit_run_only(
        repo_root=repo_root,
        run=run,
        timestamp=timestamp,
        operation="initialize_run",
        metadata={"workflow": workflow, "adapter": adapter},
    )


def advance_run(
    *,
    repo_root: Path,
    stage_result_path: Path,
    slice_map_path: Path,
    commit_meta: dict[str, Any] | None,
    handoff_data: dict[str, Any] | None,
    dirty_paths: list[str] | None,
    gate_failures: list[str] | None,
    cancel_requested: bool,
    timestamp: str,
) -> str:
    repo_root = repo_root.resolve()
    recover_pending_transaction(repo_root)
    run = _load_json(_run_path(repo_root))
    stage_result = _load_json(repo_root / stage_result_path)

    validate_state_payloads(run=run, stage_result=stage_result)
    _validate_stage_alignment(run, stage_result)

    if (
        stage_result["stage"] == "slicing-stories"
        and stage_result["data"]["outcome_code"] == "slice_map_ready"
    ):
        initialize_story_queue(
            repo_root=repo_root,
            slice_map_path=slice_map_path,
            execution_mode=run["execution"]["mode"],
            timestamp=timestamp,
        )
        if run["execution"]["mode"] == "manual":
            continue_pause_after_queue_init(repo_root=repo_root, timestamp=timestamp)
            return "confirm_then_run"
        return "initialize_story_queue"

    next_stage = resolve_next_stage_for_result(
        workflow=run["workflow"],
        stage_result=stage_result,
    )

    if _requires_boundary_transition(run=run, stage_result=stage_result, next_stage=next_stage):
        checkpoint_story_boundary(
            repo_root=repo_root,
            stage_result_path=stage_result_path,
            commit_meta=commit_meta,
            handoff_data=handoff_data or {},
            dirty_paths=dirty_paths,
            gate_failures=gate_failures,
            cancel_requested=cancel_requested,
            timestamp=timestamp,
        )
        return "checkpoint_story_boundary"

    if (
        run["mode"] == "multi_slice"
        and run.get("execution", {}).get("mode") == "autopilot"
        and pause_autopilot_for_stage_result(
            repo_root=repo_root,
            stage_result_path=stage_result_path,
            timestamp=timestamp,
        )
    ):
        return "ask_user"

    return update_run_from_stage_result(
        repo_root=repo_root,
        stage_result_path=stage_result_path,
        timestamp=timestamp,
    )


def continue_pause_after_queue_init(*, repo_root: Path, timestamp: str) -> None:
    repo_root = repo_root.resolve()
    recover_pending_transaction(repo_root)
    run = _load_json(_run_path(repo_root))

    run["status"] = "waiting_for_user"
    run["routing"]["next_action"] = "confirm_then_run"
    run["routing"]["next_stage"] = run["current"]["stage"]
    run["routing"]["next_slice_id"] = run["current"].get("slice_id")
    run["routing"]["stop_reason_code"] = None
    run["routing"]["reason"] = (
        f"Story queue initialized. Awaiting confirmation to begin {run['current']['slice_id']}."
    )
    run["timestamps"]["updated_at"] = timestamp

    _commit_run_only(
        repo_root=repo_root,
        run=run,
        timestamp=timestamp,
        operation="continue_pause_after_queue_init",
        metadata={"slice_id": run["current"].get("slice_id")},
    )


def continue_run(*, repo_root: Path, timestamp: str) -> str:
    repo_root = repo_root.resolve()
    recover_pending_transaction(repo_root)
    run = _load_json(_run_path(repo_root))

    if run["routing"]["next_action"] != "confirm_then_run":
        raise ValueError(
            "continue-run only applies when run.routing.next_action is 'confirm_then_run'."
        )

    ledger_path = _ledger_path(repo_root)
    if ledger_path.exists():
        ledger = _load_json(ledger_path)
        active_story_id = ledger.get("stories", {}).get("active")
        if active_story_id:
            active_story = ledger["stories"]["items"][active_story_id]
            if active_story["status"] == "active_next":
                activate_next_story_from_boundary(repo_root=repo_root, timestamp=timestamp)
                return "activate_next_story_from_boundary"

    next_stage = run["current"].get("stage")
    if next_stage is None:
        raise ValueError("Cannot continue a paused run without a current stage.")

    run["status"] = "running"
    run["routing"]["next_action"] = "run_stage"
    run["routing"]["next_stage"] = next_stage
    run["routing"]["next_slice_id"] = None
    run["routing"]["stop_reason_code"] = None
    run["routing"]["reason"] = f"Manual confirmation received. Continue to {next_stage}."
    run["timestamps"]["updated_at"] = timestamp

    _commit_run_with_events(
        repo_root=repo_root,
        run=run,
        timestamp=timestamp,
        operation="continue_run",
        new_events=[
            _resume_event(
                run=run,
                timestamp=timestamp,
                source="continue-run",
                resume_action="run_stage",
            )
        ],
        metadata={"next_stage": next_stage},
    )
    return "run_stage"


def resume_run(*, repo_root: Path, timestamp: str) -> str:
    repo_root = repo_root.resolve()
    recover_pending_transaction(repo_root)
    run = _load_json(_run_path(repo_root))

    if _ledger_path(repo_root).exists() and run["mode"] == "multi_slice":
        return resume_story_run_from_disk(repo_root=repo_root, timestamp=timestamp)

    next_action = run["routing"].get("next_action")
    current_stage = run["current"].get("stage")

    if run["status"] in {"completed", "cancelled"} or next_action in {"finish", "idle"}:
        run["timestamps"]["updated_at"] = timestamp
        _commit_run_with_events(
            repo_root=repo_root,
            run=run,
            timestamp=timestamp,
            operation="resume_terminal_run",
            new_events=[
                _resume_event(
                    run=run,
                    timestamp=timestamp,
                    source="resume-run",
                    resume_action="resume_terminal",
                )
            ],
            metadata={"status": run["status"]},
        )
        return "resume_terminal"

    if current_stage is None:
        raise ValueError("Cannot resume a non-terminal single-story run without a current stage.")

    if next_action == "confirm_then_run":
        run["status"] = "waiting_for_user"
        run["routing"]["next_stage"] = current_stage
        run["routing"]["next_slice_id"] = None
        run["routing"]["stop_reason_code"] = None
        run["routing"]["reason"] = f"Awaiting confirmation to continue to {current_stage}."
        run["timestamps"]["updated_at"] = timestamp
        _commit_run_with_events(
            repo_root=repo_root,
            run=run,
            timestamp=timestamp,
            operation="resume_waiting_confirmation",
            new_events=[
                _resume_event(
                    run=run,
                    timestamp=timestamp,
                    source="resume-run",
                    resume_action="resume_waiting_confirmation",
                )
            ],
            metadata={"current_stage": current_stage},
        )
        return "resume_waiting_confirmation"

    if next_action == "ask_user" or run["routing"].get("stop_reason_code"):
        run["status"] = "waiting_for_user"
        run["routing"]["next_action"] = "ask_user"
        run["routing"]["next_stage"] = current_stage
        run["timestamps"]["updated_at"] = timestamp
        _commit_run_with_events(
            repo_root=repo_root,
            run=run,
            timestamp=timestamp,
            operation="resume_waiting_single_story",
            new_events=[
                _resume_event(
                    run=run,
                    timestamp=timestamp,
                    source="resume-run",
                    resume_action="resume_waiting",
                )
            ],
            metadata={"current_stage": current_stage},
        )
        return "resume_waiting"

    run["status"] = "running"
    run["routing"]["next_action"] = "run_stage"
    run["routing"]["next_stage"] = current_stage
    run["routing"]["next_slice_id"] = None
    run["routing"]["stop_reason_code"] = None
    run["routing"]["reason"] = f"Resumed {run['workflow']} run from durable state."
    run["timestamps"]["updated_at"] = timestamp
    _commit_run_with_events(
        repo_root=repo_root,
        run=run,
        timestamp=timestamp,
        operation="resume_active_single_story",
        new_events=[
            _resume_event(
                run=run,
                timestamp=timestamp,
                source="resume-run",
                resume_action="resume_active",
            )
        ],
        metadata={"current_stage": current_stage},
    )
    return "resume_active"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Operate the shared Praxis workflow orchestrator.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("initialize-run")
    init_parser.add_argument("--repo-root", default=".")
    init_parser.add_argument("--workflow", choices=["craft", "forge"], required=True)
    init_parser.add_argument("--entry-task", required=True)
    init_parser.add_argument("--adapter", choices=["claude", "codex"], required=True)
    init_parser.add_argument("--execution-mode", choices=["manual", "autopilot"], default="manual")
    init_parser.add_argument("--entrypoint")
    init_parser.add_argument("--timestamp")

    advance_parser = subparsers.add_parser("advance-run")
    advance_parser.add_argument("--repo-root", default=".")
    advance_parser.add_argument("--stage-result-path", required=True)
    advance_parser.add_argument("--slice-map-path", default=".praxis/slice-map.json")
    advance_parser.add_argument("--commit-meta-path")
    advance_parser.add_argument("--handoff-data-path")
    advance_parser.add_argument("--dirty-path", action="append", default=[])
    advance_parser.add_argument("--gate-failure", action="append", default=[])
    advance_parser.add_argument("--cancel-requested", action="store_true")
    advance_parser.add_argument("--timestamp")

    continue_parser = subparsers.add_parser("continue-run")
    continue_parser.add_argument("--repo-root", default=".")
    continue_parser.add_argument("--timestamp")

    resume_parser = subparsers.add_parser("resume-run")
    resume_parser.add_argument("--repo-root", default=".")
    resume_parser.add_argument("--timestamp")

    show_parser = subparsers.add_parser("show-run")
    show_parser.add_argument("--repo-root", default=".")

    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    timestamp = getattr(args, "timestamp", None) or _utc_now()

    if args.command == "initialize-run":
        initialize_run(
            repo_root=repo_root,
            workflow=args.workflow,
            entry_task=args.entry_task,
            adapter=args.adapter,
            execution_mode=args.execution_mode,
            entrypoint=args.entrypoint,
            timestamp=timestamp,
        )
        _print_result(repo_root=repo_root, command=args.command, transition_action="run_stage")
        return 0

    if args.command == "advance-run":
        transition_action = advance_run(
            repo_root=repo_root,
            stage_result_path=Path(args.stage_result_path),
            slice_map_path=Path(args.slice_map_path),
            commit_meta=load_optional_json(args.commit_meta_path),
            handoff_data=load_optional_json(args.handoff_data_path),
            dirty_paths=args.dirty_path or None,
            gate_failures=args.gate_failure or None,
            cancel_requested=args.cancel_requested,
            timestamp=timestamp,
        )
        _print_result(
            repo_root=repo_root,
            command=args.command,
            transition_action=transition_action,
        )
        return 0

    if args.command == "continue-run":
        transition_action = continue_run(repo_root=repo_root, timestamp=timestamp)
        _print_result(
            repo_root=repo_root,
            command=args.command,
            transition_action=transition_action,
        )
        return 0

    if args.command == "resume-run":
        transition_action = resume_run(repo_root=repo_root, timestamp=timestamp)
        _print_result(
            repo_root=repo_root,
            command=args.command,
            transition_action=transition_action,
        )
        return 0

    if args.command == "show-run":
        _print_result(repo_root=repo_root, command=args.command)
        return 0

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
