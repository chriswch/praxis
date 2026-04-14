from __future__ import annotations

from typing import Any


def validate_stage_alignment(
    run: dict[str, Any],
    stage_result: dict[str, Any],
    *,
    context: str = "advance",
) -> None:
    current = run["current"]
    expected_stage = current.get("stage")
    current_artifact_dir = current.get("artifact_dir")
    result_stage = stage_result["stage"]
    result_artifact_dir = stage_result["artifact_dir"]

    if expected_stage != result_stage:
        raise ValueError(
            f"Cannot {context} from an out-of-order stage result: "
            f"run.current.stage={expected_stage!r}, stage_result.stage={result_stage!r}."
        )

    if current_artifact_dir != result_artifact_dir:
        raise ValueError(
            f"Cannot {context} from a different artifact scope: "
            f"run.current.artifact_dir={current_artifact_dir!r}, "
            f"stage_result.artifact_dir={result_artifact_dir!r}."
        )


def requires_boundary_transition(
    *,
    run_mode: str,
    route_kind: str,
    next_stage: str | None,
) -> bool:
    if run_mode != "multi_slice":
        return False
    if route_kind in {"done", "next_slice"}:
        return True
    return route_kind == "proceed" and next_stage is None


def should_clear_boundary_handoff(
    *,
    current_scope: str | None,
    result_stage: str,
    boundary_handoff_path: str | None,
    next_stage: str | None,
) -> bool:
    if current_scope != "slice":
        return False
    if result_stage != "clarifying-intent":
        return False
    if not boundary_handoff_path:
        return False
    return next_stage != "clarifying-intent"
