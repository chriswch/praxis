from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from ..adapters.native_resume import session_record_relpath
from ..orchestrator import build_dispatch
from ..policy_records import build_dispatch_policy_records
from ..state.contract_validation import validate_contract_payload
from ..state.durable_state import commit_transaction, dump_json, load_json, validate_handoff_file
from ..workers.planning import (
    build_worker_plan,
    ensure_run_vnext_defaults,
    stage_expected_outputs,
    stage_input_artifacts,
    sync_worker_cursor,
)
from .bundle import bundle_paths_for_run, load_dispatch_bundle_status, persist_dispatch_bundle
from .tool_manifest import build_tool_manifest

HarnessLoader = Callable[..., tuple[str, dict[str, Any]]]
CONTEXT_ITEM_BUDGET = 16


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _worker_timeout_minutes(stage: str | None) -> int:
    stage_timeouts = {
        "clarifying-intent": 20,
        "slicing-stories": 20,
        "sketching-design": 30,
        "driving-tdd": 90,
        "rapid-implementing": 90,
        "code-reviewing": 30,
        "code-improving": 60,
        "verifying-and-adapting": 30,
    }
    return stage_timeouts.get(stage, 45)


def _resume_cursor_state(*, repo_root: Path, adapter: str, session_id: str | None) -> bool:
    if not session_id:
        return False
    session_path = repo_root / session_record_relpath(adapter, session_id)
    if not session_path.exists():
        return False
    try:
        payload = load_json(session_path)
        validate_contract_payload("session-record.schema.json", payload)
    except Exception:
        return False
    return bool(payload.get("resumable"))


def _extension_point_items(harness: dict[str, Any]) -> list[dict[str, Any]]:
    labels = {
        "mcp_config_path": (
            "Repo-scoped extension metadata constrains adapter capabilities.",
            "harness_extension_metadata",
        ),
        "resources_path": (
            "Repo-scoped resources define bounded adapter context extensions.",
            "harness_resources",
        ),
        "tool_overrides_path": (
            "Repo-scoped tool overrides shape the worker tool surface.",
            "harness_tool_overrides",
        ),
        "notes_path": (
            "Repo-scoped notes preserve adapter-specific runtime guidance.",
            "harness_notes",
        ),
    }
    items: list[dict[str, Any]] = []
    for key, (reason, reason_code) in labels.items():
        path = harness["extension_points"].get(key)
        if path is None:
            continue
        items.append(
            _context_item(
                kind="harness_surface",
                path=path,
                inline_id=key,
                required=False,
                selection_phase="default",
                reason_code=reason_code,
                reason=reason,
            )
        )
    return items


def _context_item(
    *,
    kind: str,
    path: str | None,
    inline_id: str | None,
    required: bool,
    selection_phase: str,
    reason_code: str,
    reason: str,
) -> dict[str, Any]:
    return {
        "kind": kind,
        "path": path,
        "inline_id": inline_id,
        "required": required,
        "selection_phase": selection_phase,
        "reason_code": reason_code,
        "reason": reason,
    }


