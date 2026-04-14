from __future__ import annotations

import os
import re
import shlex
import subprocess
from pathlib import Path
from typing import Any

from ..state.durable_state import commit_transaction, dump_events, dump_json, extend_event_log, load_json, recover_pending_transaction
from ..adapters.harness import compile_dispatch_bundle, inspect_worker_launch_context
from ..dispatch_records import build_updated_dispatch_record
from ..adapters.native_launch import (
    derive_native_launch_failure_code,
    write_native_launch_failure,
    write_native_launch_record,
)
from ..adapters.provider_resume import attempt_provider_resume
from .planning import ensure_run_vnext_defaults
from .worktree import cleanup_isolated_worktree_event, ensure_isolated_worktree


def _slug(value: str, *, fallback: str) -> str:
    candidate = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-._")
    return candidate or fallback


def _synthetic_session_id(*, adapter: str, worker_id: str, timestamp: str) -> str:
    compact_ts = re.sub(r"[^0-9A-Za-z]+", "", timestamp)
    worker_slug = _slug(worker_id, fallback="worker")
    return f"{adapter}-session-{compact_ts}-{worker_slug}"


def _persist_launch_payload(
    *,
    repo_root: Path,
    payload: dict[str, Any],
    timestamp: str,
    dispatch_record: dict[str, Any] | None = None,
) -> str:
    relpath = payload["bundle"]["worker_launch_path"]
    files = {relpath: dump_json(payload)}
    if dispatch_record is not None:
        files[payload["bundle"]["dispatch_record_path"]] = dump_json(dispatch_record)
    commit_transaction(
        repo_root=repo_root,
        operation="update_worker_launch_payload",
        files=files,
        timestamp=timestamp,
        metadata={"dispatch_id": payload["bundle"]["dispatch_id"]},
    )
    return relpath


def _launch_surface(adapter: str) -> str:
    if adapter == "codex":
        return "codex_exec"
    if adapter == "claude":
        return "claude_print"
    return "native_launcher"


def _launch_worker_process(
    *,
    repo_root: Path,
    command: str,
    payload_relpath: str,
) -> int:
    env = os.environ.copy()
    env["PRAXIS_WORKER_PAYLOAD_PATH"] = payload_relpath
    process = subprocess.Popen(
        shlex.split(command),
        cwd=repo_root,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
        start_new_session=True,
    )
    # The launcher becomes an independent background process; suppress subprocess
    # finalizer warnings in the short-lived dispatch command.
    process._child_created = False  # type: ignore[attr-defined]
    return int(process.pid)


def _resume_fallback_event(
    *,
    payload: dict[str, Any],
    recorded_at: str,
    reason_code: str,
    reason: str,
    resume_record_path: str | None = None,
) -> dict[str, Any]:
    dispatch = payload["dispatch"]
    worker = payload["worker"]
    resume = payload["resume"]
    event = {
        "ts": recorded_at,
        "type": "resume_fallback_used",
        "adapter": payload["adapter"],
        "scope": dispatch["scope"],
        "slice_id": dispatch["slice_id"],
        "artifact_dir": dispatch["artifact_dir"],
        "stage": dispatch["stage"],
        "boundary_handoff_path": dispatch["boundary_handoff_path"],
        "worker_id": worker["worker_id"],
        "previous_session_id": resume.get("session_id"),
        "resume_strategy": resume.get("strategy"),
        "reason_code": reason_code,
        "reason": reason,
    }
    if resume_record_path is not None:
        event["resume_record_path"] = resume_record_path
    return event


def _record_cleanup_event(*, repo_root: Path, event: dict[str, Any], timestamp: str) -> None:
    events = extend_event_log(repo_root, [event])
    commit_transaction(
        repo_root=repo_root,
        operation="record_worktree_cleanup_event",
        files={".praxis/events.jsonl": dump_events(events)},
        timestamp=timestamp,
        metadata={"worker_id": event.get("worker_id"), "event_type": event.get("type")},
    )


