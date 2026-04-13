from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .state.contract_validation import validate_contract_payload
from .state.durable_state import load_json


def _slug(value: str, *, fallback: str) -> str:
    candidate = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-._")
    return candidate or fallback


def _bundle_paths_for_run(run: dict[str, Any], dispatch: dict[str, Any]) -> dict[str, str]:
    transition_id = str(run.get("control", {}).get("last_transition_id") or "tx_000")
    worker_id = str(run.get("current", {}).get("worker_id") or "worker")
    stage = str(dispatch.get("stage") or "stage")
    dispatch_id = _slug(f"{transition_id}-{worker_id}-{stage}", fallback="dispatch")
    bundle_dir = f".praxis/runtime/dispatches/{dispatch_id}"
    return {
        "dispatch_id": dispatch_id,
        "dispatch_record_path": f"{bundle_dir}/dispatch-record.json",
    }


def approval_record_relpath(*, recorded_at: str, source: str, worker_id: str | None) -> str:
    ts = recorded_at.replace("-", "").replace(":", "").replace(".", "")
    worker_slug = _slug(worker_id or source, fallback=source)
    return f".praxis/runtime/approvals/{ts}-{source}-{worker_slug}.json"


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
        "boundary_handoff_path": routing.get("boundary_handoff_path"),
    }


def build_approval_record(
    *,
    run: dict[str, Any],
    recorded_at: str,
    decision: str,
    source: str,
    reason_code: str,
    reason: str,
) -> tuple[str, dict[str, Any]]:
    dispatch = _dispatch_from_run(run)
    bundle = _bundle_paths_for_run(run, dispatch) if dispatch is not None else None
    worker_id = run.get("current", {}).get("worker_id")
    record = {
        "version": 1,
        "recorded_at": recorded_at,
        "run_id": run["run_id"],
        "decision": decision,
        "source": source,
        "reason_code": reason_code,
        "reason": reason,
        "workflow": run["workflow"],
        "scope": run.get("current", {}).get("scope"),
        "slice_id": run.get("current", {}).get("slice_id"),
        "artifact_dir": run.get("current", {}).get("artifact_dir"),
        "stage": run.get("current", {}).get("stage"),
        "worker_id": worker_id,
        "session_id": run.get("current", {}).get("session_id"),
        "next_action": run.get("routing", {}).get("next_action"),
        "next_stage": run.get("routing", {}).get("next_stage"),
        "next_slice_id": run.get("routing", {}).get("next_slice_id"),
        "boundary_handoff_path": run.get("routing", {}).get("boundary_handoff_path"),
        "dispatch_id": bundle["dispatch_id"] if bundle is not None else None,
        "dispatch_record_path": bundle["dispatch_record_path"] if bundle is not None else None,
    }
    validate_contract_payload("approval-record.schema.json", record)
    return (
        approval_record_relpath(recorded_at=recorded_at, source=source, worker_id=worker_id),
        record,
    )


def approval_history_snapshot(*, repo_root: Path, limit: int = 5) -> dict[str, Any]:
    approvals_dir = repo_root / ".praxis" / "runtime" / "approvals"
    if not approvals_dir.exists():
        return {"count": 0, "latest": None, "items": []}

    paths = sorted(approvals_dir.glob("*.json"))
    items: list[dict[str, Any]] = []
    for path in paths[-limit:]:
        record = load_json(path)
        validate_contract_payload("approval-record.schema.json", record)
        items.append(
            {
                "record_path": str(path.relative_to(repo_root)),
                "recorded_at": record["recorded_at"],
                "decision": record["decision"],
                "source": record["source"],
                "reason_code": record["reason_code"],
                "reason": record["reason"],
                "stage": record["stage"],
                "slice_id": record["slice_id"],
                "worker_id": record["worker_id"],
                "dispatch_record_path": record["dispatch_record_path"],
            }
        )

    return {
        "count": len(paths),
        "latest": items[-1] if items else None,
        "items": items,
    }
