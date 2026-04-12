from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from praxis.cli.exit_codes import BLOCKED_EXIT, CliContractError
from praxis.commands._support import build_run_snapshot, dispatch_worker, load_run_or_error, normalize_dispatch_action


def handle(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    run = load_run_or_error(repo_root)
    current_stage = run.get("current", {}).get("stage")
    if current_stage is None:
        raise CliContractError(
            code="invalid_run_state",
            message="Praxis cannot dispatch a worker without an active stage.",
            exit_code=BLOCKED_EXIT,
        )
    next_action = run.get("routing", {}).get("next_action")
    if next_action != "run_stage":
        raise CliContractError(
            code="blocked",
            message="Praxis can only dispatch a worker when run.routing.next_action is 'run_stage'.",
            exit_code=BLOCKED_EXIT,
            details={"next_action": next_action},
            retryable=True,
        )
    pending_action = run.get("routing", {}).get("pending_worker_action")
    if pending_action != "resume_or_launch":
        raise CliContractError(
            code="blocked",
            message="Praxis can only dispatch a worker when run.routing.pending_worker_action is 'resume_or_launch'.",
            exit_code=BLOCKED_EXIT,
            details={"pending_worker_action": pending_action},
            retryable=True,
        )
    action = normalize_dispatch_action(
        dispatch_worker(repo_root=repo_root, timestamp=timestamp, session_id=args.session_id)
    )
    return {"transition_action": action, "run": build_run_snapshot(repo_root)}
