from __future__ import annotations

from pathlib import Path
from typing import Any

from ..state.durable_state import load_events, load_json


_BOUNDARY_EVENT_TYPES = {
    "boundary_started",
    "boundary_blocked",
    "boundary_checkpointed",
    "story_activated",
    "story_activation_cancelled",
}

_LAUNCH_EVENT_TYPES = {
    "native_launch_recorded",
    "native_launch_failed",
}

_HANDOFF_EVENT_TYPES = {
    "handoff_validated",
}

_RESUME_EVENT_TYPES = {
    "run_resumed",
    "story_activated",
    "provider_resume_succeeded",
    "worker_resumed",
    "resume_fallback_used",
}

_RECOVERY_SIGNAL_EVENT_TYPES = {
    "run_resumed",
    "story_activated",
    "provider_resume_succeeded",
    "worker_resumed",
    "resume_fallback_used",
    "native_launch_recorded",
}

_STOP_EVENT_TYPES = {
    "boundary_blocked",
    "autopilot_stopped",
    "resume_blocked",
    "resume_failed",
    "provider_resume_failed",
    "story_activation_cancelled",
    "native_launch_failed",
}


def build_trace_summary(
    *,
    repo_root: Path,
    dispatch: dict[str, Any],
    recovery_result: str | None = None,
) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    run = load_json(repo_root / ".praxis" / "run.json")
    events = load_events(repo_root / ".praxis" / "events.jsonl")
    last_stop_event = _last_event(events, _STOP_EVENT_TYPES)
    last_resume_event = _last_event(events, _RESUME_EVENT_TYPES)
    last_launch_event = _last_event(events, _LAUNCH_EVENT_TYPES)

    return {
        "dispatch": dispatch,
        "event_count": len(events),
        "last_event_type": events[-1]["type"] if events else None,
        "last_boundary_event": _last_event(events, _BOUNDARY_EVENT_TYPES),
        "last_launch_event": last_launch_event,
        "last_handoff_event": _last_event(events, _HANDOFF_EVENT_TYPES),
        "last_resume_event": last_resume_event,
        "last_stop_event": last_stop_event,
        "stop_reason_code": _current_stop_reason_code(
            run=run,
            events=events,
            last_stop_event=last_stop_event,
        ),
        "recovery": {
            "pending": (repo_root / ".praxis" / "recovery.json").exists(),
            "result": recovery_result or "none",
        },
    }


def _last_event(events: list[dict[str, Any]], event_types: set[str]) -> dict[str, Any] | None:
    for event in reversed(events):
        if event.get("type") in event_types:
            return event
    return None


def _current_stop_reason_code(
    *,
    run: dict[str, Any],
    events: list[dict[str, Any]],
    last_stop_event: dict[str, Any] | None,
) -> str | None:
    if last_stop_event is None:
        return run.get("routing", {}).get("stop_reason_code")

    last_recovery_signal = _last_event(events, _RECOVERY_SIGNAL_EVENT_TYPES)
    if last_recovery_signal is not None and last_recovery_signal.get("ts", "") > last_stop_event.get("ts", ""):
        return None
    return last_stop_event.get("reason_code")
