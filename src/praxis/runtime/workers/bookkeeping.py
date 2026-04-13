from __future__ import annotations

import re
from pathlib import Path
from typing import Any


def _slug(value: str, *, fallback: str) -> str:
    candidate = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-._")
    return candidate or fallback


def worker_artifact_namespace(worker_class: str) -> str:
    return "sidecar" if worker_class == "subagent_worker" else "primary"


def dispatch_bundle_paths(*, dispatch_id: str, worker_class: str) -> dict[str, str]:
    bundle_root = (
        ".praxis/runtime/dispatches/sidecars"
        if worker_class == "subagent_worker"
        else ".praxis/runtime/dispatches"
    )
    bundle_dir = f"{bundle_root}/{dispatch_id}"
    return {
        "dispatch_id": dispatch_id,
        "bundle_dir": bundle_dir,
        "worker_launch_path": f"{bundle_dir}/worker-launch.json",
        "dispatch_record_path": f"{bundle_dir}/dispatch-record.json",
        "context_manifest_path": f"{bundle_dir}/context-manifest.json",
        "tool_manifest_path": f"{bundle_dir}/tool-manifest.json",
    }


def worker_record_relpath(worker_id: str, *, worker_class: str) -> str:
    root = (
        ".praxis/runtime/workers/sidecars"
        if worker_class == "subagent_worker"
        else ".praxis/runtime/workers"
    )
    return f"{root}/{_slug(worker_id, fallback='worker')}.json"


def candidate_worker_record_relpaths(worker_id: str) -> list[str]:
    slugged = _slug(worker_id, fallback="worker")
    return [
        f".praxis/runtime/workers/{slugged}.json",
        f".praxis/runtime/workers/sidecars/{slugged}.json",
    ]


def resolve_worker_record_relpath(*, repo_root: Path, worker_id: str) -> str | None:
    for relpath in candidate_worker_record_relpaths(worker_id):
        if (repo_root / relpath).exists():
            return relpath
    return None


def build_worker_ownership(
    *,
    worker_id: str,
    worker_class: str,
    spawned_by_worker_id: str | None = None,
) -> dict[str, Any]:
    if worker_class == "subagent_worker":
        reason_code = "sidecar_non_owner"
        reason = (
            "This subagent worker is explicit sidecar bookkeeping only and does not "
            "own run routing or stage-result progression."
        )
    else:
        reason_code = "workflow_owner"
        reason = "This worker owns the current workflow stage and may advance the run via a stage result."

    return {
        "worker_id": worker_id,
        "kind": "sidecar" if worker_class == "subagent_worker" else "workflow_owner",
        "run_routing_owned": worker_class != "subagent_worker",
        "stage_result_expected": worker_class != "subagent_worker",
        "artifact_namespace": worker_artifact_namespace(worker_class),
        "spawned_by_worker_id": spawned_by_worker_id,
        "reason_code": reason_code,
        "reason": reason,
    }
