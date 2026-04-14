from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from praxis.cli.exit_codes import INVALID_INPUT_EXIT, CliContractError
from praxis.commands._support import (
    advance_run,
    build_run_snapshot,
    load_object_json_arg,
    load_run_or_error,
    resolve_repo_path,
)
from praxis.runtime.workers.sidecar import sidecar_worker_record_exists


def handle(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    load_run_or_error(repo_root)
    stage_result_path = resolve_repo_path(repo_root, args.stage_result_path)
    if not stage_result_path.exists():
        raise CliContractError(
            code="missing_required_artifact",
            message=f"Praxis could not find the stage result artifact: {args.stage_result_path}.",
            exit_code=INVALID_INPUT_EXIT,
            details={"path": str(stage_result_path)},
        )
    stage_result = load_object_json_arg(repo_root, args.stage_result_path, flag_name="--stage-result-path") or {}
    worker = stage_result.get("worker") or {}
    worker_id = worker.get("worker_id")
    if worker.get("worker_class") == "subagent_worker" or (
        isinstance(worker_id, str) and worker_id and sidecar_worker_record_exists(repo_root=repo_root, worker_id=worker_id)
    ):
        raise CliContractError(
            code="stage_result_non_owner",
            message="Praxis sidecars are non-owning workers and cannot satisfy the active stage-result contract.",
            exit_code=INVALID_INPUT_EXIT,
            details={"worker_id": worker_id, "path": str(stage_result_path)},
        )
    action = advance_run(
        repo_root=repo_root,
        stage_result_path=Path(args.stage_result_path),
        slice_map_path=Path(args.slice_map_path),
        commit_meta=load_object_json_arg(repo_root, args.commit_meta_path, flag_name="--commit-meta-path"),
        handoff_data=load_object_json_arg(repo_root, args.handoff_data_path, flag_name="--handoff-data-path"),
        dirty_paths=args.dirty_path or None,
        gate_failures=args.gate_failure or None,
        cancel_requested=args.cancel_requested,
        timestamp=timestamp,
    )
    return {"transition_action": action, "run": build_run_snapshot(repo_root)}
