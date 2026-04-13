from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from ..state.contract_validation import validate_contract_payload
from ..state.durable_state import commit_transaction, dump_json, load_json, recover_pending_transaction
from ..workers.planning import ensure_run_vnext_defaults


def _slug(value: str, *, fallback: str) -> str:
    candidate = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-._")
    return candidate or fallback


def dispatch_id_for_run(run: dict[str, Any], dispatch: dict[str, Any]) -> str:
    ensure_run_vnext_defaults(run)
    transition_id = str(run.get("control", {}).get("last_transition_id") or "tx_000")
    worker_id = str(run.get("current", {}).get("worker_id") or "worker")
    stage = str(dispatch.get("stage") or run.get("current", {}).get("stage") or "stage")
    return _slug(f"{transition_id}-{worker_id}-{stage}", fallback="dispatch")


def bundle_paths_for_run(run: dict[str, Any], dispatch: dict[str, Any]) -> dict[str, str]:
    dispatch_id = dispatch_id_for_run(run, dispatch)
    bundle_dir = f".praxis/runtime/dispatches/{dispatch_id}"
    return {
        "dispatch_id": dispatch_id,
        "bundle_dir": bundle_dir,
        "worker_launch_path": f"{bundle_dir}/worker-launch.json",
        "dispatch_record_path": f"{bundle_dir}/dispatch-record.json",
        "context_manifest_path": f"{bundle_dir}/context-manifest.json",
    }


def persist_dispatch_bundle(
    *,
    repo_root: Path,
    payload: dict[str, Any],
    dispatch_record: dict[str, Any],
    context_manifest: dict[str, Any],
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
    }
    commit_transaction(
        repo_root=repo_root,
        operation="persist_dispatch_bundle",
        files=files,
        timestamp=timestamp,
        metadata={"dispatch_id": bundle["dispatch_id"]},
    )
    return load_dispatch_bundle_status(repo_root=repo_root, bundle=bundle)


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

    status = {
        "dispatch_id": bundle["dispatch_id"],
        "bundle_dir": bundle["bundle_dir"],
        "worker_launch_path": bundle["worker_launch_path"],
        "dispatch_record_path": bundle["dispatch_record_path"],
        "context_manifest_path": bundle["context_manifest_path"],
        "worker_launch_exists": worker_launch_path.exists(),
        "dispatch_record_exists": dispatch_record_path.exists(),
        "context_manifest_exists": context_manifest_path.exists(),
        "available": worker_launch_path.exists() and dispatch_record_path.exists() and context_manifest_path.exists(),
    }

    if dispatch_record_path.exists():
        record = load_json(dispatch_record_path)
        validate_contract_payload("dispatch-record.schema.json", record)
        status["recorded_at"] = record["recorded_at"]
        status["stage"] = record["dispatch"]["stage"]
        status["worker_id"] = record["worker"]["worker_id"]

    if context_manifest_path.exists():
        manifest = load_json(context_manifest_path)
        validate_contract_payload("context-manifest.schema.json", manifest)
        status["context_item_count"] = len(manifest["items"])
        status["handoff_injected"] = manifest["context_policy"]["handoff_injected"]

    return status
