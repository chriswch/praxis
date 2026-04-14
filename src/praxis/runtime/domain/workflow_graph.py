from __future__ import annotations

from typing import Any

_WORKFLOW_ROUTES: dict[str, dict[str, dict[str, tuple[str, str | None]]]] = {
    "craft": {
        "clarifying-intent": {
            "trivial_change": ("done", None),
            "bug_fix_ready": ("proceed", "driving-tdd"),
            "story_spec_ready": ("proceed", "sketching-design"),
            "feature_brief_ready": ("proceed", "slicing-stories"),
            "clarification_needed": ("ask_user", "clarifying-intent"),
        },
        "slicing-stories": {
            "slice_map_ready": ("proceed", "clarifying-intent"),
            "blocking_questions": ("ask_user", "slicing-stories"),
        },
        "sketching-design": {
            "sketch_ready": ("proceed", "driving-tdd"),
            "sketch_skipped": ("proceed", "driving-tdd"),
            "spec_issue": ("ask_user", "clarifying-intent"),
        },
        "driving-tdd": {
            "tdd_complete": ("proceed", "code-reviewing"),
            "spec_feedback": ("ask_user", "clarifying-intent"),
        },
        "code-reviewing": {
            "review_ready": ("proceed", "code-improving"),
            "review_skipped": ("proceed", "verifying-and-adapting"),
        },
        "code-improving": {
            "improvement_ready": ("proceed", "verifying-and-adapting"),
            "improvement_skipped": ("proceed", "verifying-and-adapting"),
            "spec_feedback": ("ask_user", "clarifying-intent"),
        },
        "verifying-and-adapting": {
            "done": ("done", None),
            "next_slice": ("next_slice", "clarifying-intent"),
            "rework": ("rework", "driving-tdd"),
            "escalate": ("escalate", "clarifying-intent"),
        },
    },
    "forge": {
        "clarifying-intent": {
            "trivial_change": ("done", None),
            "bug_fix_ready": ("proceed", "rapid-implementing"),
            "story_spec_ready": ("proceed", "sketching-design"),
            "feature_brief_ready": ("proceed", "slicing-stories"),
            "clarification_needed": ("ask_user", "clarifying-intent"),
        },
        "slicing-stories": {
            "slice_map_ready": ("proceed", "clarifying-intent"),
            "blocking_questions": ("ask_user", "slicing-stories"),
        },
        "sketching-design": {
            "sketch_ready": ("proceed", "rapid-implementing"),
            "sketch_skipped": ("proceed", "rapid-implementing"),
            "spec_issue": ("ask_user", "clarifying-intent"),
        },
        "rapid-implementing": {
            "implementation_complete": ("proceed", "code-reviewing"),
            "spec_feedback": ("ask_user", "clarifying-intent"),
        },
        "code-reviewing": {
            "review_ready": ("proceed", "code-improving"),
            "review_skipped": ("proceed", None),
        },
        "code-improving": {
            "improvement_ready": ("proceed", None),
            "improvement_skipped": ("proceed", None),
            "spec_feedback": ("ask_user", "clarifying-intent"),
        },
    },
}


def resolve_route(*, workflow: str, stage: str, outcome_code: str) -> tuple[str, str | None]:
    try:
        return _WORKFLOW_ROUTES[workflow][stage][outcome_code]
    except KeyError as exc:
        raise ValueError(
            "Unsupported stage result routing combination: "
            f"workflow={workflow!r}, stage={stage!r}, outcome_code={outcome_code!r}."
        ) from exc


def resolve_next_stage(*, workflow: str, stage: str, outcome_code: str) -> str | None:
    _, next_stage = resolve_route(workflow=workflow, stage=stage, outcome_code=outcome_code)
    return next_stage


def resolve_route_kind(*, workflow: str, stage: str, outcome_code: str) -> str:
    route_kind, _ = resolve_route(workflow=workflow, stage=stage, outcome_code=outcome_code)
    return route_kind


def available_routes() -> dict[str, dict[str, dict[str, tuple[str, str | None]]]]:
    return _WORKFLOW_ROUTES
