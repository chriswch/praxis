from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from praxis.commands._support import build_run_snapshot, initialize_run, recover_pending_transaction


def handle(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    recover_pending_transaction(repo_root)
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