def _context_items(*, payload: dict[str, Any]) -> list[dict[str, Any]]:
    dispatch = payload["dispatch"]
    inputs = payload["inputs"]
    harness = payload["harness"]
    artifact_inputs = payload["artifact_inputs"]
    items = [
        _context_item(
            kind="dispatch",
            path=None,
            inline_id="dispatch",
            required=True,
            selection_phase="default",
            reason_code="dispatch_assignment",
            reason="Dispatch metadata defines the bounded stage assignment for this worker.",
        ),
        _context_item(
            kind="run_metadata",
            path=inputs["run_path"],
            inline_id="run_metadata",
            required=True,
            selection_phase="default",
            reason_code="run_cursor_required",
            reason="Durable run metadata lets the worker align with the active control-plane stage.",
        ),
    ]
    handoff_path = inputs.get("boundary_handoff_path")
    if handoff_path is not None:
        items.append(
            _context_item(
                kind="boundary_handoff",
                path=handoff_path,
                inline_id="boundary_handoff",
                required=True,
                selection_phase="carry_forward",
                reason_code="boundary_handoff_only",
                reason="The validated boundary handoff is the only approved cross-story carry-forward context.",
            )
        )

    for artifact_path in artifact_inputs:
        if artifact_path in {inputs["run_path"], handoff_path}:
            continue
        items.append(
            _context_item(
                kind="artifact_input",
                path=artifact_path,
                inline_id=None,
                required=True,
                selection_phase="stage_specific",
                reason_code="stage_artifact_input",
                reason=f"Stage {dispatch['stage']} declares this artifact as part of the bounded worker context.",
            )
        )

    harness_items = [
        _context_item(
            kind="harness_surface",
            path=harness["instructions_path"],
            inline_id="instructions_path",
            required=True,
            selection_phase="default",
            reason_code="harness_instructions",
            reason="Repo-scoped native instructions define the worker's adapter-facing operating rules.",
        ),
        _context_item(
            kind="harness_surface",
            path=harness["hooks_path"],
            inline_id="hooks_path",
            required=True,
            selection_phase="default",
            reason_code="harness_hooks",
            reason="Repo-scoped hooks define native trace and lifecycle behavior.",
        ),
        _context_item(
            kind="harness_surface",
            path=harness["agents_path"],
            inline_id="agents_path",
            required=True,
            selection_phase="default",
            reason_code="harness_agents",
            reason="Repo-scoped agent patterns are part of the bounded native harness.",
        ),
    ]
    project_config_path = harness.get("project_config_path")
    if project_config_path is not None:
        harness_items.append(
            _context_item(
                kind="harness_surface",
                path=project_config_path,
                inline_id="project_config_path",
                required=False,
                selection_phase="default",
                reason_code="harness_project_config",
                reason="Repo-scoped native project settings keep adapter configuration committed and inspectable.",
            )
        )
    harness_items.extend(_extension_point_items(harness))
    items.extend(harness_items)
    return items


def _selection_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    counts = {
        "default": 0,
        "stage_specific": 0,
        "carry_forward": 0,
    }
    for item in items:
        counts[item["selection_phase"]] += 1
    summary = {
        "total_items": len(items),
        "max_items": CONTEXT_ITEM_BUDGET,
        "within_budget": len(items) <= CONTEXT_ITEM_BUDGET,
        "default_item_count": counts["default"],
        "stage_specific_item_count": counts["stage_specific"],
        "carry_forward_item_count": counts["carry_forward"],
    }
    if not summary["within_budget"]:
        raise ValueError(
            "Praxis context selection exceeded the bounded context item budget: "
            f"{len(items)} items > {CONTEXT_ITEM_BUDGET}."
        )
    return summary


