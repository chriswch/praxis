from __future__ import annotations

from pathlib import Path
from typing import Any

from .durable_state import load_events, load_json


_BOUNDARY_EVENT_TYPES = {
    "boundary_started",
    "boundary_blocked",
    "boundary_checkpointed",
    "story_activated",
    "story_activation_cancelled",
}

_STOP_EVENT_TYPES = {
    "autopilot_stopped",
    "resume_blocked",
    "resume_failed",
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

    return {
        "dispatch": dispatch,
        "event_count": len(events),
        "last_event_type": events[-1]["type"] if events else None,
        "last_boundary_event": _last_event(events, _BOUNDARY_EVENT_TYPES),
        "last_stop_event": _last_event(events, _STOP_EVENT_TYPES),
        "stop_reason_code": run.get("routing", {}).get("stop_reason_code"),
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
