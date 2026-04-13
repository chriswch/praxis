from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..state.contract_validation import validate_contract_payload
from ..state.durable_state import commit_transaction, dump_events, dump_json, extend_event_log, load_json, validate_state_payloads
from ..observability.trace_events import (
    build_trace_context_from_launch_context,
    build_trace_context_from_payload,
    build_trace_event,
    render_trace_text,
)
from .native_resume import (
    boundary_handoff_fingerprint_from_payload,
    build_session_record,
    classify_session_origin,
    context_fingerprint_from_payload,
    derive_session_resumability,
    worker_record_relpath,
    worker_signature_from_payload,
)
from ..workers.planning import ensure_run_vnext_defaults, mark_worker_started


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


def _record_relpath(*, adapter: str, recorded_at: str, worker_id: str) -> str:
    ts = recorded_at.replace("-", "").replace(":", "").replace(".", "")
    worker_slug = _slug(worker_id, fallback="worker")
    return f".praxis/runtime/launches/{adapter}/{ts}-{worker_slug}.json"


def _trace_relpath(payload: dict[str, Any]) -> str:
    return payload["resume"]["trace_path"]


def _launch_resume_mode(*, hook_request: dict[str, Any], payload: dict[str, Any]) -> str:
    source = str(hook_request.get("source") or "")
    if source in {"startup", "resume"}:
        return "interactive"
    return str(payload["resume"].get("mode") or "headless")


def _provider_locator_for_launch(*, hook_request: dict[str, Any]) -> str | None:
    source = str(hook_request.get("source") or "")
    if source in {"startup", "resume"}:
        session_id = hook_request.get("session_id")
        if isinstance(session_id, str) and session_id:
            return session_id
    provider_locator = hook_request.get("provider_locator")
    if isinstance(provider_locator, str) and provider_locator:
        return provider_locator
    return None


def build_native_launch_record(
    *,
    run: dict[str, Any],
    payload: dict[str, Any],
    hook_request: dict[str, Any],
    recorded_at: str,
) -> tuple[str, dict[str, Any]]:
    adapter = payload["adapter"]
    session_id = str(hook_request.get("session_id") or "unknown-session")
    handoff = payload["inputs"]["boundary_handoff"]
    worker = payload["worker"]
    resume_mode = _launch_resume_mode(hook_request=hook_request, payload=payload)
    origin = classify_session_origin(
        str(hook_request.get("source") or "unknown"),
        resume_mode=resume_mode,
    )
    provider_locator = _provider_locator_for_launch(hook_request=hook_request)
    resumable, resumable_reason_code, resumable_reason = derive_session_resumability(
        adapter=adapter,
        origin=origin,
        provider_locator=provider_locator,
    )
    record_rel = _record_relpath(adapter=adapter, recorded_at=recorded_at, worker_id=worker["worker_id"])
    resume_attempted = bool(payload["resume"].get("resume_attempted"))
    resume_outcome = payload["resume"].get("resume_outcome")
    if not isinstance(resume_outcome, str) or not resume_outcome:
        resume_outcome = "resume_not_attempted" if not resume_attempted else "resume_requested"
    record = {
        "version": 4,
        "recorded_at": recorded_at,
        "adapter": adapter,
        "kind": "session_start",
        "session": {
            "id": session_id,
            "source": str(hook_request.get("source") or "unknown"),
            "cwd": str(hook_request.get("cwd") or "."),
            "resumable": resumable,
            "origin": origin,
            "provider_locator": provider_locator,
            "resumable_reason_code": resumable_reason_code,
            "resumable_reason": resumable_reason,
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
            "context_fingerprint": context_fingerprint_from_payload(payload),
            "boundary_handoff_fingerprint": boundary_handoff_fingerprint_from_payload(payload),
        },
        "bundle": {
            "dispatch_id": payload["bundle"]["dispatch_id"],
            "worker_launch_path": payload["bundle"]["worker_launch_path"],
            "dispatch_record_path": payload["bundle"]["dispatch_record_path"],
            "context_manifest_path": payload["bundle"]["context_manifest_path"],
        },
        "worker": {
            "worker_id": worker["worker_id"],
            "worker_class": worker["worker_class"],
            "launch_surface": str(hook_request.get("launch_surface") or "native_launcher"),
            "permission_profile": payload["permissions"]["profile"],
            "worktree_mode": worker["worktree_mode"],
            "worktree_path": str(hook_request.get("cwd")) if hook_request.get("cwd") else None,
            "launcher_pid": hook_request.get("launcher_pid"),
            "worker_signature": worker_signature_from_payload(
                run_id=run["run_id"],
                payload=payload,
            ),
        },
        "resume": {
            "attempted": resume_attempted,
            "outcome": resume_outcome,
            "strategy": payload["resume"].get("strategy"),
            "previous_session_id": payload["resume"].get("session_id"),
            "mode": payload["resume"].get("mode"),
        },
        "harness": {
            "instructions_path": payload["harness"]["instructions_path"],
            "project_config_path": payload["harness"]["project_config_path"],
            "hooks_path": payload["harness"]["hooks_path"],
            "agents_path": payload["harness"]["agents_path"],
            "launch_record_path": record_rel,
            "trace_path": _trace_relpath(payload),
            "compatibility": payload["harness"]["compatibility"],
        },
    }
    validate_contract_payload("native-launch.schema.json", record)
    return record_rel, record