def _build_compiled_payload(
    *,
    repo_root: Path,
    harness_loader: HarnessLoader,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    run = load_json(repo_root / ".praxis" / "run.json")
    ensure_run_vnext_defaults(run)
    sync_worker_cursor(run)
    dispatch = build_dispatch(repo_root, run=run)
    config_rel, harness = harness_loader(repo_root=repo_root, adapter=run["runtime"]["adapter"])

    handoff_path = dispatch.get("boundary_handoff_path")
    handoff_payload = validate_handoff_file(repo_root / handoff_path) if handoff_path else None
    worker_plan = build_worker_plan(run)
    if worker_plan is None:
        raise ValueError("Praxis cannot build a worker launch payload without an active stage.")

    stage = dispatch.get("stage")
    artifact_dir = dispatch.get("artifact_dir") or run["current"]["artifact_dir"]
    trace_path = worker_plan["trace_path"]
    bundle = bundle_paths_for_run(run, dispatch)

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
            "fresh_context": worker_plan["fresh_context"],
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
            "worker_id": run["current"]["worker_id"],
            "worker_class": worker_plan["worker_class"],
            "reuse_policy": worker_plan["reuse_policy"],
            "review_independence": worker_plan["review_independence"],
            "worktree_mode": worker_plan["worktree_mode"],
            "fresh_context": worker_plan["fresh_context"],
            "reason": worker_plan["reason"],
            "worktree_path": (
                "."
                if worker_plan["worktree_mode"] == "shared"
                else f".praxis/runtime/worktrees/{run['current']['worker_id']}"
            ),
        },
        "permissions": {
            "profile": worker_plan["permission_profile"],
            "filesystem_scope": "workspace-write",
            "network_access": "restricted",
            "destructive_commands_allowed": False,
        },
        "budgets": {
            "run_max_turns": run["budgets"]["run_max_turns"],
            "run_max_workers": run["budgets"]["run_max_workers"],
            "soft_cost_usd": run["budgets"]["soft_cost_usd"],
            "hard_cost_usd": run["budgets"]["hard_cost_usd"],
            "worker_timeout_minutes": _worker_timeout_minutes(stage),
        },
        "artifact_inputs": stage_input_artifacts(run=run, stage=stage, artifact_dir=artifact_dir),
        "artifact_outputs_expected": stage_expected_outputs(run=run, stage=stage, artifact_dir=artifact_dir),
        "resume": {
            "strategy": run["routing"]["resume_strategy"],
            "session_id": run["current"]["session_id"],
            "resumable": _resume_cursor_state(
                repo_root=repo_root,
                adapter=run["runtime"]["adapter"],
                session_id=run["current"]["session_id"],
            ),
            "resume_attempted": False,
            "mode": "headless" if run["execution"]["mode"] == "autopilot" else "interactive",
            "trace_path": trace_path,
        },
    }
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
            "worker_id": payload["worker"]["worker_id"],
            "worker_class": payload["worker"]["worker_class"],
            "permission_profile": payload["permissions"]["profile"],
            "worktree_mode": payload["worker"]["worktree_mode"],
            "fresh_context": payload["worker"]["fresh_context"],
        },
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
            "reason": payload["worker"]["reason"],
        },
        "worker": {
            "worker_id": payload["worker"]["worker_id"],
            "worker_class": payload["worker"]["worker_class"],
            "reuse_policy": payload["worker"]["reuse_policy"],
            "permission_profile": payload["permissions"]["profile"],
            "worktree_mode": payload["worker"]["worktree_mode"],
            "fresh_context": payload["worker"]["fresh_context"],
        },
        "resume": {
            "strategy": payload["resume"]["strategy"],
            "session_id": payload["resume"]["session_id"],
            "resumable": payload["resume"]["resumable"],
            "mode": payload["resume"]["mode"],
        },
        "bundle": {
            "bundle_dir": bundle["bundle_dir"],
            "worker_launch_path": bundle["worker_launch_path"],
            "dispatch_record_path": bundle["dispatch_record_path"],
            "context_manifest_path": bundle["context_manifest_path"],
            "tool_manifest_path": bundle["tool_manifest_path"],
        },
        "artifact_inputs": payload["artifact_inputs"],
        "artifact_outputs_expected": payload["artifact_outputs_expected"],
        "resolution": {
            "status": "intent_recorded",
            "updated_at": _utc_now(),
            "resolved": False,
            "reason_code": "intent_recorded",
            "reason": "Praxis recorded the dispatch intent before adapter launch or resume began.",
            "native_launch_record_path": None,
            "native_resume_record_path": None,
            "worker_record_path": None,
            "session_record_path": None,
        },
    }
    validate_contract_payload("dispatch-record.schema.json", dispatch_record)
    return payload, context_manifest, dispatch_record, tool_manifest


