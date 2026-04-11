from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .contract_validation import validate_contract_payload
from .durable_state import commit_transaction, dump_events, dump_json, extend_event_log


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_hook_request() -> dict[str, Any]:
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("Native hook input must be a JSON object.")
    return payload


def _slug(value: str, *, fallback: str) -> str:
    candidate = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-._")
    return candidate or fallback


def _record_relpath(*, adapter: str, recorded_at: str, session_id: str) -> str:
    ts = recorded_at.replace("-", "").replace(":", "").replace(".", "")
    session_slug = _slug(session_id, fallback="session")
    return f".praxis/runtime/{adapter}-launches/{ts}-{session_slug}.json"


def build_native_launch_record(
    *,
    payload: dict[str, Any],
    hook_request: dict[str, Any],
    recorded_at: str,
) -> tuple[str, dict[str, Any]]:
    adapter = payload["adapter"]
    session_id = str(hook_request.get("session_id") or "unknown-session")
    handoff = payload["inputs"]["boundary_handoff"]
    record_rel = _record_relpath(adapter=adapter, recorded_at=recorded_at, session_id=session_id)
    record = {
        "version": 1,
        "recorded_at": recorded_at,
        "adapter": adapter,
        "kind": "session_start",
        "session": {
            "id": session_id,
            "source": str(hook_request.get("source") or "unknown"),
            "cwd": str(hook_request.get("cwd") or "."),
        },
        "dispatch": {
            "workflow": payload["workflow"],
            "scope": payload["dispatch"]["scope"],
            "slice_id": payload["dispatch"]["slice_id"],
            "artifact_dir": payload["dispatch"]["artifact_dir"],
            "stage": payload["dispatch"]["stage"],
            "boundary_handoff_path": payload["dispatch"]["boundary_handoff_path"],
        },
        "context": {
            "fresh_context": payload["context_policy"]["fresh_context"],
            "carry_forward_mode": payload["context_policy"]["carry_forward_mode"],
            "allowed_context_sources": payload["context_policy"]["allowed_context_sources"],
            "handoff_injected": payload["context_policy"]["handoff_injected"],
            "boundary_handoff_story_id": handoff["story_id"] if handoff else None,
            "boundary_handoff_next_story_id": handoff["next_story_id"] if handoff else None,
        },
        "harness": {
            "instructions_path": payload["harness"]["instructions_path"],
            "project_config_path": payload["harness"]["project_config_path"],
            "hooks_path": payload["harness"]["hooks_path"],
            "agents_path": payload["harness"]["agents_path"],
            "launch_record_path": record_rel,
            "compatibility": payload["harness"]["compatibility"],
        },
    }
    validate_contract_payload("native-launch.schema.json", record)
    return record_rel, record


def derive_native_launch_failure_code(
    *,
    handoff_status: dict[str, Any] | None,
    exc: Exception,
) -> str:
    if handoff_status is not None and handoff_status.get("reason_code"):
        return str(handoff_status["reason_code"])
    if isinstance(exc, FileNotFoundError):
        return "harness_missing"
    if "adapter" in str(exc).lower():
        return "adapter_mismatch"
    return "native_launch_failed"


def _shared_launch_event(
    *,
    adapter: str,
    dispatch: dict[str, Any],
    hook_request: dict[str, Any],
    recorded_at: str,
    handoff_injected: bool,
) -> dict[str, Any]:
    return {
        "ts": recorded_at,
        "adapter": adapter,
        "hook_event": "session_start",
        "scope": dispatch["scope"],
        "slice_id": dispatch["slice_id"],
        "artifact_dir": dispatch["artifact_dir"],
        "stage": dispatch["stage"],
        "boundary_handoff_path": dispatch["boundary_handoff_path"],
        "handoff_present": dispatch["boundary_handoff_path"] is not None,
        "handoff_injected": handoff_injected,
        "source": str(hook_request.get("source") or "unknown"),
    }


def _handoff_validation_event(
    *,
    adapter: str,
    dispatch: dict[str, Any],
    handoff_status: dict[str, Any],
    recorded_at: str,
    handoff_injected: bool,
) -> dict[str, Any]:
    return {
        "ts": recorded_at,
        "type": "handoff_validated",
        "adapter": adapter,
        "scope": dispatch["scope"],
        "slice_id": dispatch["slice_id"],
        "artifact_dir": dispatch["artifact_dir"],
        "stage": dispatch["stage"],
        "boundary_handoff_path": dispatch["boundary_handoff_path"],
        "handoff_present": True,
        "handoff_found": handoff_status["exists"],
        "schema_valid": handoff_status["schema_valid"],
        "within_budget": handoff_status["within_budget"],
        "handoff_injected": handoff_injected,
        "handoff_story_id": handoff_status.get("story_id"),
        "handoff_next_story_id": handoff_status.get("next_story_id"),
        "reason_code": handoff_status.get("reason_code"),
        "reason": handoff_status.get("reason"),
    }


def _native_launch_event(
    *,
    event_type: str,
    adapter: str,
    dispatch: dict[str, Any],
    hook_request: dict[str, Any],
    recorded_at: str,
    handoff_injected: bool,
    reason_code: str,
    reason: str,
    record_rel: str | None = None,
) -> dict[str, Any]:
    payload = _shared_launch_event(
        adapter=adapter,
        dispatch=dispatch,
        hook_request=hook_request,
        recorded_at=recorded_at,
        handoff_injected=handoff_injected,
    )
    payload.update(
        {
            "type": event_type,
            "reason_code": reason_code,
            "reason": reason,
        }
    )
    if record_rel is not None:
        payload["launch_record_path"] = record_rel
    return payload


