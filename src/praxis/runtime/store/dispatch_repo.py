from __future__ import annotations

from pathlib import Path
from typing import Any

from ..context.bundle import load_dispatch_bundle_status
from ..dispatch_records import normalize_dispatch_record
from ..state.durable_state import load_json


def _dispatch_from_run(run: dict[str, Any]) -> dict[str, Any]:
    current = run.get("current", {})
    routing = run.get("routing", {})
    stage = routing.get("next_stage") or current.get("stage")
    return {
        "action": routing.get("next_action"),
        "workflow": run.get("workflow"),
        "adapter": run.get("runtime", {}).get("adapter"),
        "entrypoint": run.get("runtime", {}).get("entrypoint"),
        "scope": current.get("scope"),
        "slice_id": current.get("slice_id"),
        "artifact_dir": current.get("artifact_dir"),
        "stage": stage,
        "boundary_handoff_path": routing.get("boundary_handoff_path"),
    }


def load_active_dispatch_bundle_status(*, repo_root: Path, run: dict[str, Any]) -> dict[str, Any] | None:
    return load_dispatch_bundle_status(
        repo_root=repo_root,
        run=run,
        dispatch=_dispatch_from_run(run),
    )


def load_dispatch_record(*, repo_root: Path, dispatch_record_path: str) -> dict[str, Any]:
    return normalize_dispatch_record(load_json(repo_root / dispatch_record_path))
