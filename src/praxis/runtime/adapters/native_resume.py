from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from ..state.contract_validation import validate_contract_payload
from ..state.durable_state import (
    commit_transaction,
    dump_events,
    dump_json,
    extend_event_log,
    load_json,
    validate_state_payloads,
)
from ..observability.trace_events import (
    build_trace_context_from_payload,
    build_trace_event,
    render_trace_text,
)
from ..workers.planning import ensure_run_vnext_defaults, mark_worker_resumed


_PROVIDER_RESUME_PROFILES = {
    "codex": {"supported": True, "mode": "either"},
    "claude": {"supported": True, "mode": "either"},
}


def _slug(value: str, *, fallback: str) -> str:
    candidate = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-._")
    return candidate or fallback


def stable_fingerprint(payload: Any) -> str:
    rendered = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(rendered.encode("utf-8")).hexdigest()


def worker_record_relpath(worker_id: str) -> str:
    return f".praxis/runtime/workers/{_slug(worker_id, fallback='worker')}.json"


def session_record_relpath(adapter: str, session_id: str) -> str:
    return f".praxis/runtime/sessions/{adapter}/{_slug(session_id, fallback='session')}.json"


def native_resume_record_relpath(*, adapter: str, recorded_at: str, worker_id: str) -> str:
    ts = recorded_at.replace("-", "").replace(":", "").replace(".", "")
    worker_slug = _slug(worker_id, fallback="worker")
    return f".praxis/runtime/resumes/{adapter}/{ts}-{worker_slug}.json"


def provider_resume_profile(adapter: str) -> dict[str, Any]:
    try:
        return dict(_PROVIDER_RESUME_PROFILES[adapter])
    except KeyError as exc:
        raise ValueError(f"Unsupported adapter: {adapter!r}.") from exc


def supports_resume_mode(capability_mode: str, resume_mode: str) -> bool:
    if capability_mode == "either":
        return True
    return capability_mode == resume_mode


def session_resume_mode(origin: str | None) -> str:
    return "headless" if str(origin or "").startswith("headless_") else "interactive"


def classify_session_origin(source: str | None, *, resume_mode: str | None = None) -> str:
    is_resume = str(source or "").lower() == "resume"
    if resume_mode == "headless":
        return "headless_resume" if is_resume else "headless_start"
    return "interactive_resume" if is_resume else "interactive_start"


def derive_session_resumability(
    *,
    adapter: str,
    origin: str,
    provider_locator: str | None,
) -> tuple[bool, str, str]:
    profile = provider_resume_profile(adapter)
    resume_mode = session_resume_mode(origin)
    if not provider_locator:
        return (
            False,
            "provider_locator_missing",
            "Praxis has not captured a provider-issued resume locator for this session.",
        )
    if not profile["supported"]:
        return (
            False,
            "provider_resume_unsupported",
            f"The active {adapter} adapter does not support provider-native resume.",
        )
    if not supports_resume_mode(str(profile["mode"]), resume_mode):
        return (
            False,
            "resume_mode_unsupported",
            f"The active {adapter} adapter does not support {resume_mode} provider-native resume.",
        )
    return (
        True,
        "provider_locator_recorded",
        "Praxis captured a provider-issued resume locator for this session.",
    )


def worker_signature_from_payload(*, run_id: str, payload: dict[str, Any]) -> str:
    dispatch = payload["dispatch"]
    worker = payload["worker"]
    return stable_fingerprint(
        {
            "run_id": run_id,
            "worker_id": worker["worker_id"],
            "adapter": payload["adapter"],
            "scope": dispatch["scope"],
            "slice_id": dispatch["slice_id"],
            "stage": dispatch["stage"],
            "artifact_dir": dispatch["artifact_dir"],
        }
    )


def boundary_handoff_fingerprint_from_payload(payload: dict[str, Any]) -> str | None:
    handoff = payload.get("inputs", {}).get("boundary_handoff")
    if handoff is None:
        return None
    return stable_fingerprint(handoff)


