from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from ..state.contract_validation import validate_contract_payload


def _slug(value: str, *, fallback: str) -> str:
    candidate = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-._")
    return candidate or fallback


def worker_record_relpath(worker_id: str) -> str:
    return f".praxis/runtime/workers/{_slug(worker_id, fallback='worker')}.json"


def build_trace_context_from_payload(payload: dict[str, Any]) -> dict[str, Any]:
    dispatch = payload["dispatch"]
    worker = payload["worker"]
    bundle = payload["bundle"]
    return {
        "adapter": payload["adapter"],
        "dispatch_id": bundle["dispatch_id"],
        "worker_id": worker["worker_id"],
        "worker_class": worker["worker_class"],
        "scope": dispatch["scope"],
        "slice_id": dispatch["slice_id"],
        "artifact_dir": dispatch["artifact_dir"],
        "stage": dispatch["stage"],
        "boundary_handoff_path": dispatch["boundary_handoff_path"],
        "dispatch_record_path": bundle["dispatch_record_path"],
        "context_manifest_path": bundle["context_manifest_path"],
        "worker_record_path": worker_record_relpath(worker["worker_id"]),
    }


def build_trace_context_from_launch_context(launch_context: dict[str, Any]) -> dict[str, Any] | None:
    dispatch = launch_context.get("dispatch")
    bundle = launch_context.get("bundle")
    worker_plan = launch_context.get("worker_plan")
    if not isinstance(dispatch, dict) or not isinstance(bundle, dict) or not isinstance(worker_plan, dict):
        return None
    stage = dispatch.get("stage")
    if not isinstance(stage, str) or not stage:
        return None
    worker_id = worker_plan.get("worker_id")
    worker_class = worker_plan.get("worker_class")
    if not isinstance(worker_id, str) or not worker_id:
        return None
    if not isinstance(worker_class, str) or not worker_class:
        return None
    return {
        "adapter": launch_context["adapter"],
        "dispatch_id": bundle["dispatch_id"],
        "worker_id": worker_id,
        "worker_class": worker_class,
        "scope": dispatch["scope"],
        "slice_id": dispatch["slice_id"],
        "artifact_dir": dispatch["artifact_dir"],
        "stage": stage,
        "boundary_handoff_path": dispatch.get("boundary_handoff_path"),
        "dispatch_record_path": bundle["dispatch_record_path"],
        "context_manifest_path": bundle["context_manifest_path"],
        "worker_record_path": worker_record_relpath(worker_id),
    }


def build_trace_event(
    trace_context: dict[str, Any],
    *,
    recorded_at: str,
    event_type: str,
    reason_code: str,
    reason: str,
    extra_fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    event = {
        "version": 1,
        "ts": recorded_at,
        "type": event_type,
        "adapter": trace_context["adapter"],
        "dispatch_id": trace_context["dispatch_id"],
        "worker_id": trace_context["worker_id"],
        "worker_class": trace_context["worker_class"],
        "scope": trace_context["scope"],
        "slice_id": trace_context["slice_id"],
        "artifact_dir": trace_context["artifact_dir"],
        "stage": trace_context["stage"],
        "boundary_handoff_path": trace_context["boundary_handoff_path"],
        "dispatch_record_path": trace_context["dispatch_record_path"],
        "context_manifest_path": trace_context["context_manifest_path"],
        "worker_record_path": trace_context["worker_record_path"],
        "reason_code": reason_code,
        "reason": reason,
    }
    if extra_fields:
        for key, value in extra_fields.items():
            event[key] = value
    validate_contract_payload("trace-event.schema.json", event)
    return event


def render_trace_text(
    *,
    repo_root: Path,
    trace_path: str,
    events: list[dict[str, Any]],
) -> str:
    full_path = repo_root / trace_path
    existing = full_path.read_text() if full_path.exists() else ""
    rendered = "".join(json.dumps(event) + "\n" for event in events)
    return existing + rendered