def dispatch_worker(*, repo_root: Path, timestamp: str, session_id: str | None = None) -> str:
    repo_root = repo_root.resolve()
    recover_pending_transaction(repo_root)

    run = load_json(repo_root / ".praxis" / "run.json")
    ensure_run_vnext_defaults(run)
    pending_worker_action = run.get("routing", {}).get("pending_worker_action")
    next_action = run.get("routing", {}).get("next_action")

    if run.get("current", {}).get("stage") is None:
        raise ValueError("Cannot dispatch a worker without an active stage.")
    if next_action != "run_stage":
        raise ValueError(
            "Praxis can only dispatch a worker when run.routing.next_action is 'run_stage'."
        )
    if pending_worker_action != "resume_or_launch":
        raise ValueError(
            "Praxis can only dispatch a worker when run.routing.pending_worker_action "
            f"is 'resume_or_launch', got {pending_worker_action!r}."
        )

    launch_context = inspect_worker_launch_context(repo_root=repo_root)
    planned_worker = launch_context.get("worker_plan") or {}
    if planned_worker.get("worker_class") not in {"session_worker", "worktree_worker"}:
        raise ValueError(
            "Praxis only dispatches bounded background workers for 'session_worker' or 'worktree_worker' plans. "
            f"Got worker_class={planned_worker.get('worker_class')!r}."
        )

    compiled_bundle = compile_dispatch_bundle(repo_root=repo_root)
    payload = compiled_bundle["launch"]
    worker = payload["worker"]

    resume = payload["resume"]
    extra_events: list[dict[str, Any]] = []
    transition_action = "launch_worker"
    launch_source = "control_plane_launch"
    worktree_path = repo_root
    if (
        resume.get("strategy") == "prefer_resume_then_relaunch"
        and resume.get("session_id")
    ):
        resume["resume_attempted"] = True
        resume["mode"] = "headless"
        pending_resume_dispatch = build_updated_dispatch_record(
            repo_root=repo_root,
            dispatch_record_path=payload["bundle"]["dispatch_record_path"],
            status="provider_resume_requested",
            recorded_at=timestamp,
            reason_code="provider_resume_requested",
            reason="Praxis is attempting provider-native resume before falling back to a fresh launch if needed.",
        )
        _persist_launch_payload(
            repo_root=repo_root,
            payload=payload,
            timestamp=timestamp,
            dispatch_record=pending_resume_dispatch,
        )
        result = attempt_provider_resume(
            repo_root=repo_root,
            payload=payload,
            timestamp=timestamp,
        )
        if result["status"] == "resumed":
            return "worker_resumed"
        if result["status"] == "failed":
            raise RuntimeError(result["reason"])

        reason_code = str(result.get("reason_code") or "provider_resume_failed")
        reason = str(result.get("reason") or "Provider-native resume fell back to a fresh launch.")
        resume["resume_outcome"] = "resume_fallback_to_relaunch"
        extra_events.append(
            _resume_fallback_event(
                payload=payload,
                recorded_at=timestamp,
                reason_code=reason_code,
                reason=reason,
                resume_record_path=result.get("resume_record_path"),
            )
        )
        transition_action = "resume_fallback_relaunch"
        launch_source = "control_plane_resume_fallback"

    if worker["worktree_mode"] == "isolated":
        worktree_path = ensure_isolated_worktree(
            repo_root=repo_root,
            worker_id=worker["worker_id"],
            payload=payload,
        )

    payload_relpath = payload["bundle"]["worker_launch_path"]
    if resume.get("resume_attempted") or resume.get("resume_outcome"):
        payload_relpath = _persist_launch_payload(repo_root=repo_root, payload=payload, timestamp=timestamp)
    launch_surface = _launch_surface(payload["adapter"])

    hook_request = {
        "session_id": session_id
        or _synthetic_session_id(
            adapter=payload["adapter"],
            worker_id=worker["worker_id"],
            timestamp=timestamp,
        ),
        "source": launch_source,
        "cwd": str(worktree_path),
        "launch_surface": launch_surface,
    }

    try:
        launcher_pid = _launch_worker_process(
            repo_root=repo_root,
            command=payload["harness"]["worker_launch_command"],
            payload_relpath=payload_relpath,
        )
        hook_request["launcher_pid"] = launcher_pid
        write_native_launch_record(
            repo_root=repo_root,
            payload=payload,
            hook_request=hook_request,
            recorded_at=timestamp,
            handoff_status=launch_context.get("handoff_status"),
            extra_events=extra_events,
        )
    except Exception as exc:
        write_native_launch_failure(
            repo_root=repo_root,
            launch_context=launch_context,
            hook_request=hook_request,
            recorded_at=timestamp,
            reason_code=derive_native_launch_failure_code(
                handoff_status=launch_context.get("handoff_status"),
                exc=exc,
            ),
            reason=str(exc),
            extra_events=extra_events,
        )
        if worker["worktree_mode"] == "isolated":
            cleanup_event = cleanup_isolated_worktree_event(
                repo_root=repo_root,
                worker_id=worker["worker_id"],
                recorded_at=timestamp,
            )
            if cleanup_event is not None:
                _record_cleanup_event(repo_root=repo_root, event=cleanup_event, timestamp=timestamp)
        raise

    return transition_action
