from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .state.contract_validation import validate_contract_payload
from .state.durable_state import load_json
from .workers.planning import build_worker_plan, ensure_run_vnext_defaults


def _slug(value: str, *, fallback: str) -> str:
    candidate = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-._")
    return candidate or fallback


def _dispatch_from_run(run: dict[str, Any]) -> dict[str, Any] | None:
    current = run.get("current", {})
    routing = run.get("routing", {})
    artifact_dir = current.get("artifact_dir")
    stage = current.get("stage") or routing.get("next_stage")
    if artifact_dir is None or stage is None:
        return None
    return {
        "scope": current.get("scope"),
        "slice_id": current.get("slice_id"),
        "artifact_dir": artifact_dir,
        "stage": stage,
    }


def _bundle_paths_for_run(run: dict[str, Any], dispatch: dict[str, Any]) -> dict[str, str]:
    transition_id = str(run.get("control", {}).get("last_transition_id") or "tx_000")
    worker_id = str(run.get("current", {}).get("worker_id") or "worker")
    stage = str(dispatch.get("stage") or "stage")
    dispatch_id = _slug(f"{transition_id}-{worker_id}-{stage}", fallback="dispatch")
    bundle_dir = f".praxis/runtime/dispatches/{dispatch_id}"
    return {
        "dispatch_id": dispatch_id,
        "dispatch_record_path": f"{bundle_dir}/dispatch-record.json",
        "context_manifest_path": f"{bundle_dir}/context-manifest.json",
    }


def policy_record_relpath(
    *,
    recorded_at: str,
    gate_type: str,
    worker_id: str | None,
    dispatch_id: str | None,
    slice_id: str | None,
    source: str | None = None,
) -> str:
    if dispatch_id and gate_type != "story_boundary" and source == "dispatch_compiler":
        return f".praxis/runtime/policies/{dispatch_id}-{gate_type}.json"
    ts = recorded_at.replace("-", "").replace(":", "").replace(".", "")
    suffix = _slug(slice_id or worker_id or gate_type, fallback=gate_type)
    return f".praxis/runtime/policies/{ts}-{gate_type}-{suffix}.json"


def build_policy_record(
    *,
    run: dict[str, Any],
    recorded_at: str,
    gate_type: str,
    decision: str,
    source: str,
    reason_code: str,
    reason: str,
    configured_value: str | bool | None,
    dispatch_id: str | None = None,
    dispatch_record_path: str | None = None,
    context_manifest_path: str | None = None,
    worker_class: str | None = None,
    worker_id: str | None = None,
    permission_profile: str | None = None,
    worktree_mode: str | None = None,
    scope: str | None = None,
    slice_id: str | None = None,
    artifact_dir: str | None = None,
    stage: str | None = None,
) -> tuple[str, dict[str, Any]]:
    ensure_run_vnext_defaults(run)
    dispatch = _dispatch_from_run(run)
    bundle = _bundle_paths_for_run(run, dispatch) if dispatch is not None else None
    current = run.get("current", {})
    worker_plan = build_worker_plan(run)
    record = {
      "version": 1,
      "recorded_at": recorded_at,
      "run_id": run["run_id"],
      "workflow": run["workflow"],
      "scope": current.get("scope") if scope is None else scope,
      "slice_id": current.get("slice_id") if slice_id is None else slice_id,
      "artifact_dir": current.get("artifact_dir") if artifact_dir is None else artifact_dir,
      "stage": current.get("stage") if stage is None else stage,
      "worker_id": current.get("worker_id") if worker_id is None else worker_id,
      "worker_class": worker_class if worker_class is not None else (worker_plan or {}).get("worker_class"),
      "permission_profile": permission_profile if permission_profile is not None else (worker_plan or {}).get("permission_profile"),
      "worktree_mode": worktree_mode if worktree_mode is not None else (worker_plan or {}).get("worktree_mode"),
      "dispatch_id": dispatch_id if dispatch_id is not None else (bundle["dispatch_id"] if bundle is not None else None),
      "dispatch_record_path": dispatch_record_path if dispatch_record_path is not None else (bundle["dispatch_record_path"] if bundle is not None else None),
      "context_manifest_path": context_manifest_path if context_manifest_path is not None else (bundle["context_manifest_path"] if bundle is not None else None),
      "gate_type": gate_type,
      "configured_value": configured_value,
      "decision": decision,
      "source": source,
      "reason_code": reason_code,
      "reason": reason,
    }
    validate_contract_payload("policy-record.schema.json", record)
    return (
        policy_record_relpath(
            recorded_at=recorded_at,
            gate_type=gate_type,
            worker_id=current.get("worker_id"),
            dispatch_id=record["dispatch_id"],
            slice_id=current.get("slice_id"),
            source=source,
        ),
        record,
    )