def context_fingerprint_from_payload(payload: dict[str, Any]) -> str:
    return stable_fingerprint(
        {
            "dispatch": payload["dispatch"],
            "context_policy": payload["context_policy"],
            "artifact_inputs": payload.get("artifact_inputs", []),
            "artifact_outputs_expected": payload.get("artifact_outputs_expected", []),
            "permissions": payload.get("permissions", {}),
            "boundary_handoff": payload.get("inputs", {}).get("boundary_handoff"),
        }
    )


def load_session_record(*, repo_root: Path, adapter: str, session_id: str) -> tuple[str, dict[str, Any]] | tuple[None, None]:
    rel = session_record_relpath(adapter, session_id)
    path = repo_root / rel
    if not path.exists():
        return None, None
    payload = load_json(path)
    validate_contract_payload("session-record.schema.json", payload)
    return rel, payload


def build_session_record(
    *,
    repo_root: Path,
    run: dict[str, Any],
    payload: dict[str, Any],
    record: dict[str, Any],
    record_rel: str,
) -> tuple[str, dict[str, Any]]:
    session_id = record["session"]["id"]
    rel = session_record_relpath(payload["adapter"], session_id)
    profile = provider_resume_profile(payload["adapter"])
    origin = record["session"]["origin"]
    provider_locator = record["session"].get("provider_locator")
    resumable, resumable_reason_code, resumable_reason = derive_session_resumability(
        adapter=payload["adapter"],
        origin=origin,
        provider_locator=provider_locator,
    )
    session_record = {
        "version": 3,
        "session_id": session_id,
        "adapter": payload["adapter"],
        "run_id": run["run_id"],
        "worker_id": payload["worker"]["worker_id"],
        "cwd": record["session"]["cwd"],
        "workspace_root": str(repo_root),
        "resumable": resumable,
        "resumable_reason_code": resumable_reason_code,
        "resumable_reason": resumable_reason,
        "session_origin": origin,
        "provider_resume_supported": profile["supported"],
        "provider_resume_mode": profile["mode"],
        "provider_locator": provider_locator,
        "worker_signature": record["worker"]["worker_signature"],
        "context_fingerprint": record["context"]["context_fingerprint"],
        "boundary_handoff_fingerprint": record["context"]["boundary_handoff_fingerprint"],
        "current_scope": record["dispatch"]["scope"],
        "current_slice_id": record["dispatch"]["slice_id"],
        "current_artifact_dir": record["dispatch"]["artifact_dir"],
        "current_stage": record["dispatch"]["stage"],
        "permission_profile": record["worker"]["permission_profile"],
        "worktree_mode": record["worker"]["worktree_mode"],
        "last_seen_at": record["recorded_at"],
        "last_resume_at": None,
        "last_resume_outcome": "resume_not_attempted",
        "provider_metadata": {
            "cwd": record["session"]["cwd"],
            "source": record["session"]["source"],
            "workflow": record["dispatch"]["workflow"],
            "scope": record["dispatch"]["scope"],
            "slice_id": record["dispatch"]["slice_id"],
            "stage": record["dispatch"]["stage"],
            "artifact_dir": record["dispatch"]["artifact_dir"],
            "boundary_handoff_path": record["dispatch"]["boundary_handoff_path"],
            "trace_path": record["harness"]["trace_path"],
            "launch_record_path": record_rel,
            "dispatch_id": payload["bundle"]["dispatch_id"],
            "worker_launch_path": payload["bundle"]["worker_launch_path"],
            "dispatch_record_path": payload["bundle"]["dispatch_record_path"],
            "context_manifest_path": payload["bundle"]["context_manifest_path"],
        },
    }
    validate_contract_payload("session-record.schema.json", session_record)
    return rel, session_record


