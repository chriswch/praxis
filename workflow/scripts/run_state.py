from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .routing import resolve_next_stage_for_result, resolve_stop_reason_for_stage_result


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _state_snapshot(run: dict[str, Any]) -> dict[str, Any]:
    current = run.get("current", {})
    routing = run.get("routing", {})
    return {
        "run_status": run.get("status"),
        "current_scope": current.get("scope"),
        "current_slice_id": current.get("slice_id"),
        "current_stage": current.get("stage"),
        "next_action": routing.get("next_action"),
        "next_stage": routing.get("next_stage"),
        "next_slice_id": routing.get("next_slice_id"),
        "boundary_handoff_path": routing.get("boundary_handoff_path"),
        "stop_reason_code": routing.get("stop_reason_code"),
    }


def _validate_stage_alignment(run: dict[str, Any], stage_result: dict[str, Any]) -> None:
    current = run["current"]
    expected_stage = current.get("stage")
    current_artifact_dir = current.get("artifact_dir")
    result_stage = stage_result["stage"]
    result_artifact_dir = stage_result["artifact_dir"]

    if expected_stage != result_stage:
        raise ValueError(
            "Cannot update run state from an out-of-order stage result: "
            f"run.current.stage={expected_stage!r}, stage_result.stage={result_stage!r}."
        )

    if current_artifact_dir != result_artifact_dir:
        raise ValueError(
            "Cannot update run state from a different artifact scope: "
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


def _is_terminal_single_story(
    *,
    run: dict[str, Any],
    stage_result: dict[str, Any],
    next_stage: str | None,
) -> bool:
    if run["mode"] != "single_story":
        return False

    route_kind = stage_result["route"]["kind"]
    return route_kind == "done" or (route_kind == "proceed" and next_stage is None)


def _should_pause_for_confirmation(run: dict[str, Any], stage_result: dict[str, Any]) -> bool:
    workflow = run["workflow"]
    execution_mode = run.get("execution", {}).get("mode")
    stage_name = stage_result["stage"]

    if workflow == "craft":
        return execution_mode == "manual" and stage_result["status"] == "completed"

    if workflow == "forge":
        return bool(stage_result.get("needs_confirmation")) or stage_name == "clarifying-intent"

    raise ValueError(f"Unsupported workflow: {workflow!r}.")


def _default_reason(
    *,
    next_action: str,
    stage_name: str,
    next_stage: str | None,
) -> str:
    if next_action == "finish":
        return f"{stage_name} completed the run."
    if next_action == "run_stage":
        return f"{stage_name} completed. Continue to {next_stage}."
    if next_action == "confirm_then_run":
        return f"{stage_name} completed. Awaiting confirmation to run {next_stage}."
    if next_action == "ask_user":
        return f"{stage_name} cannot continue until the user responds."
    return f"{stage_name} updated the run state."


def update_run_from_stage_result(
    *,
    repo_root: Path,
    stage_result_path: Path,
    timestamp: str,
) -> str:
    repo_root = repo_root.resolve()
    run_path = repo_root / ".praxis" / "run.json"
    stage_result_full_path = repo_root / stage_result_path

    run = _load_json(run_path)
    stage_result = _load_json(stage_result_full_path)

    _validate_stage_alignment(run, stage_result)

    next_stage = resolve_next_stage_for_result(
        workflow=run["workflow"],
        stage_result=stage_result,
    )

    if _requires_boundary_transition(run=run, stage_result=stage_result, next_stage=next_stage):
        raise ValueError(
            "This stage result completes the current multi-slice story. "
            "Use workflow.scripts.story_boundary for the boundary transition."
        )

    route = stage_result["route"]
    stop_reason = resolve_stop_reason_for_stage_result(stage_result)
    action: str

    run["current"]["artifact_dir"] = stage_result["artifact_dir"]
    run["routing"]["next_slice_id"] = route.get("next_slice_id")
    run["routing"]["boundary_handoff_path"] = run["routing"].get("boundary_handoff_path")

    if _is_terminal_single_story(run=run, stage_result=stage_result, next_stage=next_stage):
        action = "finish"
        run["status"] = "completed"
        run["current"]["stage"] = None
        run["routing"]["next_action"] = "finish"
        run["routing"]["next_stage"] = None
        run["routing"]["stop_reason_code"] = None
    elif stop_reason is not None:
        action = "ask_user"
        reason_code, reason = stop_reason
        run["status"] = "waiting_for_user"
        run["current"]["stage"] = next_stage
        run["routing"]["next_action"] = "ask_user"
        run["routing"]["next_stage"] = next_stage
        run["routing"]["stop_reason_code"] = reason_code
        route["reason"] = route.get("reason") or reason
    elif _should_pause_for_confirmation(run, stage_result):
        action = "confirm_then_run"
        run["status"] = "waiting_for_user"
        run["current"]["stage"] = next_stage
        run["routing"]["next_action"] = "confirm_then_run"
        run["routing"]["next_stage"] = next_stage
        run["routing"]["stop_reason_code"] = None
    else:
        action = "run_stage"
        run["status"] = "running"
        run["current"]["stage"] = next_stage
        run["routing"]["next_action"] = "run_stage"
        run["routing"]["next_stage"] = next_stage
        run["routing"]["stop_reason_code"] = None

    run["routing"]["reason"] = route.get("reason") or _default_reason(
        next_action=run["routing"]["next_action"],
        stage_name=stage_result["stage"],
        next_stage=run["routing"]["next_stage"],
    )
    run["timestamps"]["updated_at"] = timestamp

    _write_json(run_path, run)
    return action


def _print_result(*, repo_root: Path, extra: dict[str, Any] | None = None) -> None:
    run = _load_json(repo_root / ".praxis" / "run.json")
    payload = _state_snapshot(run)
    if extra:
        payload.update(extra)
    print(json.dumps(payload, indent=2))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Update Praxis run state from a completed stage result.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    update_parser = subparsers.add_parser("update-run-from-stage-result")
    update_parser.add_argument("--repo-root", default=".")
    update_parser.add_argument("--stage-result-path", required=True)
    update_parser.add_argument("--timestamp")

    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    timestamp = args.timestamp or _utc_now()

    if args.command == "update-run-from-stage-result":
        action = update_run_from_stage_result(
            repo_root=repo_root,
            stage_result_path=Path(args.stage_result_path),
            timestamp=timestamp,
        )
        _print_result(
            repo_root=repo_root,
            extra={"command": args.command, "transition_action": action},
        )
        return 0

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