def build_worker_record(*, run: dict[str, Any], payload: dict[str, Any], record: dict[str, Any], record_rel: str) -> tuple[str, dict[str, Any]]:
    worker_id = payload["worker"]["worker_id"]
    rel = worker_record_relpath(worker_id)
    worker_record = {
        "version": 1,
        "worker_id": worker_id,
        "run_id": run["run_id"],
        "adapter": payload["adapter"],
        "worker_class": payload["worker"]["worker_class"],
        "launch_surface": record["worker"]["launch_surface"],
        "launch_reason": payload["worker"]["reason"],
        "permission_profile": payload["permissions"]["profile"],
        "worktree_mode": payload["worker"]["worktree_mode"],
        "worktree_path": record["worker"]["worktree_path"],
        "session_id": record["session"]["id"],
        "launch_record_path": record_rel,
        "dispatch_id": payload["bundle"]["dispatch_id"],
        "worker_launch_path": payload["bundle"]["worker_launch_path"],
        "dispatch_record_path": payload["bundle"]["dispatch_record_path"],
        "context_manifest_path": payload["bundle"]["context_manifest_path"],
        "trace_path": record["harness"]["trace_path"],
        "launcher_pid": record["worker"].get("launcher_pid"),
        "status": "running",
    }
    validate_contract_payload("worker-record.schema.json", worker_record)
    return rel, worker_record


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
    event = _shared_launch_event(
        adapter=adapter,
        dispatch=dispatch,
        hook_request=hook_request,
        recorded_at=recorded_at,
        handoff_injected=handoff_injected,
    )
    event.update(
        {
            "type": event_type,
            "reason_code": reason_code,
            "reason": reason,
        }
    )
    if record_rel is not None:
        event["launch_record_path"] = record_rel
    return event


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
    extra_events: list[dict[str, Any]] | None = None,
) -> tuple[str, dict[str, Any]]:
    repo_root = repo_root.resolve()
    run = load_json(repo_root / ".praxis" / "run.json")
    ensure_run_vnext_defaults(run)
    record_rel, record = build_native_launch_record(
        run=run,
        payload=payload,
        hook_request=hook_request,
        recorded_at=recorded_at,
    )
    worker_rel, worker_record = build_worker_record(run=run, payload=payload, record=record, record_rel=record_rel)
    session_rel, session_record = build_session_record(
        repo_root=repo_root,
        run=run,
        payload=payload,
        record=record,
        record_rel=record_rel,
    )

    mark_worker_started(run, session_id=record["session"]["id"])
    run["timestamps"]["updated_at"] = recorded_at
    validate_state_payloads(run=run)

    trace_path = record["harness"]["trace_path"]
    trace_event = build_trace_event(
        build_trace_context_from_payload(payload),
        recorded_at=recorded_at,
        event_type="native_launch_recorded",
        reason_code="native_launch_recorded",
        reason="Native launch context prepared from durable Praxis state.",
        extra_fields={
            "launch_record_path": record_rel,
            "session_id": record["session"]["id"],
            "hook_event": "session_start",
            "source": str(hook_request.get("source") or "unknown"),
        },
    )

    events: list[dict[str, Any]] = list(extra_events or [])
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
        extra_files={
            ".praxis/run.json": dump_json(run),
            record_rel: dump_json(record),
            worker_rel: dump_json(worker_record),
            session_rel: dump_json(session_record),
            trace_path: render_trace_text(
                repo_root=repo_root,
                trace_path=trace_path,
                events=[trace_event],
            ),
        },
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
    extra_events: list[dict[str, Any]] | None = None,
) -> None:
    repo_root = repo_root.resolve()
    events: list[dict[str, Any]] = list(extra_events or [])
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
    trace_context = build_trace_context_from_launch_context(launch_context)
    extra_files: dict[str, str] = {}
    if trace_context is not None:
        trace_path = str(launch_context["worker_plan"]["trace_path"])
        trace_event = build_trace_event(
            trace_context,
            recorded_at=recorded_at,
            event_type="native_launch_failed",
            reason_code=reason_code,
            reason=reason,
            extra_fields={
                "hook_event": "session_start",
                "source": str(hook_request.get("source") or "unknown"),
            },
        )
        extra_files[trace_path] = render_trace_text(
            repo_root=repo_root,
            trace_path=trace_path,
            events=[trace_event],
        )
    _commit_launch_artifacts(
        repo_root=repo_root,
        operation="write_native_launch_failure",
        recorded_at=recorded_at,
        events=events,
        extra_files=extra_files,
        metadata={"adapter": launch_context["adapter"], "slice_id": launch_context["dispatch"]["slice_id"]},
    )


def build_session_start_additional_context(
    *,
    payload: dict[str, Any],
    record_rel: str,
    label: str,
    record_field_label: str = "launch_record",
    extra_lines: list[str] | None = None,
) -> str:
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
        f"- worker_id: {payload['worker']['worker_id']}",
        f"- worker_class: {payload['worker']['worker_class']}",
        f"- permission_profile: {payload['permissions']['profile']}",
        f"- run_metadata: {payload['inputs']['run_path']}",
        f"- {record_field_label}: {record_rel}",
        f"- trace_path: {payload['resume']['trace_path']}",
        "- carry-forward rule: use only this dispatch plus the active boundary handoff",
    ]
    if extra_lines:
        lines.extend(extra_lines)
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