def _resume_event_base(
    *,
    payload: dict[str, Any],
    recorded_at: str,
    requested_session_id: str,
    resolved_session_id: str | None,
    resume_mode: str,
    reason_code: str,
    reason: str,
    resume_record_path: str,
) -> dict[str, Any]:
    dispatch = payload["dispatch"]
    worker = payload["worker"]
    return {
        "ts": recorded_at,
        "adapter": payload["adapter"],
        "scope": dispatch["scope"],
        "slice_id": dispatch["slice_id"],
        "artifact_dir": dispatch["artifact_dir"],
        "stage": dispatch["stage"],
        "boundary_handoff_path": dispatch["boundary_handoff_path"],
        "worker_id": worker["worker_id"],
        "requested_session_id": requested_session_id,
        "resolved_session_id": resolved_session_id,
        "resume_mode": resume_mode,
        "resume_record_path": resume_record_path,
        "reason_code": reason_code,
        "reason": reason,
    }


def _worker_resumed_event(
    *,
    payload: dict[str, Any],
    recorded_at: str,
    session_id: str,
    resume_mode: str,
    reason: str,
    resume_record_path: str,
) -> dict[str, Any]:
    dispatch = payload["dispatch"]
    worker = payload["worker"]
    return {
        "ts": recorded_at,
        "type": "worker_resumed",
        "adapter": payload["adapter"],
        "scope": dispatch["scope"],
        "slice_id": dispatch["slice_id"],
        "artifact_dir": dispatch["artifact_dir"],
        "stage": dispatch["stage"],
        "boundary_handoff_path": dispatch["boundary_handoff_path"],
        "worker_id": worker["worker_id"],
        "session_id": session_id,
        "resume_mode": resume_mode,
        "resume_record_path": resume_record_path,
        "reason_code": "worker_resumed",
        "reason": reason,
    }


def _updated_session_record(
    *,
    repo_root: Path,
    existing: dict[str, Any] | None,
    run: dict[str, Any],
    payload: dict[str, Any],
    requested_session_id: str,
    resolved_session_id: str,
    recorded_at: str,
    resume_mode: str,
    outcome: str,
    source: str,
    provider_metadata: dict[str, Any],
) -> dict[str, Any]:
    profile = provider_resume_profile(payload["adapter"])
    provider_state = dict((existing or {}).get("provider_metadata", {}))
    provider_state.update(provider_metadata)
    previous_provider_locator = (existing or {}).get("provider_locator")
    if isinstance(previous_provider_locator, str) and previous_provider_locator and previous_provider_locator != resolved_session_id:
        provider_state["previous_provider_locator"] = previous_provider_locator
    provider_state.update(
        {
            "source": source,
            "workflow": payload["workflow"],
            "scope": payload["dispatch"]["scope"],
            "slice_id": payload["dispatch"]["slice_id"],
            "stage": payload["dispatch"]["stage"],
            "artifact_dir": payload["dispatch"]["artifact_dir"],
            "boundary_handoff_path": payload["dispatch"]["boundary_handoff_path"],
            "trace_path": payload["resume"]["trace_path"],
        }
    )
    origin = classify_session_origin(source, resume_mode=resume_mode)
    resumable, resumable_reason_code, resumable_reason = derive_session_resumability(
        adapter=payload["adapter"],
        origin=origin,
        provider_locator=resolved_session_id,
    )
    stable_session_id = str((existing or {}).get("session_id") or requested_session_id)
    record = {
        "version": 3,
        "session_id": stable_session_id,
        "adapter": payload["adapter"],
        "run_id": run["run_id"],
        "worker_id": payload["worker"]["worker_id"],
        "cwd": str((existing or {}).get("cwd") or provider_state.get("cwd") or repo_root),
        "workspace_root": str(repo_root),
        "resumable": resumable,
        "resumable_reason_code": resumable_reason_code,
        "resumable_reason": resumable_reason,
        "session_origin": origin,
        "provider_resume_supported": profile["supported"],
        "provider_resume_mode": profile["mode"],
        "provider_locator": resolved_session_id,
        "worker_signature": worker_signature_from_payload(run_id=run["run_id"], payload=payload),
        "context_fingerprint": context_fingerprint_from_payload(payload),
        "boundary_handoff_fingerprint": boundary_handoff_fingerprint_from_payload(payload),
        "current_scope": payload["dispatch"]["scope"],
        "current_slice_id": payload["dispatch"]["slice_id"],
        "current_artifact_dir": payload["dispatch"]["artifact_dir"],
        "current_stage": payload["dispatch"]["stage"],
        "permission_profile": payload["permissions"]["profile"],
        "worktree_mode": payload["worker"]["worktree_mode"],
        "last_seen_at": recorded_at,
        "last_resume_at": recorded_at,
        "last_resume_outcome": outcome,
        "provider_metadata": provider_state,
    }
    validate_contract_payload("session-record.schema.json", record)
    return record


