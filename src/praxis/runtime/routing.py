from __future__ import annotations

from typing import Any

from .domain.workflow_graph import resolve_route


def resolve_next_stage_for_result(*, workflow: str, stage_result: dict[str, Any]) -> str | None:
    stage = stage_result["stage"]
    route_kind = stage_result["route"]["kind"]
    outcome_code = stage_result["data"]["outcome_code"]
    recorded_next_stage = stage_result["route"].get("next_stage")

    expected_route_kind, resolved_next_stage = resolve_route(
        workflow=workflow,
        stage=stage,
        outcome_code=outcome_code,
    )

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
