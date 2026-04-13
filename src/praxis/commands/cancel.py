from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from praxis.commands._support import build_run_snapshot, load_run_or_error
from praxis.runtime.state.durable_state import commit_transaction, dump_events, dump_json, extend_event_log, validate_state_payloads
from praxis.runtime.workers.planning import bump_transition_id, ensure_run_vnext_defaults


def _cancel_event(*, run: dict[str, Any], timestamp: str, reason: str) -> dict[str, Any]:
    current = run.get("current", {})
    runtime = run.get("runtime", {})
    return {
        "ts": timestamp,
        "type": "run_cancelled",
        "adapter": runtime.get("adapter"),
        "scope": current.get("scope"),
        "slice_id": current.get("slice_id"),
        "artifact_dir": current.get("artifact_dir"),
        "stage": current.get("stage"),
        "boundary_handoff_path": run.get("routing", {}).get("boundary_handoff_path"),
        "reason_code": "cancelled",
        "reason": reason,
    }


def handle(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    run = load_run_or_error(repo_root)
    ensure_run_vnext_defaults(run)

    if run.get("status") in {"completed", "cancelled", "failed"} or run.get("routing", {}).get("next_action") in {"finish", "idle"}:
        return {"transition_action": "finish", "run": build_run_snapshot(repo_root)}

    reason = args.reason or "Operator cancelled the active Praxis run."
    event = _cancel_event(run=run, timestamp=timestamp, reason=reason)
    events = extend_event_log(repo_root, [event])

    run["status"] = "cancelled"
    run["current"]["stage"] = None
    run["current"]["worker_id"] = None
    run["current"]["session_id"] = None
    run["routing"]["next_action"] = "finish"
    run["routing"]["next_stage"] = None
    run["routing"]["next_slice_id"] = None
    run["routing"]["stop_reason_code"] = "cancelled"
    run["routing"]["reason"] = reason
    run["routing"]["pending_worker_action"] = None
    run["routing"]["resume_strategy"] = None
    run["timestamps"]["updated_at"] = timestamp
    bump_transition_id(run)

    validate_state_payloads(run=run, events=events)
    commit_transaction(
        repo_root=repo_root,
        operation="cancel_run",
        files={
            ".praxis/run.json": dump_json(run),
            ".praxis/events.jsonl": dump_events(events),
        },
        timestamp=timestamp,
        metadata={"reason_code": "cancelled"},
    )
    return {"transition_action": "finish", "run": build_run_snapshot(repo_root)}
