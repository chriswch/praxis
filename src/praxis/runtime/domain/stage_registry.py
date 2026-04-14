from __future__ import annotations

from typing import Any

# Canonical stage metadata used by runtime planning/routing surfaces.
STAGE_REGISTRY: dict[str, dict[str, Any]] = {
    "clarifying-intent": {
        "permission_profile": "planning",
        "timeout_minutes": 20,
    },
    "slicing-stories": {
        "permission_profile": "planning",
        "timeout_minutes": 20,
    },
    "sketching-design": {
        "permission_profile": "design",
        "timeout_minutes": 30,
    },
    "driving-tdd": {
        "permission_profile": "implementation",
        "timeout_minutes": 90,
    },
    "rapid-implementing": {
        "permission_profile": "implementation",
        "timeout_minutes": 90,
    },
    "code-reviewing": {
        "permission_profile": "review",
        "timeout_minutes": 30,
    },
    "code-improving": {
        "permission_profile": "implementation",
        "timeout_minutes": 60,
    },
    "verifying-and-adapting": {
        "permission_profile": "verification",
        "timeout_minutes": 30,
    },
}


def all_stage_names() -> tuple[str, ...]:
    return tuple(STAGE_REGISTRY.keys())


def permission_profile_for_stage(stage: str | None, *, default: str = "implementation") -> str:
    if not isinstance(stage, str) or not stage:
        return default
    return str(STAGE_REGISTRY.get(stage, {}).get("permission_profile") or default)
