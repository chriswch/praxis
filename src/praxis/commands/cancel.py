from __future__ import annotations

import argparse
import os
import signal
import time
from pathlib import Path
from typing import Any

from praxis.commands._support import build_run_snapshot, load_run_or_error
from praxis.runtime.adapters.runtime_contract import get_adapter_runtime
from praxis.runtime.approval_records import build_approval_record
from praxis.runtime.adapters.native_resume import session_record_relpath, worker_record_relpath
from praxis.runtime.state.durable_state import commit_transaction, dump_events, dump_json, extend_event_log, load_json, validate_state_payloads
from praxis.runtime.workers.planning import bump_transition_id, ensure_run_vnext_defaults
from praxis.runtime.workers.worktree import cleanup_isolated_worktree_event, isolated_worktree_relpath


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


def _pid_running(pid: int | None) -> bool:
    if pid is None or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def _terminate_launcher_process(launcher_pid: int | None) -> None:
    if not _pid_running(launcher_pid):
        return
    assert launcher_pid is not None
    try:
        os.killpg(launcher_pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    deadline = time.time() + 0.5
    while time.time() < deadline:
        if not _pid_running(launcher_pid):
            return
        time.sleep(0.05)
    try:
        os.killpg(launcher_pid, signal.SIGKILL)
    except ProcessLookupError:
        return


def handle(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    run = load_run_or_error(repo_root)
    ensure_run_vnext_defaults(run)

    if run.get("status") in {"completed", "cancelled", "failed"} or run.get("routing", {}).get("next_action") in {"finish", "idle"}:
        return {"transition_action": "finish", "run": build_run_snapshot(repo_root)}

    reason = args.reason or "Operator cancelled the active Praxis run."
    event = _cancel_event(run=run, timestamp=timestamp, reason=reason)
    events = extend_event_log(repo_root, [event])
    approval_rel, approval_record = build_approval_record(
        run=run,
        recorded_at=timestamp,
        decision="denied",
        source="cancel",
        reason_code="approval_denied",
        reason=reason,
    )
    files: dict[str, str] = {
        ".praxis/events.jsonl": dump_events(events),
        approval_rel: dump_json(approval_record),
    }

    worker_id = run["current"].get("worker_id")
    session_record = None
    worker_record = None
    if isinstance(worker_id, str) and worker_id:
        worker_rel = worker_record_relpath(worker_id)
        worker_path = repo_root / worker_rel
        if worker_path.exists():
            worker_record = load_json(worker_path)
            launcher_pid = worker_record.get("launcher_pid")
            if not isinstance(launcher_pid, int):
                launcher_pid = None
            session_id = worker_record.get("session_id")
            if isinstance(session_id, str) and session_id:
                session_path = repo_root / session_record_relpath(run["runtime"]["adapter"], session_id)
                if session_path.exists():
                    session_record = load_json(session_path)

            cancel_result = get_adapter_runtime(run["runtime"]["adapter"]).cancel(
                repo_root=repo_root,
                session_record=session_record,
                worker_record=worker_record,
                reason=reason,
            )
            events.append(
                {
                    "ts": timestamp,
                    "type": "adapter_cancel_attempted",
                    "adapter": run["runtime"]["adapter"],
                    "worker_id": worker_id,
                    "reason_code": cancel_result["reason_code"],
                    "reason": cancel_result["reason"],
                    "status": cancel_result["status"],
                }
            )
            if cancel_result["status"] != "succeeded":
                _terminate_launcher_process(launcher_pid)
                events.append(
                    {
                        "ts": timestamp,
                        "type": "adapter_cancel_fallback",
                        "adapter": run["runtime"]["adapter"],
                        "worker_id": worker_id,
                        "reason_code": "local_process_terminated",
                        "reason": "Praxis fell back to local process-group termination after the adapter-native cancel path was unavailable.",
                    }
                )
            worker_record["status"] = "cancelled"
            files[worker_rel] = dump_json(worker_record)
            files[".praxis/events.jsonl"] = dump_events(events)

        worktree_path = repo_root / isolated_worktree_relpath(worker_id)
        if worktree_path.exists():
            cleanup_event = cleanup_isolated_worktree_event(
                repo_root=repo_root,
                worker_id=worker_id,
                recorded_at=timestamp,
            )
            if cleanup_event is not None:
                events.append(cleanup_event)
            files[".praxis/events.jsonl"] = dump_events(events)

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
    files[".praxis/run.json"] = dump_json(run)
    commit_transaction(
        repo_root=repo_root,
        operation="cancel_run",
        files=files,
        timestamp=timestamp,
        metadata={"reason_code": "cancelled"},
    )
    return {"transition_action": "finish", "run": build_run_snapshot(repo_root)}
