from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from praxis.cli.exit_codes import BLOCKED_EXIT, CliContractError
from praxis.commands._support import build_run_snapshot, load_run_or_error
from praxis.runtime.workers.sidecar import dispatch_sidecar_worker


def handle(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    run = load_run_or_error(repo_root)
    current_stage = run.get("current", {}).get("stage")
    if current_stage is None:
        raise CliContractError(
            code="invalid_run_state",
            message="Praxis cannot dispatch a sidecar without an active owner stage.",
            exit_code=BLOCKED_EXIT,
        )

    result = dispatch_sidecar_worker(
        repo_root=repo_root,
        worker_id=args.worker_id,
        reason=args.reason,
        timestamp=timestamp,
        stage=args.stage,
        permission_profile=args.permission_profile,
        worktree_mode=args.worktree_mode,
        spawned_by_worker_id=args.spawned_by_worker_id,
        artifact_inputs=args.artifact_input or None,
        artifact_outputs_expected=args.artifact_output or None,
        context_artifact_dir=args.context_artifact_dir,
        session_id=args.session_id,
    )
    return {
        "transition_action": result["action"],
        "sidecar": {
            "worker_id": result["worker_id"],
            "dispatch_id": result["dispatch_id"],
            "request_path": result["request_path"],
            "dispatch_bundle": result["dispatch_bundle"],
        },
        "run": build_run_snapshot(repo_root),
    }
