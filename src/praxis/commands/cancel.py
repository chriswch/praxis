from __future__ import annotations

import argparse
import os
import signal
import time
from pathlib import Path
from typing import Any

from praxis.commands._support import build_run_snapshot, load_run_or_error
from praxis.runtime.adapters.native_resume import worker_record_relpath
from praxis.runtime.state.durable_state import commit_transaction, dump_events, dump_json, extend_event_log, load_json, validate_state_payloads
from praxis.runtime.workers.planning import bump_transition_id, ensure_run_vnext_defaults
from praxis.runtime.workers.worktree import cleanup_isolated_worktree, isolated_worktree_relpath


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
    files: dict[str, str] = {
        ".praxis/events.jsonl": dump_events(events),
    }

    worker_id = run["current"].get("worker_id")
    if isinstance(worker_id, str) and worker_id:
        worker_rel = worker_record_relpath(worker_id)
        worker_path = repo_root / worker_rel
        if worker_path.exists():
            worker_record = load_json(worker_path)
            launcher_pid = worker_record.get("launcher_pid")
            if not isinstance(launcher_pid, int):
                launcher_pid = None
            _terminate_launcher_process(launcher_pid)
            worker_record["status"] = "cancelled"
            files[worker_rel] = dump_json(worker_record)

        worktree_path = repo_root / isolated_worktree_relpath(worker_id)
        if worktree_path.exists():
            try:
                cleanup_isolated_worktree(repo_root=repo_root, worker_id=worker_id)
                events.append(
                    {
                        "ts": timestamp,
                        "type": "worktree_cleaned",
                        "worker_id": worker_id,
                        "worktree_path": str(worktree_path),
                    }
                )
            except Exception as exc:
                events.append(
                    {
                        "ts": timestamp,
                        "type": "worktree_cleanup_failed",
                        "worker_id": worker_id,
                        "worktree_path": str(worktree_path),
                        "reason_code": "worktree_cleanup_failed",
                        "reason": str(exc),
                    }
                )
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