def _updated_worker_record(
    *,
    repo_root: Path,
    payload: dict[str, Any],
    session_record: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    rel = worker_record_relpath(payload["worker"]["worker_id"])
    path = repo_root / rel
    if path.exists():
        worker_record = load_json(path)
    else:
        provider_metadata = session_record["provider_metadata"]
        worker_record = {
            "version": 1,
            "worker_id": payload["worker"]["worker_id"],
            "run_id": session_record["run_id"],
            "adapter": payload["adapter"],
            "worker_class": payload["worker"]["worker_class"],
            "launch_reason": payload["worker"]["reason"],
            "permission_profile": payload["permissions"]["profile"],
            "worktree_mode": payload["worker"]["worktree_mode"],
            "worktree_path": session_record["cwd"],
            "session_id": session_record["session_id"],
            "launch_record_path": provider_metadata.get(
                "launch_record_path",
                f".praxis/runtime/launches/{payload['adapter']}/legacy-{_slug(payload['worker']['worker_id'], fallback='worker')}.json",
            ),
            "dispatch_id": payload["bundle"]["dispatch_id"],
            "worker_launch_path": payload["bundle"]["worker_launch_path"],
            "dispatch_record_path": payload["bundle"]["dispatch_record_path"],
            "context_manifest_path": payload["bundle"]["context_manifest_path"],
            "trace_path": provider_metadata.get("trace_path", payload["resume"]["trace_path"]),
            "launcher_pid": None,
            "status": "running",
        }
    worker_record["session_id"] = session_record["session_id"]
    worker_record["dispatch_id"] = payload["bundle"]["dispatch_id"]
    worker_record["worker_launch_path"] = payload["bundle"]["worker_launch_path"]
    worker_record["dispatch_record_path"] = payload["bundle"]["dispatch_record_path"]
    worker_record["context_manifest_path"] = payload["bundle"]["context_manifest_path"]
    worker_record["status"] = "running"
    validate_contract_payload("worker-record.schema.json", worker_record)
    return rel, worker_record


def update_session_record_after_launch(
    *,
    repo_root: Path,
    adapter: str,
    worker_id: str,
    recorded_at: str,
    provider_locator: str,
    provider_metadata: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    repo_root = repo_root.resolve()
    worker_rel = worker_record_relpath(worker_id)
    worker_path = repo_root / worker_rel
    if not worker_path.exists():
        return None

    worker_record = load_json(worker_path)
    validate_contract_payload("worker-record.schema.json", worker_record)
    session_id = worker_record.get("session_id")
    if not isinstance(session_id, str) or not session_id:
        return None

    session_rel, session_record = load_session_record(
        repo_root=repo_root,
        adapter=adapter,
        session_id=session_id,
    )
    if session_rel is None or session_record is None:
        return None

    updated_session = dict(session_record)
    provider_state = dict(updated_session.get("provider_metadata", {}))
    provider_state.update(provider_metadata or {})
    provider_state["provider_locator_observed_at"] = recorded_at
    provider_state.setdefault("cwd", str(updated_session.get("cwd") or repo_root))

    origin = str(updated_session.get("session_origin") or "headless_start")
    resumable, resumable_reason_code, resumable_reason = derive_session_resumability(
        adapter=adapter,
        origin=origin,
        provider_locator=provider_locator,
    )

    updated_session["version"] = 3
    updated_session["workspace_root"] = str(repo_root)
    updated_session["provider_locator"] = provider_locator
    updated_session["resumable"] = resumable
    updated_session["resumable_reason_code"] = resumable_reason_code
    updated_session["resumable_reason"] = resumable_reason
    updated_session["last_seen_at"] = recorded_at
    updated_session["provider_metadata"] = provider_state
    validate_contract_payload("session-record.schema.json", updated_session)

    files = {
        session_rel: dump_json(updated_session),
    }
    launch_record_rel = worker_record.get("launch_record_path")
    if isinstance(launch_record_rel, str):
        launch_record_path = repo_root / launch_record_rel
        if launch_record_path.exists():
            launch_record = load_json(launch_record_path)
            launch_record["version"] = 4
            launch_record["session"]["provider_locator"] = provider_locator
            launch_record["session"]["resumable"] = resumable
            launch_record["session"]["resumable_reason_code"] = resumable_reason_code
            launch_record["session"]["resumable_reason"] = resumable_reason
            validate_contract_payload("native-launch.schema.json", launch_record)
            files[launch_record_rel] = dump_json(launch_record)

    commit_transaction(
        repo_root=repo_root,
        operation="update_session_record_after_launch",
        files=files,
        timestamp=recorded_at,
        metadata={"adapter": adapter, "worker_id": worker_id},
    )
    return {
        "session_record_rel": session_rel,
        "session_record": updated_session,
    }


def write_native_resume_result(
    *,
    repo_root: Path,
    payload: dict[str, Any],
    recorded_at: str,
    resume_mode: str,
    requested_session_id: str,
    resolved_session_id: str | None,
    outcome: str,
    reason_code: str,
    reason: str,
    safety_checks: list[dict[str, Any]],
    provider_metadata: dict[str, Any] | None = None,
    prompt_injected: bool = False,
    session_record: dict[str, Any] | None = None,
    session_record_rel: str | None = None,
    source: str = "resume",
) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    run = load_json(repo_root / ".praxis" / "run.json")
    ensure_run_vnext_defaults(run)

    record_rel = native_resume_record_relpath(
        adapter=payload["adapter"],
        recorded_at=recorded_at,
        worker_id=payload["worker"]["worker_id"],
    )
    trace_path = payload["resume"]["trace_path"]
    record = {
        "version": 1,
        "recorded_at": recorded_at,
        "adapter": payload["adapter"],
        "worker_id": payload["worker"]["worker_id"],
        "run_id": run["run_id"],
        "attempt_kind": "provider_resume",
        "requested_session_id": requested_session_id,
        "resolved_session_id": resolved_session_id,
        "resume_mode": resume_mode,
        "prompt_injected": prompt_injected,
        "safety_checks": safety_checks,
        "outcome": outcome,
        "trace_path": trace_path,
        "session_record_path": session_record_rel,
        "provider_metadata": provider_metadata or {},
        "reason_code": reason_code,
        "reason": reason,
    }
    validate_contract_payload("native-resume.schema.json", record)

    request_event = _resume_event_base(
        payload=payload,
        recorded_at=recorded_at,
        requested_session_id=requested_session_id,
        resolved_session_id=None,
        resume_mode=resume_mode,
        reason_code="provider_resume_requested",
        reason="Attempting provider-native resume from durable Praxis state.",
        resume_record_path=record_rel,
    )
    request_event["type"] = "provider_resume_requested"

    final_event = _resume_event_base(
        payload=payload,
        recorded_at=recorded_at,
        requested_session_id=requested_session_id,
        resolved_session_id=resolved_session_id,
        resume_mode=resume_mode,
        reason_code=reason_code,
        reason=reason,
        resume_record_path=record_rel,
    )
    final_event["type"] = "provider_resume_succeeded" if outcome == "resumed" else "provider_resume_failed"
    if outcome == "resumed":
        final_event["reason_code"] = "provider_resume_succeeded"
        final_event["reason"] = "Provider-native resume completed from the durable Praxis cursor."

    trace_context = build_trace_context_from_payload(payload)
    trace_events = [
        build_trace_event(
            trace_context,
            recorded_at=recorded_at,
            event_type="provider_resume_requested",
            reason_code="provider_resume_requested",
            reason="Attempting provider-native resume from durable Praxis state.",
            extra_fields={
                "resume_record_path": record_rel,
                "requested_session_id": requested_session_id,
                "resolved_session_id": None,
                "resume_mode": resume_mode,
            },
        ),
        build_trace_event(
            trace_context,
            recorded_at=recorded_at,
            event_type="provider_resume_succeeded" if outcome == "resumed" else "provider_resume_failed",
            reason_code="provider_resume_succeeded" if outcome == "resumed" else reason_code,
            reason=(
                "Provider-native resume completed from the durable Praxis cursor."
                if outcome == "resumed"
                else reason
            ),
            extra_fields={
                "resume_record_path": record_rel,
                "requested_session_id": requested_session_id,
                "resolved_session_id": resolved_session_id,
                "resume_mode": resume_mode,
            },
        ),
    ]
    if outcome == "resumed":
        trace_events.append(
            build_trace_event(
                trace_context,
                recorded_at=recorded_at,
                event_type="worker_resumed",
                reason_code="worker_resumed",
                reason="The provider-native resume remains aligned with the durable Praxis cursor.",
                extra_fields={
                    "resume_record_path": record_rel,
                    "requested_session_id": requested_session_id,
                    "resolved_session_id": resolved_session_id,
                    "resume_mode": resume_mode,
                },
            )
        )

    files = {
        trace_path: render_trace_text(
            repo_root=repo_root,
            trace_path=trace_path,
            events=trace_events,
        ),
    }

    updated_session_rel = session_record_rel
    updated_session_record = None
    if outcome == "resumed":
        resolved = resolved_session_id or requested_session_id
        updated_session_rel = session_record_rel or session_record_relpath(payload["adapter"], requested_session_id)
        updated_session_record = _updated_session_record(
            repo_root=repo_root,
            existing=session_record,
            run=run,
            payload=payload,
            requested_session_id=requested_session_id,
            resolved_session_id=resolved,
            recorded_at=recorded_at,
            resume_mode=resume_mode,
            outcome=outcome,
            source=source,
            provider_metadata=provider_metadata or {},
        )
        updated_session_record["provider_metadata"].setdefault("cwd", updated_session_record["cwd"])
        worker_rel, worker_record = _updated_worker_record(
            repo_root=repo_root,
            payload=payload,
            session_record=updated_session_record,
        )
        files[updated_session_rel] = dump_json(updated_session_record)
        files[worker_rel] = dump_json(worker_record)
        mark_worker_resumed(run, session_id=requested_session_id)
    elif (
        session_record is not None
        and int(session_record.get("version", 0)) >= 2
        and session_record_rel is not None
    ):
        updated_session_rel = session_record_rel
        updated_session_record = dict(session_record)
        updated_session_record["last_seen_at"] = recorded_at
        updated_session_record["last_resume_at"] = recorded_at
        updated_session_record["last_resume_outcome"] = outcome
        provider_state = dict(updated_session_record.get("provider_metadata", {}))
        provider_state.update(provider_metadata or {})
        updated_session_record["provider_metadata"] = provider_state
        validate_contract_payload("session-record.schema.json", updated_session_record)
        files[updated_session_rel] = dump_json(updated_session_record)

    record["session_record_path"] = updated_session_rel
    validate_contract_payload("native-resume.schema.json", record)
    files[record_rel] = dump_json(record)

    run["timestamps"]["updated_at"] = recorded_at
    validate_state_payloads(run=run)
    files[".praxis/run.json"] = dump_json(run)

    events = [request_event, final_event]
    if outcome == "resumed":
        events.append(
            _worker_resumed_event(
                payload=payload,
                recorded_at=recorded_at,
                session_id=requested_session_id,
                resume_mode=resume_mode,
                reason=reason,
                resume_record_path=record_rel,
            )
        )
    all_events = extend_event_log(repo_root, events)
    files[".praxis/events.jsonl"] = dump_events(all_events)

    commit_transaction(
        repo_root=repo_root,
        operation="write_native_resume_result",
        files=files,
        timestamp=recorded_at,
        metadata={
            "adapter": payload["adapter"],
            "worker_id": payload["worker"]["worker_id"],
            "outcome": outcome,
        },
    )
    return {
        "record_rel": record_rel,
        "record": record,
        "session_record_rel": updated_session_rel,
        "session_record": updated_session_record,
    }
