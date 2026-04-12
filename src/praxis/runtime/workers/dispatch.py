from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from ..state.durable_state import load_json, recover_pending_transaction
from ..adapters.harness import build_worker_launch_payload, inspect_worker_launch_context
from ..adapters.native_launch import (
    derive_native_launch_failure_code,
    write_native_launch_failure,
    write_native_launch_record,
)
from ..adapters.provider_resume import attempt_provider_resume
from .planning import ensure_run_vnext_defaults


def _slug(value: str, *, fallback: str) -> str:
    candidate = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-._")
    return candidate or fallback


def _synthetic_session_id(*, adapter: str, worker_id: str, timestamp: str) -> str:
    compact_ts = re.sub(r"[^0-9A-Za-z]+", "", timestamp)
    worker_slug = _slug(worker_id, fallback="worker")
    return f"{adapter}-session-{compact_ts}-{worker_slug}"


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
    payload = build_worker_launch_payload(repo_root=repo_root)
    worker = payload["worker"]
    if worker["worker_class"] != "session_worker":
        raise ValueError(
            "Praxis only dispatches bounded background workers for 'session_worker' plans. "
            f"Got worker_class={worker['worker_class']!r}."
        )

    resume = payload["resume"]
    extra_events: list[dict[str, Any]] = []
    transition_action = "launch_worker"
    launch_source = "control_plane_launch"
    if (
        resume.get("strategy") == "prefer_resume_then_relaunch"
        and resume.get("session_id")
    ):
        resume["resume_attempted"] = True
        resume["mode"] = "headless"
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

    hook_request = {
        "session_id": session_id
        or _synthetic_session_id(
            adapter=payload["adapter"],
            worker_id=worker["worker_id"],
            timestamp=timestamp,
        ),
        "source": launch_source,
        "cwd": str(repo_root),
    }

    try:
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
        raise

    return transition_action