def _commit_launch_artifacts(
    *,
    repo_root: Path,
    operation: str,
    recorded_at: str,
    events: list[dict[str, Any]],
    extra_files: dict[str, str],
    metadata: dict[str, Any],
) -> None:
    all_events = extend_event_log(repo_root, events)
    files = {
        ".praxis/events.jsonl": dump_events(all_events),
        **extra_files,
    }
    commit_transaction(
        repo_root=repo_root,
        operation=operation,
        files=files,
        timestamp=recorded_at,
        metadata=metadata,
    )


def write_native_launch_record(
    *,
    repo_root: Path,
    payload: dict[str, Any],
    hook_request: dict[str, Any],
    recorded_at: str,
    handoff_status: dict[str, Any] | None = None,
) -> tuple[str, dict[str, Any]]:
    record_rel, record = build_native_launch_record(
        payload=payload,
        hook_request=hook_request,
        recorded_at=recorded_at,
    )
    events: list[dict[str, Any]] = []
    if handoff_status is not None:
        events.append(
            _handoff_validation_event(
                adapter=payload["adapter"],
                dispatch=payload["dispatch"],
                handoff_status=handoff_status,
                recorded_at=recorded_at,
                handoff_injected=payload["context_policy"]["handoff_injected"],
            )
        )
    events.append(
        _native_launch_event(
            event_type="native_launch_recorded",
            adapter=payload["adapter"],
            dispatch=payload["dispatch"],
            hook_request=hook_request,
            recorded_at=recorded_at,
            handoff_injected=payload["context_policy"]["handoff_injected"],
            reason_code="native_launch_recorded",
            reason="Native launch context prepared from durable Praxis state.",
            record_rel=record_rel,
        )
    )
    _commit_launch_artifacts(
        repo_root=repo_root,
        operation="write_native_launch_record",
        recorded_at=recorded_at,
        events=events,
        extra_files={record_rel: dump_json(record)},
        metadata={"adapter": payload["adapter"], "slice_id": payload["dispatch"]["slice_id"]},
    )
    return record_rel, record


def write_native_launch_failure(
    *,
    repo_root: Path,
    launch_context: dict[str, Any],
    hook_request: dict[str, Any],
    recorded_at: str,
    reason_code: str,
    reason: str,
) -> None:
    events: list[dict[str, Any]] = []
    handoff_status = launch_context.get("handoff_status")
    if handoff_status is not None:
        events.append(
            _handoff_validation_event(
                adapter=launch_context["adapter"],
                dispatch=launch_context["dispatch"],
                handoff_status=handoff_status,
                recorded_at=recorded_at,
                handoff_injected=False,
            )
        )
    events.append(
        _native_launch_event(
            event_type="native_launch_failed",
            adapter=launch_context["adapter"],
            dispatch=launch_context["dispatch"],
            hook_request=hook_request,
            recorded_at=recorded_at,
            handoff_injected=False,
            reason_code=reason_code,
            reason=reason,
        )
    )
    _commit_launch_artifacts(
        repo_root=repo_root,
        operation="write_native_launch_failure",
        recorded_at=recorded_at,
        events=events,
        extra_files={},
        metadata={"adapter": launch_context["adapter"], "slice_id": launch_context["dispatch"]["slice_id"]},
    )


def build_session_start_additional_context(*, payload: dict[str, Any], record_rel: str, label: str) -> str:
    dispatch = payload["dispatch"]
    handoff = payload["inputs"]["boundary_handoff"]
    lines = [
        label,
        f"- workflow: {payload['workflow']}",
        f"- adapter: {payload['adapter']}",
        f"- scope: {dispatch['scope']}",
        f"- slice_id: {dispatch['slice_id'] or 'root'}",
        f"- stage: {dispatch['stage'] or 'none'}",
        f"- artifact_dir: {dispatch['artifact_dir']}",
        f"- run_metadata: {payload['inputs']['run_path']}",
        f"- launch_record: {record_rel}",
        "- carry-forward rule: use only this dispatch plus the active boundary handoff",
    ]
    if handoff is None:
        lines.append("- boundary_handoff: none")
        return "\n".join(lines)

    lines.extend(
        [
            f"- boundary_handoff_path: {payload['inputs']['boundary_handoff_path']}",
            f"- boundary_from_story: {handoff['story_id']}",
            f"- boundary_to_story: {handoff['next_story_id']}",
            f"- handoff_summary: {handoff['summary']}",
            "- carry_forward_context:",
        ]
    )
    for item in handoff.get("carry_forward_context", []):
        lines.append(f"  - {item}")
    return "\n".join(lines)


def success_response(*, additional_context: str) -> dict[str, Any]:
    return {
        "continue": True,
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": additional_context,
        },
    }


def failure_response(message: str) -> dict[str, Any]:
    return {
        "continue": False,
        "stopReason": message,
        "systemMessage": message,
    }


def dump_hook_response(payload: dict[str, Any]) -> str:
    return dump_json(payload)
