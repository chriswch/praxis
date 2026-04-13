from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from ..dispatch_records import normalize_dispatch_record
from ..state.contract_validation import validate_contract_payload
from ..state.durable_state import (
    commit_transaction,
    dump_json,
    load_json,
    load_pending_recovery,
    recover_pending_transaction,
)
from ..workers.planning import ensure_run_vnext_defaults
from ..workers.bookkeeping import dispatch_bundle_paths


def _slug(value: str, *, fallback: str) -> str:
    candidate = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-._")
    return candidate or fallback


def dispatch_id_for_run(
    run: dict[str, Any],
    dispatch: dict[str, Any],
    *,
    worker_id: str | None = None,
) -> str:
    ensure_run_vnext_defaults(run)
    transition_id = str(run.get("control", {}).get("last_transition_id") or "tx_000")
    resolved_worker_id = str(worker_id or run.get("current", {}).get("worker_id") or "worker")
    stage = str(dispatch.get("stage") or run.get("current", {}).get("stage") or "stage")
    return _slug(f"{transition_id}-{resolved_worker_id}-{stage}", fallback="dispatch")


def bundle_paths_for_run(
    run: dict[str, Any],
    dispatch: dict[str, Any],
    *,
    worker_id: str | None = None,
    worker_class: str | None = None,
) -> dict[str, str]:
    dispatch_id = dispatch_id_for_run(run, dispatch, worker_id=worker_id)
    return dispatch_bundle_paths(
        dispatch_id=dispatch_id,
        worker_class=worker_class or "session_worker",
    )


def persist_dispatch_bundle(
    *,
    repo_root: Path,
    payload: dict[str, Any],
    dispatch_record: dict[str, Any],
    context_manifest: dict[str, Any],
    extra_files: dict[str, str] | None = None,
    timestamp: str,
) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    recover_pending_transaction(repo_root)

    validate_contract_payload("worker-launch.schema.json", payload)
    validate_contract_payload("dispatch-record.schema.json", dispatch_record)
    validate_contract_payload("context-manifest.schema.json", context_manifest)

    bundle = payload["bundle"]
    files = {
        bundle["worker_launch_path"]: dump_json(payload),
        bundle["dispatch_record_path"]: dump_json(dispatch_record),
        bundle["context_manifest_path"]: dump_json(context_manifest),
        **(extra_files or {}),
    }
    commit_transaction(
        repo_root=repo_root,
        operation="persist_dispatch_bundle",
        files=files,
        timestamp=timestamp,
        metadata={
            "kind": "dispatch_bundle",
            "dispatch_id": bundle["dispatch_id"],
            "bundle_dir": bundle["bundle_dir"],
        },
    )
    return load_dispatch_bundle_status(repo_root=repo_root, bundle=bundle)


def _pending_recovery_targets_bundle(*, recovery: dict[str, Any] | None, bundle: dict[str, str]) -> bool:
    if not isinstance(recovery, dict):
        return False
    bundle_dir = f"{bundle['bundle_dir']}/"
    for file_entry in recovery.get("files", []):
        target_path = file_entry.get("target_path")
        if isinstance(target_path, str) and target_path.startswith(bundle_dir):
            return True
    metadata = recovery.get("metadata")
    if isinstance(metadata, dict):
        return metadata.get("dispatch_id") == bundle["dispatch_id"]
    return False


def _classify_bundle_recovery_status(
    *,
    recovery: dict[str, Any] | None,
    bundle: dict[str, str],
    worker_launch_exists: bool,
    dispatch_record_exists: bool,
    context_manifest_exists: bool,
    tool_manifest_exists: bool,
    dispatch_status: str | None,
    dispatch_resolved: bool | None,
) -> tuple[str, str, str]:
    if _pending_recovery_targets_bundle(recovery=recovery, bundle=bundle):
        return (
            "pending_recovery",
            "dispatch_bundle_recovery_pending",
            "A durable transaction is still finalizing this dispatch bundle, so Praxis is failing closed until recovery completes.",
        )

    if worker_launch_exists and dispatch_record_exists and context_manifest_exists and tool_manifest_exists:
        return (
            "clean",
            "dispatch_bundle_complete",
            "The dispatch bundle is complete and ready for inspection.",
        )

    if dispatch_record_exists and not worker_launch_exists and not context_manifest_exists and not tool_manifest_exists:
        if dispatch_status == "intent_recorded" and dispatch_resolved is False:
            return (
                "intent_recorded_only",
                "dispatch_intent_only",
                "Praxis recorded dispatch intent, but the compiled dispatch bundle is incomplete. Fail closed and rebuild from durable state.",
            )

    if worker_launch_exists or dispatch_record_exists or context_manifest_exists or tool_manifest_exists:
        return (
            "incomplete_bundle",
            "dispatch_bundle_incomplete",
            "The active dispatch bundle is missing one or more required artifacts. Praxis is failing closed for recovery.",
        )

    return (
        "not_compiled",
        "dispatch_bundle_missing",
        "The active dispatch bundle has not been compiled yet.",
    )


