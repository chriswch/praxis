from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from praxis.cli.exit_codes import BLOCKED_EXIT, CliContractError
from praxis.commands._support import build_run_snapshot, continue_run, load_run_or_error


def handle(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    del args
    run = load_run_or_error(repo_root)
    next_action = run.get("routing", {}).get("next_action")
    if next_action != "confirm_then_run":
        raise CliContractError(
            code="blocked",
            message="Praxis can only continue when run.routing.next_action is 'confirm_then_run'.",
            exit_code=BLOCKED_EXIT,
            details={"next_action": next_action},
            retryable=True,
        )
    action = continue_run(repo_root=repo_root, timestamp=timestamp, source="continue")
    return {"transition_action": action, "run": build_run_snapshot(repo_root)}
