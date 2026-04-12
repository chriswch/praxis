from __future__ import annotations

from typing import Any, Optional, Tuple


RouteRule = Tuple[str, Optional[str]]
WorkflowRouteTable = dict[str, dict[str, dict[str, RouteRule]]]


# Shared workflow routing owns next-stage resolution. Stage skills report
# route.kind and outcome_code; the orchestrator derives next_stage here.
_ROUTE_RULES: WorkflowRouteTable = {
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


def resolve_next_stage_for_result(*, workflow: str, stage_result: dict[str, Any]) -> str | None:
    stage = stage_result["stage"]
    route_kind = stage_result["route"]["kind"]
    outcome_code = stage_result["data"]["outcome_code"]
    recorded_next_stage = stage_result["route"].get("next_stage")

    try:
        expected_route_kind, resolved_next_stage = _ROUTE_RULES[workflow][stage][outcome_code]
    except KeyError as exc:
        raise ValueError(
            "No shared routing rule for "
            f"workflow={workflow!r}, stage={stage!r}, outcome_code={outcome_code!r}."
        ) from exc

    if route_kind != expected_route_kind:
        raise ValueError(
            "Shared routing expected "
            f"route.kind={expected_route_kind!r} for workflow={workflow!r}, "
            f"stage={stage!r}, outcome_code={outcome_code!r}, got {route_kind!r}."
        )

    if recorded_next_stage not in {None, resolved_next_stage}:
        raise ValueError(
            "Stage result next_stage drifted from shared routing: "
            f"workflow={workflow!r}, stage={stage!r}, outcome_code={outcome_code!r}, "
            f"expected {resolved_next_stage!r}, got {recorded_next_stage!r}."
        )

    return resolved_next_stage


def resolve_stop_reason_for_stage_result(stage_result: dict[str, Any]) -> tuple[str, str] | None:
    if stage_result.get("needs_user_input"):
        return (
            "needs_user_input",
            stage_result["route"].get("reason")
            or "Progress paused because user input is required.",
        )

    route_kind = stage_result["route"]["kind"]
    route_codes = {
        "ask_user": "route_ask_user",
        "rework": "route_rework",
        "escalate": "route_escalate",
    }
    if route_kind in route_codes:
        return (
            route_codes[route_kind],
            stage_result["route"].get("reason")
            or f"Progress paused on route {route_kind}.",
        )

    return None