def load_dispatch_bundle_status(
    *,
    repo_root: Path,
    run: dict[str, Any] | None = None,
    dispatch: dict[str, Any] | None = None,
    bundle: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    repo_root = repo_root.resolve()
    if bundle is None:
        if run is None or dispatch is None:
            return None
        bundle = bundle_paths_for_run(run, dispatch)

    worker_launch_path = repo_root / bundle["worker_launch_path"]
    dispatch_record_path = repo_root / bundle["dispatch_record_path"]
    context_manifest_path = repo_root / bundle["context_manifest_path"]
    tool_manifest_path = repo_root / bundle["tool_manifest_path"]
    recovery = load_pending_recovery(repo_root)

    status = {
        "dispatch_id": bundle["dispatch_id"],
        "bundle_dir": bundle["bundle_dir"],
        "worker_launch_path": bundle["worker_launch_path"],
        "dispatch_record_path": bundle["dispatch_record_path"],
        "context_manifest_path": bundle["context_manifest_path"],
        "worker_launch_exists": worker_launch_path.exists(),
        "dispatch_record_exists": dispatch_record_path.exists(),
        "context_manifest_exists": context_manifest_path.exists(),
        "tool_manifest_path": bundle["tool_manifest_path"],
        "tool_manifest_exists": tool_manifest_path.exists(),
        "available": False,
    }

    if dispatch_record_path.exists():
        record = normalize_dispatch_record(load_json(dispatch_record_path))
        status["recorded_at"] = record["recorded_at"]
        status["stage"] = record["dispatch"]["stage"]
        status["worker_id"] = record["worker"]["worker_id"]
        status["dispatch_status"] = record["status"]
        status["dispatch_resolved"] = record["resolution"]["resolved"]
        status["dispatch_resolution_reason_code"] = record["resolution"]["reason_code"]
        status["dispatch_resolution_reason"] = record["resolution"]["reason"]
        status["dispatch_updated_at"] = record["resolution"]["updated_at"]
        status["native_launch_record_path"] = record["resolution"]["native_launch_record_path"]
        status["native_resume_record_path"] = record["resolution"]["native_resume_record_path"]
        status["worker_record_path"] = record["resolution"]["worker_record_path"]
        status["session_record_path"] = record["resolution"]["session_record_path"]
        if "isolation" in record:
            isolation = record["isolation"]
            status["isolation_mode"] = isolation["mode"]
            status["isolation_worktree_path"] = isolation["worktree_path"]
            status["product_worktree_path"] = isolation["product_worktree_path"]
            status["review_independence_required"] = isolation["review_independence_required"]
            status["product_worktree_mutation_allowed"] = isolation["product_worktree_mutation_allowed"]
            status["runtime_state_channel"] = isolation["runtime_state_channel"]
            status["isolation_reason_code"] = isolation["guardrail_reason_code"]
            status["isolation_reason"] = isolation["guardrail_reason"]
        if "ownership" in record:
            ownership = record["ownership"]
            status["ownership_kind"] = ownership["kind"]
            status["run_routing_owned"] = ownership["run_routing_owned"]
            status["stage_result_expected"] = ownership["stage_result_expected"]
            status["artifact_namespace"] = ownership["artifact_namespace"]
            status["spawned_by_worker_id"] = ownership["spawned_by_worker_id"]
            status["ownership_reason_code"] = ownership["reason_code"]
            status["ownership_reason"] = ownership["reason"]

    if context_manifest_path.exists():
        manifest = load_json(context_manifest_path)
        validate_contract_payload("context-manifest.schema.json", manifest)
        status["context_item_count"] = len(manifest["items"])
        status["handoff_injected"] = manifest["context_policy"]["handoff_injected"]
        status["context_within_budget"] = manifest["selection_summary"]["within_budget"]
        status["default_item_count"] = manifest["selection_summary"]["default_item_count"]
        status["stage_specific_item_count"] = manifest["selection_summary"]["stage_specific_item_count"]
        status["carry_forward_item_count"] = manifest["selection_summary"]["carry_forward_item_count"]

    if tool_manifest_path.exists():
        manifest = load_json(tool_manifest_path)
        validate_contract_payload("tool-manifest.schema.json", manifest)
        status["tool_count"] = manifest["tool_count"]

    recovery_state, recovery_reason_code, recovery_reason = _classify_bundle_recovery_status(
        recovery=recovery,
        bundle=bundle,
        worker_launch_exists=status["worker_launch_exists"],
        dispatch_record_exists=status["dispatch_record_exists"],
        context_manifest_exists=status["context_manifest_exists"],
        tool_manifest_exists=status["tool_manifest_exists"],
        dispatch_status=status.get("dispatch_status"),
        dispatch_resolved=status.get("dispatch_resolved"),
    )
    status["recovery_state"] = recovery_state
    status["recovery_reason_code"] = recovery_reason_code
    status["recovery_reason"] = recovery_reason
    status["available"] = recovery_state == "clean"

    return status