def build_dispatch_policy_records(
    *,
    run: dict[str, Any],
    payload: dict[str, Any],
    recorded_at: str,
) -> list[tuple[str, dict[str, Any]]]:
    permissions = payload["permissions"]
    worker = payload["worker"]
    dispatch_id = payload["bundle"]["dispatch_id"]
    dispatch_record_path = payload["bundle"]["dispatch_record_path"]
    context_manifest_path = payload["bundle"]["context_manifest_path"]
    configured = [
        (
            "filesystem",
            permissions["filesystem_scope"],
            "allowed" if permissions["filesystem_scope"] != "read-only" else "denied",
            f"filesystem_{str(permissions['filesystem_scope']).replace('-', '_')}",
            {
                "workspace-write": "Worker can write only inside the repo workspace.",
                "read-only": "Worker cannot write to the repo workspace.",
                "danger-full-access": "Worker can write without filesystem sandboxing.",
                "inherit": "Worker inherits the parent filesystem permissions.",
            }.get(permissions["filesystem_scope"], "Filesystem policy recorded from the active worker profile."),
        ),
        (
            "network",
            permissions["network_access"],
            "allowed" if permissions["network_access"] != "restricted" else "denied",
            f"network_{str(permissions['network_access']).replace('-', '_')}",
            {
                "restricted": "Broad network access is denied for this worker profile.",
                "enabled": "Network access is allowed for this worker profile.",
                "inherit": "The worker inherits the parent network policy.",
            }.get(permissions["network_access"], "Network policy recorded from the active worker profile."),
        ),
        (
            "destructive_command",
            permissions["destructive_commands_allowed"],
            "allowed" if permissions["destructive_commands_allowed"] else "denied",
            "destructive_commands_allowed" if permissions["destructive_commands_allowed"] else "destructive_commands_denied",
            "Destructive commands are allowed for this worker profile."
            if permissions["destructive_commands_allowed"]
            else "Destructive commands are denied for this worker profile.",
        ),
        (
            "control_plane_write",
            permissions["control_plane_access"],
            "denied" if permissions["control_plane_access"] == "projected_read_only" else "allowed",
            "control_plane_projected_read_only"
            if permissions["control_plane_access"] == "projected_read_only"
            else "control_plane_direct_repo",
            "The worker sees a projected read-only control plane and cannot rewrite durable state directly."
            if permissions["control_plane_access"] == "projected_read_only"
            else "The worker runs against the direct repo view, so control-plane protection remains advisory.",
        ),
    ]
    return [
        build_policy_record(
            run=run,
            recorded_at=recorded_at,
            gate_type=gate_type,
            decision=decision,
            source="dispatch_compiler",
            reason_code=reason_code,
            reason=reason,
            configured_value=configured_value,
            dispatch_id=dispatch_id,
            dispatch_record_path=dispatch_record_path,
            context_manifest_path=context_manifest_path,
            worker_class=worker["worker_class"],
            worker_id=worker["worker_id"],
            permission_profile=permissions["profile"],
            worktree_mode=worker["worktree_mode"],
            scope=payload["dispatch"]["scope"],
            slice_id=payload["dispatch"]["slice_id"],
            artifact_dir=payload["dispatch"]["artifact_dir"],
            stage=payload["dispatch"]["stage"],
        )
        for gate_type, configured_value, decision, reason_code, reason in configured
    ]


def build_boundary_policy_record(
    *,
    run: dict[str, Any],
    recorded_at: str,
    decision: str,
    reason_code: str,
    reason: str,
) -> tuple[str, dict[str, Any]]:
    return build_policy_record(
        run=run,
        recorded_at=recorded_at,
        gate_type="story_boundary",
        decision=decision,
        source="story_boundary",
        reason_code=reason_code,
        reason=reason,
        configured_value=reason_code,
    )


def policy_history_snapshot(*, repo_root: Path, limit: int = 8) -> dict[str, Any]:
    policies_dir = repo_root / ".praxis" / "runtime" / "policies"
    if not policies_dir.exists():
        return {"count": 0, "latest": None, "items": []}

    paths = sorted(policies_dir.glob("*.json"))
    loaded: list[tuple[dict[str, Any], Path]] = []
    for path in paths:
        record = load_json(path)
        validate_contract_payload("policy-record.schema.json", record)
        loaded.append((record, path))

    loaded.sort(
        key=lambda item: (str(item[0].get("recorded_at") or ""), str(item[1])),
    )
    items: list[dict[str, Any]] = []
    for record, path in loaded[-limit:]:
        items.append(
            {
                "record_path": str(path.relative_to(repo_root)),
                "recorded_at": record["recorded_at"],
                "gate_type": record["gate_type"],
                "configured_value": record["configured_value"],
                "decision": record["decision"],
                "source": record["source"],
                "reason_code": record["reason_code"],
                "reason": record["reason"],
                "enforcement_mode": "enforced"
                if record["gate_type"] == "control_plane_write" and record["decision"] == "denied"
                else "advisory",
                "stage": record["stage"],
                "slice_id": record["slice_id"],
                "worker_id": record["worker_id"],
                "dispatch_record_path": record["dispatch_record_path"],
            }
        )

    return {
        "count": len(loaded),
        "latest": items[-1] if items else None,
        "items": items,
    }
