from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from praxis.cli.exit_codes import BLOCKED_EXIT, CliContractError
from praxis.commands._support import build_run_snapshot, initialize_run, recover_pending_transaction, run_path


def handle(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    recover_pending_transaction(repo_root)
    if run_path(repo_root).exists():
        raise CliContractError(
            code="run_already_exists",
            message="Praxis already has an active run in this repo.",
            exit_code=BLOCKED_EXIT,
            details={"run_path": str(run_path(repo_root))},
            retryable=True,
        )
    initialize_run(
        repo_root=repo_root,
        workflow=args.workflow,
        entry_task=args.entry_task,
        adapter=args.adapter,
        execution_mode=args.execution_mode,
        entrypoint=args.entrypoint,
        timestamp=timestamp,
    )
    return {"transition_action": "run_stage", "run": build_run_snapshot(repo_root)}
