from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .state.contract_validation import ContractValidationError, validate_contract_payload


HANDOFF_POLICY = {
    "max_summary_chars": 480,
    "max_carry_forward_items": 5,
    "max_changed_paths": 8,
    "max_serialized_bytes": 4096,
}


class HandoffBudgetError(RuntimeError):
    def __init__(self, *, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class HandoffValidationError(ContractValidationError):
    def __init__(self, *, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def build_handoff_payload(
    *,
    story_id: str,
    next_story_id: str | None,
    summary: str,
    carry_forward_context: list[str],
    changed_paths: list[str],
    commit_meta: dict[str, Any] | None,
    generated_at: str,
    required_context: list[str] | None = None,
) -> dict[str, Any]:
    source_summary = _normalize_summary(summary)
    source_context = _unique_non_empty_strings(carry_forward_context)
    source_paths = _unique_non_empty_strings(changed_paths)
    required_items = _unique_non_empty_strings(required_context or [])

    missing_required = [item for item in required_items if item not in source_context]
    if missing_required:
        raise HandoffBudgetError(
            code="handoff_invalid_required_context",
            message=(
                "Required carry-forward items must be present in carry_forward_context: "
                f"{missing_required!r}."
            ),
        )

    if len(required_items) > HANDOFF_POLICY["max_carry_forward_items"]:
        raise HandoffBudgetError(
            code="handoff_required_context_overflow",
            message=(
                "Required carry-forward items exceed the handoff policy item budget."
            ),
        )

    summary_limit = min(len(source_summary), HANDOFF_POLICY["max_summary_chars"])
    kept_context = _select_context_with_reserved_slots(
        items=source_context,
        required_items=required_items,
        limit=HANDOFF_POLICY["max_carry_forward_items"],
    )
    kept_paths = source_paths[: HANDOFF_POLICY["max_changed_paths"]]

    if _fits_budget(
        source_summary=source_summary,
        summary_limit=summary_limit,
        source_context=source_context,
        carry_forward_context=kept_context,
        source_paths=source_paths,
        changed_paths=kept_paths,
        story_id=story_id,
        next_story_id=next_story_id,
        commit_meta=commit_meta,
        generated_at=generated_at,
    ):
        return _finalize_payload(
            story_id=story_id,
            next_story_id=next_story_id,
            source_summary=source_summary,
            summary_limit=summary_limit,
            source_context=source_context,
            carry_forward_context=kept_context,
            source_paths=source_paths,
            changed_paths=kept_paths,
            commit_meta=commit_meta,
            generated_at=generated_at,
        )

    while kept_paths and not _fits_budget(
        source_summary=source_summary,
        summary_limit=summary_limit,
        source_context=source_context,
        carry_forward_context=kept_context,
        source_paths=source_paths,
        changed_paths=kept_paths,
        story_id=story_id,
        next_story_id=next_story_id,
        commit_meta=commit_meta,
        generated_at=generated_at,
    ):
        kept_paths = kept_paths[:-1]

    while kept_context and not _fits_budget(
        source_summary=source_summary,
        summary_limit=summary_limit,
        source_context=source_context,
        carry_forward_context=kept_context,
        source_paths=source_paths,
        changed_paths=kept_paths,
        story_id=story_id,
        next_story_id=next_story_id,
        commit_meta=commit_meta,
        generated_at=generated_at,
    ):
        next_context = _drop_last_optional_context(
            items=kept_context,
            required_items=required_items,
        )
        if next_context == kept_context:
            break
        kept_context = next_context

    fitted_limit = _fit_summary_limit(
        source_summary=source_summary,
        source_context=source_context,
        carry_forward_context=kept_context,
        source_paths=source_paths,
        changed_paths=kept_paths,
        story_id=story_id,
        next_story_id=next_story_id,
        commit_meta=commit_meta,
        generated_at=generated_at,
        starting_limit=summary_limit,
    )
    if fitted_limit is None:
        raise HandoffBudgetError(
            code="handoff_required_context_overflow",
            message=(
                "Handoff compaction cannot preserve the required context within the serialized size budget."
            ),
        )

    return _finalize_payload(
        story_id=story_id,
        next_story_id=next_story_id,
        source_summary=source_summary,
        summary_limit=fitted_limit,
        source_context=source_context,
        carry_forward_context=kept_context,
        source_paths=source_paths,
        changed_paths=kept_paths,
        commit_meta=commit_meta,
        generated_at=generated_at,
    )


def validate_handoff_contract(payload: dict[str, Any]) -> None:
    validate_contract_payload("handoff.schema.json", payload)
    _validate_runtime_budget(payload)


def inspect_handoff_artifact(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "exists": False,
            "path": str(path),
            "schema_valid": False,
            "within_budget": False,
            "reason_code": "handoff_missing",
            "reason": "The handoff artifact does not exist.",
        }

    try:
        payload = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        return {
            "exists": True,
            "path": str(path),
            "schema_valid": False,
            "within_budget": False,
            "reason_code": "handoff_unreadable",
            "reason": f"Handoff artifact is not valid JSON: {exc}.",
        }

    try:
        validate_handoff_contract(payload)
    except HandoffValidationError as exc:
        status = _status_from_payload(payload)
        status.update(
            {
                "exists": True,
                "path": str(path),
                "schema_valid": exc.code != "handoff_schema_invalid",
                "within_budget": False,
                "reason_code": exc.code,
                "reason": exc.message,
            }
        )
        return status
    except ContractValidationError as exc:
        status = _status_from_payload(payload)
        status.update(
            {
                "exists": True,
                "path": str(path),
                "schema_valid": False,
                "within_budget": False,
                "reason_code": "handoff_schema_invalid",
                "reason": str(exc),
            }
        )
        return status

    status = _status_from_payload(payload)
    status.update(
        {
            "exists": True,
            "path": str(path),
            "schema_valid": True,
            "within_budget": True,
            "reason_code": None,
            "reason": None,
        }
    )
    return status


def _normalize_summary(summary: str) -> str:
    return (summary or "").strip()


def _unique_non_empty_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    items: list[str] = []
    for value in values:
        candidate = value.strip()
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        items.append(candidate)
    return items


def _select_context_with_reserved_slots(
    *,
    items: list[str],
    required_items: list[str],
    limit: int,
) -> list[str]:
    required_set = set(required_items)
    remaining_required = sum(1 for item in items if item in required_set)
    remaining_slots = limit
    kept: list[str] = []

    for item in items:
        is_required = item in required_set
        if is_required:
            kept.append(item)
            remaining_slots -= 1
            remaining_required -= 1
            continue
        if remaining_slots > remaining_required:
            kept.append(item)
            remaining_slots -= 1
        if remaining_slots == 0:
            break

    return kept


def _drop_last_optional_context(*, items: list[str], required_items: list[str]) -> list[str]:
    required_set = set(required_items)
    for index in range(len(items) - 1, -1, -1):
        if items[index] in required_set:
            continue
        return items[:index] + items[index + 1 :]
    return items


def _fit_summary_limit(
    *,
    source_summary: str,
    source_context: list[str],
    carry_forward_context: list[str],
    source_paths: list[str],
    changed_paths: list[str],
    story_id: str,
    next_story_id: str | None,
    commit_meta: dict[str, Any] | None,
    generated_at: str,
    starting_limit: int,
) -> int | None:
    if _fits_budget(
        source_summary=source_summary,
        summary_limit=starting_limit,
        source_context=source_context,
        carry_forward_context=carry_forward_context,
        source_paths=source_paths,
        changed_paths=changed_paths,
        story_id=story_id,
        next_story_id=next_story_id,
        commit_meta=commit_meta,
        generated_at=generated_at,
    ):
        return starting_limit

    if not _fits_budget(
        source_summary=source_summary,
        summary_limit=0,
        source_context=source_context,
        carry_forward_context=carry_forward_context,
        source_paths=source_paths,
        changed_paths=changed_paths,
        story_id=story_id,
        next_story_id=next_story_id,
        commit_meta=commit_meta,
        generated_at=generated_at,
    ):
        return None

    low = 0
    high = starting_limit
    best = 0
    while low <= high:
        mid = (low + high) // 2
        if _fits_budget(
            source_summary=source_summary,
            summary_limit=mid,
            source_context=source_context,
            carry_forward_context=carry_forward_context,
            source_paths=source_paths,
            changed_paths=changed_paths,
            story_id=story_id,
            next_story_id=next_story_id,
            commit_meta=commit_meta,
            generated_at=generated_at,
        ):
            best = mid
            low = mid + 1
        else:
            high = mid - 1
    return best


def _fits_budget(
    *,
    source_summary: str,
    summary_limit: int,
    source_context: list[str],
    carry_forward_context: list[str],
    source_paths: list[str],
    changed_paths: list[str],
    story_id: str,
    next_story_id: str | None,
    commit_meta: dict[str, Any] | None,
    generated_at: str,
) -> bool:
    payload = _compose_payload(
        story_id=story_id,
        next_story_id=next_story_id,
        summary=_truncate_text(source_summary, summary_limit),
        carry_forward_context=carry_forward_context,
        changed_paths=changed_paths,
        commit_meta=commit_meta,
        generated_at=generated_at,
        source_summary=source_summary,
        source_context=source_context,
        source_paths=source_paths,
    )
    return payload["metrics"]["serialized_bytes"] <= HANDOFF_POLICY["max_serialized_bytes"]


def _finalize_payload(
    *,
    story_id: str,
    next_story_id: str | None,
    source_summary: str,
    summary_limit: int,
    source_context: list[str],
    carry_forward_context: list[str],
    source_paths: list[str],
    changed_paths: list[str],
    commit_meta: dict[str, Any] | None,
    generated_at: str,
) -> dict[str, Any]:
    return _compose_payload(
        story_id=story_id,
        next_story_id=next_story_id,
        summary=_truncate_text(source_summary, summary_limit),
        carry_forward_context=carry_forward_context,
        changed_paths=changed_paths,
        commit_meta=commit_meta,
        generated_at=generated_at,
        source_summary=source_summary,
        source_context=source_context,
        source_paths=source_paths,
    )


def _compose_payload(
    *,
    story_id: str,
    next_story_id: str | None,
    summary: str,
    carry_forward_context: list[str],
    changed_paths: list[str],
    commit_meta: dict[str, Any] | None,
    generated_at: str,
    source_summary: str,
    source_context: list[str],
    source_paths: list[str],
) -> dict[str, Any]:
    payload = {
        "version": 1,
        "story_id": story_id,
        "next_story_id": next_story_id,
        "summary": summary,
        "carry_forward_context": list(carry_forward_context),
        "changed_paths": list(changed_paths),
        "commit_meta": commit_meta,
        "generated_at": generated_at,
        "policy": dict(HANDOFF_POLICY),
        "metrics": {
            "summary_chars": len(summary),
            "carry_forward_items": len(carry_forward_context),
            "changed_paths": len(changed_paths),
            "serialized_bytes": 0,
        },
        "compaction": {
            "applied": (
                summary != source_summary
                or len(carry_forward_context) != len(source_context)
                or len(changed_paths) != len(source_paths)
            ),
            "summary_truncated": summary != source_summary,
            "carry_forward_items_dropped": len(source_context) - len(carry_forward_context),
            "changed_paths_dropped": len(source_paths) - len(changed_paths),
        },
        "validation": {
            "schema_valid": True,
            "within_budget": True,
        },
    }
    payload["metrics"]["serialized_bytes"] = _stabilized_serialized_size(payload)
    return payload


def _stabilized_serialized_size(payload: dict[str, Any]) -> int:
    previous = -1
    current = 0
    while current != previous:
        previous = current
        payload["metrics"]["serialized_bytes"] = current
        current = len((json.dumps(payload, indent=2) + "\n").encode("utf-8"))
    payload["metrics"]["serialized_bytes"] = current
    return current


def _truncate_text(text: str, limit: int) -> str:
    if limit <= 0:
        return ""
    if len(text) <= limit:
        return text
    if limit <= 3:
        return text[:limit]
    return text[: limit - 3].rstrip() + "..."


def _validate_runtime_budget(payload: dict[str, Any]) -> None:
    policy = payload.get("policy")
    metrics = payload.get("metrics")
    compaction = payload.get("compaction")
    validation = payload.get("validation")

    if not isinstance(policy, dict) or not isinstance(metrics, dict):
        raise HandoffValidationError(
            code="handoff_schema_invalid",
            message="Handoff policy and metrics objects are required.",
        )

    if policy != HANDOFF_POLICY:
        raise HandoffValidationError(
            code="handoff_policy_mismatch",
            message=f"Handoff policy must match the shared runtime budget: {HANDOFF_POLICY!r}.",
        )

    expected_metrics = {
        "summary_chars": len(payload["summary"]),
        "carry_forward_items": len(payload["carry_forward_context"]),
        "changed_paths": len(payload["changed_paths"]),
        "serialized_bytes": _stabilized_serialized_size(payload),
    }
    if metrics != expected_metrics:
        raise HandoffValidationError(
            code="handoff_metrics_mismatch",
            message="Handoff metrics do not match the serialized artifact contents.",
        )

    expected_compaction = {
        "applied": bool(
            compaction.get("summary_truncated")
            or compaction.get("carry_forward_items_dropped")
            or compaction.get("changed_paths_dropped")
        ),
        "summary_truncated": compaction.get("summary_truncated"),
        "carry_forward_items_dropped": compaction.get("carry_forward_items_dropped"),
        "changed_paths_dropped": compaction.get("changed_paths_dropped"),
    }
    if compaction != expected_compaction:
        raise HandoffValidationError(
            code="handoff_compaction_mismatch",
            message="Handoff compaction metadata is internally inconsistent.",
        )

    if validation != {"schema_valid": True, "within_budget": True}:
        raise HandoffValidationError(
            code="handoff_validation_mismatch",
            message="Handoff validation flags must record a schema-valid, within-budget artifact.",
        )

    if metrics["summary_chars"] > policy["max_summary_chars"]:
        raise HandoffValidationError(
            code="handoff_out_of_budget",
            message="Handoff summary exceeds the configured character budget.",
        )
    if metrics["carry_forward_items"] > policy["max_carry_forward_items"]:
        raise HandoffValidationError(
            code="handoff_out_of_budget",
            message="Handoff carry-forward items exceed the configured item budget.",
        )
    if metrics["changed_paths"] > policy["max_changed_paths"]:
        raise HandoffValidationError(
            code="handoff_out_of_budget",
            message="Handoff changed paths exceed the configured item budget.",
        )
    if metrics["serialized_bytes"] > policy["max_serialized_bytes"]:
        raise HandoffValidationError(
            code="handoff_out_of_budget",
            message="Handoff serialized size exceeds the configured byte budget.",
        )


def _status_from_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    policy = payload.get("policy")
    metrics = payload.get("metrics")
    compaction = payload.get("compaction")
    return {
        "story_id": payload.get("story_id"),
        "next_story_id": payload.get("next_story_id"),
        "compaction_applied": bool(compaction.get("applied")) if isinstance(compaction, dict) else None,
        "summary_chars": metrics.get("summary_chars") if isinstance(metrics, dict) else None,
        "carry_forward_items": metrics.get("carry_forward_items") if isinstance(metrics, dict) else None,
        "changed_path_items": metrics.get("changed_paths") if isinstance(metrics, dict) else None,
        "serialized_bytes": metrics.get("serialized_bytes") if isinstance(metrics, dict) else None,
        "policy": policy if isinstance(policy, dict) else None,
    }