def _build_dispatch_intent_record(
    *,
    repo_root: Path,
) -> dict[str, Any]:
    run = load_json(repo_root / ".praxis" / "run.json")
    ensure_run_vnext_defaults(run)
    sync_worker_cursor(run)
    dispatch = build_dispatch(repo_root, run=run)
    worker_plan = build_worker_plan(run)
    if worker_plan is None:
        raise ValueError("Praxis cannot build a dispatch intent record without an active stage.")

    stage = dispatch.get("stage")
    artifact_dir = dispatch.get("artifact_dir") or run["current"]["artifact_dir"]
    bundle = bundle_paths_for_run(run, dispatch)
    dispatch_record = {
        "version": 1,
        "dispatch_id": bundle["dispatch_id"],
        "run_id": run["run_id"],
        "recorded_at": _utc_now(),
        "status": "intent_recorded",
        "dispatch": {
            "workflow": run["workflow"],
            "adapter": run["runtime"]["adapter"],
            "entrypoint": dispatch["entrypoint"],
            "scope": dispatch["scope"],
            "slice_id": dispatch["slice_id"],
            "artifact_dir": dispatch["artifact_dir"],
            "stage": dispatch["stage"],
            "boundary_handoff_path": dispatch["boundary_handoff_path"],
            "transition_id": str(run["control"]["last_transition_id"]),
            "reason": worker_plan["reason"],
        },
        "worker": {
            "worker_id": run["current"]["worker_id"],
            "worker_class": worker_plan["worker_class"],
            "reuse_policy": worker_plan["reuse_policy"],
            "permission_profile": worker_plan["permission_profile"],
            "worktree_mode": worker_plan["worktree_mode"],
            "fresh_context": worker_plan["fresh_context"],
        },
        "resume": {
            "strategy": run["routing"]["resume_strategy"],
            "session_id": run["current"]["session_id"],
            "resumable": _resume_cursor_state(
                repo_root=repo_root,
                adapter=run["runtime"]["adapter"],
                session_id=run["current"]["session_id"],
            ),
            "mode": "headless" if run["execution"]["mode"] == "autopilot" else "interactive",
        },
        "bundle": {
            "bundle_dir": bundle["bundle_dir"],
            "worker_launch_path": bundle["worker_launch_path"],
            "dispatch_record_path": bundle["dispatch_record_path"],
            "context_manifest_path": bundle["context_manifest_path"],
            "tool_manifest_path": bundle["tool_manifest_path"],
        },
        "artifact_inputs": stage_input_artifacts(run=run, stage=stage, artifact_dir=artifact_dir),
        "artifact_outputs_expected": stage_expected_outputs(run=run, stage=stage, artifact_dir=artifact_dir),
        "resolution": {
            "status": "intent_recorded",
            "updated_at": _utc_now(),
            "resolved": False,
            "reason_code": "intent_recorded",
            "reason": "Praxis recorded the dispatch intent before adapter launch or resume began.",
            "native_launch_record_path": None,
            "native_resume_record_path": None,
            "worker_record_path": None,
            "session_record_path": None,
        },
    }
    validate_contract_payload("dispatch-record.schema.json", dispatch_record)
    return dispatch_record


def build_worker_launch_payload(*, repo_root: Path, harness_loader: HarnessLoader) -> dict[str, Any]:
    payload, _, _, _ = _build_compiled_payload(repo_root=repo_root.resolve(), harness_loader=harness_loader)
    return payload


def compile_dispatch_bundle(*, repo_root: Path, harness_loader: HarnessLoader) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    initial_dispatch_record = _build_dispatch_intent_record(repo_root=repo_root)
    commit_transaction(
        repo_root=repo_root,
        operation="persist_dispatch_intent_record",
        files={initial_dispatch_record["bundle"]["dispatch_record_path"]: dump_json(initial_dispatch_record)},
        timestamp=_utc_now(),
        metadata={"dispatch_id": initial_dispatch_record["dispatch_id"]},
    )
    payload, context_manifest, dispatch_record, tool_manifest = _build_compiled_payload(
        repo_root=repo_root,
        harness_loader=harness_loader,
    )
    run = load_json(repo_root / ".praxis" / "run.json")
    ensure_run_vnext_defaults(run)
    sync_worker_cursor(run)
    policy_records = build_dispatch_policy_records(
        run=run,
        payload=payload,
        recorded_at=_utc_now(),
    )
    status = persist_dispatch_bundle(
        repo_root=repo_root,
        payload=payload,
        dispatch_record=dispatch_record,
        context_manifest=context_manifest,
        extra_files={
            payload["bundle"]["tool_manifest_path"]: dump_json(tool_manifest),
            **{path: dump_json(record) for path, record in policy_records},
        },
        timestamp=_utc_now(),
    )
    return {
        "launch": payload,
        "dispatch_record": dispatch_record,
        "context_manifest": context_manifest,
        "tool_manifest": tool_manifest,
        "policy_records": [{"record_path": path, "gate_type": record["gate_type"]} for path, record in policy_records],
        "dispatch_bundle": status or load_dispatch_bundle_status(repo_root=repo_root, bundle=payload["bundle"]),
    }
