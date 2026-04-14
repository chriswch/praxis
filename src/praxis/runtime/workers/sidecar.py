from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..adapters.harness import load_adapter_harness
from ..adapters.native_launch import derive_native_launch_failure_code, write_native_launch_failure, write_native_launch_record
from ..context.bundle import bundle_paths_for_run, load_dispatch_bundle_status, persist_dispatch_bundle
from ..context.compiler import _context_items, _selection_summary, _worker_timeout_minutes
from ..context.tool_manifest import build_tool_manifest
from ..orchestrator import build_dispatch
from ..policy import build_runtime_policy
from ..policy_records import build_dispatch_policy_records
from ..state.contract_validation import validate_contract_payload
from ..state.durable_state import (
    commit_transaction,
    dump_events,
    dump_json,
    extend_event_log,
    load_json,
    recover_pending_transaction,
    validate_handoff_file,
)
from .bookkeeping import build_worker_ownership, candidate_worker_record_relpaths
from .dispatch import _launch_surface, _launch_worker_process, _synthetic_session_id
from .planning import ensure_run_vnext_defaults, stage_expected_outputs, stage_input_artifacts, stage_permission_profile, sync_worker_cursor
from .worktree import ensure_isolated_worktree


_ALLOWED_PROFILES = {"planning", "design", "implementation", "review", "verification"}
_ALLOWED_WORKTREE_MODES = {"shared", "isolated"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _slug(value: str, *, fallback: str = "worker") -> str:
    candidate = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-._")
    return candidate or fallback


def sidecar_artifact_dir(worker_id: str) -> str:
    return f".praxis/runtime/sidecars/{_slug(worker_id)}"


def sidecar_result_path(worker_id: str, stage: str) -> str:
    return f"{sidecar_artifact_dir(worker_id)}/results/{stage}.json"


def sidecar_notes_path(worker_id: str) -> str:
    return f"{sidecar_artifact_dir(worker_id)}/notes.md"


def sidecar_request_relpath(dispatch_id: str) -> str:
    return f".praxis/runtime/dispatches/sidecars/{dispatch_id}/sidecar-request.json"


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def _sidecar_request_event(*, run: dict[str, Any], payload: dict[str, Any], request_path: str, recorded_at: str) -> dict[str, Any]:
    dispatch = payload["dispatch"]
    return {
        "ts": recorded_at,
        "type": "sidecar_dispatch_requested",
        "adapter": run["runtime"]["adapter"],
        "scope": dispatch["scope"],
        "slice_id": dispatch["slice_id"],
        "artifact_dir": dispatch["artifact_dir"],
        "stage": dispatch["stage"],
        "boundary_handoff_path": dispatch["boundary_handoff_path"],
        "worker_id": payload["worker"]["worker_id"],
        "spawned_by_worker_id": payload["ownership"]["spawned_by_worker_id"],
        "reason_code": "sidecar_dispatch_requested",
        "reason": payload["worker"]["reason"],
        "request_path": request_path,
        "dispatch_record_path": payload["bundle"]["dispatch_record_path"],
    }


def _validate_sidecar_args(*, worker_id: str, permission_profile: str, worktree_mode: str) -> None:
    if permission_profile not in _ALLOWED_PROFILES:
        raise ValueError(f"Unsupported permission profile for sidecar dispatch: {permission_profile!r}.")
    if worktree_mode not in _ALLOWED_WORKTREE_MODES:
        raise ValueError(f"Unsupported worktree mode for sidecar dispatch: {worktree_mode!r}.")
    if not worker_id:
        raise ValueError("Sidecar dispatch requires a non-empty worker_id.")


def compile_sidecar_dispatch_bundle(
    *,
    repo_root: Path,
    worker_id: str,
    reason: str,
    stage: str | None = None,
    permission_profile: str | None = None,
    worktree_mode: str = "isolated",
    spawned_by_worker_id: str | None = None,
    artifact_inputs: list[str] | None = None,
    artifact_outputs_expected: list[str] | None = None,
    context_artifact_dir: str | None = None,
) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    recover_pending_transaction(repo_root)

    run = load_json(repo_root / ".praxis" / "run.json")
    ensure_run_vnext_defaults(run)
    sync_worker_cursor(run)
    if run.get("current", {}).get("stage") is None:
        raise ValueError("Praxis cannot dispatch a sidecar without an active owner stage.")

    stage_name = stage or run["current"]["stage"]
    profile = permission_profile or stage_permission_profile(stage_name)
    _validate_sidecar_args(worker_id=worker_id, permission_profile=profile, worktree_mode=worktree_mode)

    owner_dispatch = build_dispatch(repo_root, run=run)
    owner_artifact_dir = context_artifact_dir or owner_dispatch["artifact_dir"] or run["current"]["artifact_dir"]
    sidecar_dir = sidecar_artifact_dir(worker_id)
    result_path = sidecar_result_path(worker_id, stage_name)
    notes_path = sidecar_notes_path(worker_id)

    dispatch = {
        "action": "run_stage",
        "workflow": run["workflow"],
        "adapter": run["runtime"]["adapter"],
        "entrypoint": run["runtime"]["entrypoint"],
        "scope": run["current"].get("scope"),
        "slice_id": run["current"].get("slice_id"),
        "artifact_dir": sidecar_dir,
        "stage": stage_name,
        "boundary_handoff_path": run["routing"].get("boundary_handoff_path"),
        "stage_result_path": result_path,
    }
    config_rel, harness = load_adapter_harness(repo_root=repo_root, adapter=run["runtime"]["adapter"])

    handoff_path = dispatch.get("boundary_handoff_path")
    handoff_payload = validate_handoff_file(repo_root / handoff_path) if handoff_path else None
    effective_spawned_by = spawned_by_worker_id or run["current"].get("worker_id")
    ownership = build_worker_ownership(
        worker_id=worker_id,
        worker_class="subagent_worker",
        spawned_by_worker_id=effective_spawned_by,
    )
    bundle = bundle_paths_for_run(
        run,
        dispatch,
        worker_id=worker_id,
        worker_class="subagent_worker",
    )

    default_inputs = stage_input_artifacts(run=run, stage=stage_name, artifact_dir=owner_artifact_dir)
    extra_inputs = list(artifact_inputs or [])
    artifact_inputs_resolved = _dedupe(default_inputs + extra_inputs)
    default_outputs = [result_path, notes_path]
    artifact_outputs_resolved = _dedupe(default_outputs + list(artifact_outputs_expected or []))

    payload = {
        "version": 3,
        "workflow": run["workflow"],
        "adapter": run["runtime"]["adapter"],
        "dispatch": dispatch,
        "inputs": {
            "run_path": ".praxis/run.json",
            "boundary_handoff_path": handoff_path,
            "boundary_handoff": handoff_payload,
        },
        "context_policy": {
            "fresh_context": True,
            "carry_forward_mode": "boundary_handoff_only",
            "allowed_context_sources": [
                "dispatch",
                "run_metadata",
                "boundary_handoff",
                "artifact_input",
                "harness_surface",
            ],
            "handoff_injected": handoff_payload is not None,
        },
        "harness": {
            "config_path": config_rel,
            "instructions_path": harness["instructions_path"],
            "project_config_path": harness["project_config_path"],
            "hooks_path": harness["hooks_path"],
            "agents_path": harness["agents_path"],
            "worker_launch_command": harness["worker_launch_command"],
            "extension_points": harness["extension_points"],
            "compatibility": harness.get("compatibility"),
        },
        "bundle": bundle,
        "worker": {
            "worker_id": worker_id,
            "worker_class": "subagent_worker",
            "reuse_policy": "none",
            "review_independence": False,
            "worktree_mode": worktree_mode,
            "fresh_context": True,
            "reason": reason,
            "worktree_path": "." if worktree_mode == "shared" else f".praxis/runtime/worktrees/{worker_id}",
        },
        "ownership": ownership,
        "budgets": {
            "run_max_turns": run["budgets"]["run_max_turns"],
            "run_max_workers": run["budgets"]["run_max_workers"],
            "soft_cost_usd": run["budgets"]["soft_cost_usd"],
            "hard_cost_usd": run["budgets"]["hard_cost_usd"],
            "worker_timeout_minutes": _worker_timeout_minutes(stage_name),
        },
        "artifact_inputs": artifact_inputs_resolved,
        "artifact_outputs_expected": artifact_outputs_resolved,
        "resume": {
            "strategy": None,
            "session_id": None,
            "resumable": False,
            "resume_attempted": False,
            "mode": "headless" if run["execution"]["mode"] == "autopilot" else "interactive",
            "trace_path": f".praxis/runtime/traces/{worker_id}.jsonl",
        },
    }
    payload["permissions"] = build_runtime_policy(
        adapter=payload["adapter"],
        permission_profile=profile,
        worktree_mode=worktree_mode,
        worktree_path=payload["worker"]["worktree_path"],
        artifact_dir=sidecar_dir,
        ownership_kind=ownership["kind"],
    )
    validate_contract_payload("worker-launch.schema.json", payload)

    tool_manifest = build_tool_manifest(run=run, payload=payload)
    items = _context_items(payload=payload)
    selection_summary = _selection_summary(items)
    context_manifest = {
        "version": 1,
        "dispatch_id": bundle["dispatch_id"],
        "run_id": run["run_id"],
        "generated_at": _utc_now(),
        "dispatch": {
            "workflow": payload["workflow"],
            "adapter": payload["adapter"],
            "scope": dispatch["scope"],
            "slice_id": dispatch["slice_id"],
            "artifact_dir": dispatch["artifact_dir"],
            "stage": dispatch["stage"],
            "boundary_handoff_path": dispatch["boundary_handoff_path"],
            "transition_id": str(run["control"]["last_transition_id"]),
        },
        "worker": {
            "worker_id": worker_id,
            "worker_class": "subagent_worker",
            "permission_profile": profile,
            "worktree_mode": worktree_mode,
            "fresh_context": True,
        },
        "runtime_policy": payload["permissions"],
        "context_policy": {
            "carry_forward_mode": payload["context_policy"]["carry_forward_mode"],
            "handoff_injected": payload["context_policy"]["handoff_injected"],
            "allowed_context_sources": payload["context_policy"]["allowed_context_sources"],
            "selected_item_count": selection_summary["total_items"],
            "max_item_count": selection_summary["max_items"],
        },
        "bundle": {
            "bundle_dir": bundle["bundle_dir"],
            "worker_launch_path": bundle["worker_launch_path"],
            "dispatch_record_path": bundle["dispatch_record_path"],
            "context_manifest_path": bundle["context_manifest_path"],
            "tool_manifest_path": bundle["tool_manifest_path"],
        },
        "selection_summary": selection_summary,
        "items": items,
    }
    validate_contract_payload("context-manifest.schema.json", context_manifest)

    dispatch_record = {
        "version": 1,
        "dispatch_id": bundle["dispatch_id"],
        "run_id": run["run_id"],
        "recorded_at": _utc_now(),
        "status": "intent_recorded",
        "dispatch": {
            "workflow": payload["workflow"],
            "adapter": payload["adapter"],
            "entrypoint": dispatch["entrypoint"],
            "scope": dispatch["scope"],
            "slice_id": dispatch["slice_id"],
            "artifact_dir": dispatch["artifact_dir"],
            "stage": dispatch["stage"],
            "boundary_handoff_path": dispatch["boundary_handoff_path"],
            "transition_id": str(run["control"]["last_transition_id"]),
            "reason": reason,
        },
        "worker": {
            "worker_id": worker_id,
            "worker_class": "subagent_worker",
            "reuse_policy": "none",
            "permission_profile": profile,
            "worktree_mode": worktree_mode,
            "fresh_context": True,
        },
        "resume": {
            "strategy": None,
            "session_id": None,
            "resumable": False,
            "mode": payload["resume"]["mode"],
        },
        "bundle": {
            "bundle_dir": bundle["bundle_dir"],
            "worker_launch_path": bundle["worker_launch_path"],
            "dispatch_record_path": bundle["dispatch_record_path"],
            "context_manifest_path": bundle["context_manifest_path"],
            "tool_manifest_path": bundle["tool_manifest_path"],
        },
        "isolation": {
            "worker_id": worker_id,
            "mode": worktree_mode,
            "worktree_path": payload["worker"]["worktree_path"],
            "product_worktree_path": ".",
            "review_independence_required": False,
            "product_worktree_mutation_allowed": worktree_mode != "isolated",
            "runtime_state_channel": "projected_control_plane" if worktree_mode == "isolated" else "direct_repo",
            "control_plane_access": payload["permissions"]["control_plane_access"],
            "guardrail_reason_code": "sidecar_non_owner_isolation" if worktree_mode == "isolated" else "sidecar_shared_workspace",
            "guardrail_reason": (
                "This sidecar uses a projected isolated worktree so it cannot mutate shared control-plane state directly."
                if worktree_mode == "isolated"
                else "This sidecar runs in the shared workspace and relies on brokered tooling for bounded writes."
            ),
        },
        "ownership": ownership,
        "artifact_inputs": artifact_inputs_resolved,
        "artifact_outputs_expected": artifact_outputs_resolved,
        "resolution": {
            "status": "intent_recorded",
            "updated_at": _utc_now(),
            "resolved": False,
            "reason_code": "intent_recorded",
            "reason": "Praxis recorded the sidecar dispatch intent before adapter launch began.",
            "native_launch_record_path": None,
            "native_resume_record_path": None,
            "worker_record_path": None,
            "session_record_path": None,
        },
    }
    validate_contract_payload("dispatch-record.schema.json", dispatch_record)

    request_path = sidecar_request_relpath(bundle["dispatch_id"])
    request_payload = {
        "version": 1,
        "recorded_at": _utc_now(),
        "run_id": run["run_id"],
        "dispatch_id": bundle["dispatch_id"],
        "adapter": run["runtime"]["adapter"],
        "workflow": run["workflow"],
        "parent": {
            "scope": run["current"].get("scope"),
            "slice_id": run["current"].get("slice_id"),
            "artifact_dir": owner_artifact_dir,
            "stage": run["current"].get("stage"),
            "worker_id": run["current"].get("worker_id"),
        },
        "dispatch": {
            "scope": dispatch["scope"],
            "slice_id": dispatch["slice_id"],
            "artifact_dir": dispatch["artifact_dir"],
            "stage": dispatch["stage"],
            "boundary_handoff_path": dispatch["boundary_handoff_path"],
            "stage_result_path": dispatch["stage_result_path"],
        },
        "worker": {
            "worker_id": worker_id,
            "worker_class": "subagent_worker",
            "permission_profile": profile,
            "worktree_mode": worktree_mode,
            "spawned_by_worker_id": effective_spawned_by,
            "reason": reason,
        },
        "ownership": ownership,
        "artifact_inputs": artifact_inputs_resolved,
        "artifact_outputs_expected": artifact_outputs_resolved,
        "bundle": {
            "bundle_dir": bundle["bundle_dir"],
            "worker_launch_path": bundle["worker_launch_path"],
            "dispatch_record_path": bundle["dispatch_record_path"],
            "context_manifest_path": bundle["context_manifest_path"],
            "tool_manifest_path": bundle["tool_manifest_path"],
        },
    }
    validate_contract_payload("sidecar-request.schema.json", request_payload)

    policy_records = build_dispatch_policy_records(
        run=run,
        payload=payload,
        recorded_at=_utc_now(),
    )
    events = extend_event_log(
        repo_root,
        [_sidecar_request_event(run=run, payload=payload, request_path=request_path, recorded_at=_utc_now())],
    )
    status = persist_dispatch_bundle(
        repo_root=repo_root,
        payload=payload,
        dispatch_record=dispatch_record,
        context_manifest=context_manifest,
        extra_files={
            payload["bundle"]["tool_manifest_path"]: dump_json(tool_manifest),
            request_path: dump_json(request_payload),
            ".praxis/events.jsonl": dump_events(events),
            **{path: dump_json(record) for path, record in policy_records},
        },
        timestamp=_utc_now(),
    )
    return {
        "launch": payload,
        "dispatch_record": dispatch_record,
        "context_manifest": context_manifest,
        "tool_manifest": tool_manifest,
        "sidecar_request": request_payload,
        "sidecar_request_path": request_path,
        "policy_records": [{"record_path": path, "gate_type": record["gate_type"]} for path, record in policy_records],
        "dispatch_bundle": status or load_dispatch_bundle_status(repo_root=repo_root, bundle=payload["bundle"]),
    }


def dispatch_sidecar_worker(
    *,
    repo_root: Path,
    worker_id: str,
    reason: str,
    timestamp: str,
    stage: str | None = None,
    permission_profile: str | None = None,
    worktree_mode: str = "isolated",
    spawned_by_worker_id: str | None = None,
    artifact_inputs: list[str] | None = None,
    artifact_outputs_expected: list[str] | None = None,
    context_artifact_dir: str | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    compiled = compile_sidecar_dispatch_bundle(
        repo_root=repo_root,
        worker_id=worker_id,
        reason=reason,
        stage=stage,
        permission_profile=permission_profile,
        worktree_mode=worktree_mode,
        spawned_by_worker_id=spawned_by_worker_id,
        artifact_inputs=artifact_inputs,
        artifact_outputs_expected=artifact_outputs_expected,
        context_artifact_dir=context_artifact_dir,
    )
    payload = compiled["launch"]
    worktree_path = repo_root
    if payload["worker"]["worktree_mode"] == "isolated":
        worktree_path = ensure_isolated_worktree(
            repo_root=repo_root,
            worker_id=payload["worker"]["worker_id"],
            payload=payload,
        )

    launch_surface = _launch_surface(payload["adapter"])
    hook_request = {
        "session_id": session_id
        or _synthetic_session_id(
            adapter=payload["adapter"],
            worker_id=payload["worker"]["worker_id"],
            timestamp=timestamp,
        ),
        "source": "control_plane_sidecar",
        "cwd": str(worktree_path),
        "launch_surface": launch_surface,
    }
    try:
        launcher_pid = _launch_worker_process(
            repo_root=repo_root,
            command=payload["harness"]["worker_launch_command"],
            payload_relpath=payload["bundle"]["worker_launch_path"],
        )
        hook_request["launcher_pid"] = launcher_pid
        write_native_launch_record(
            repo_root=repo_root,
            payload=payload,
            hook_request=hook_request,
            recorded_at=timestamp,
            extra_events=[],
        )
    except Exception as exc:
        write_native_launch_failure(
            repo_root=repo_root,
            launch_context={
                "adapter": payload["adapter"],
                "dispatch": payload["dispatch"],
                "worker_plan": {"trace_path": payload["resume"]["trace_path"]},
                "bundle": payload["bundle"],
                "handoff_status": None,
            },
            hook_request=hook_request,
            recorded_at=timestamp,
            reason_code=derive_native_launch_failure_code(handoff_status=None, exc=exc),
            reason=str(exc),
        )
        raise

    return {
        "action": "launch_sidecar",
        "dispatch_id": payload["bundle"]["dispatch_id"],
        "worker_id": payload["worker"]["worker_id"],
        "request_path": compiled["sidecar_request_path"],
        "dispatch_bundle": load_dispatch_bundle_status(repo_root=repo_root, bundle=payload["bundle"]),
    }


def list_sidecar_workers(*, repo_root: Path) -> list[dict[str, Any]]:
    repo_root = repo_root.resolve()
    workers_root = repo_root / ".praxis" / "runtime" / "workers" / "sidecars"
    if not workers_root.exists():
        return []
    items: list[dict[str, Any]] = []
    for path in sorted(workers_root.glob("*.json")):
        payload = load_json(path)
        validate_contract_payload("worker-record.schema.json", payload)
        request_path = sidecar_request_relpath(str(payload.get("dispatch_id") or "")) if payload.get("dispatch_id") else None
        items.append(
            {
                "worker_id": payload["worker_id"],
                "status": payload["status"],
                "worker_class": payload["worker_class"],
                "dispatch_id": payload.get("dispatch_id"),
                "dispatch_record_path": payload.get("dispatch_record_path"),
                "session_id": payload.get("session_id"),
                "trace_path": payload.get("trace_path"),
                "request_path": request_path,
                "request_exists": bool(request_path and (repo_root / request_path).exists()),
                "spawned_by_worker_id": (payload.get("ownership") or {}).get("spawned_by_worker_id"),
                "stage_result_expected": (payload.get("ownership") or {}).get("stage_result_expected"),
                "run_routing_owned": (payload.get("ownership") or {}).get("run_routing_owned"),
                "artifact_namespace": (payload.get("ownership") or {}).get("artifact_namespace"),
            }
        )
    return items


def sidecar_worker_record_exists(*, repo_root: Path, worker_id: str) -> bool:
    repo_root = repo_root.resolve()
    return any((repo_root / relpath).exists() for relpath in candidate_worker_record_relpaths(worker_id) if "/sidecars/" in relpath)
