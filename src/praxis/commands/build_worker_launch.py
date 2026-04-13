from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from praxis.cli.exit_codes import BLOCKED_EXIT, ENVIRONMENT_EXIT, CliContractError
from praxis.commands._support import compile_dispatch_bundle, load_run_or_error


def handle(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    del args, timestamp
    run = load_run_or_error(repo_root)
    if run.get("current", {}).get("stage") is None:
        raise CliContractError(
            code="invalid_run_state",
            message="Praxis cannot build a worker launch payload without an active stage.",
            exit_code=BLOCKED_EXIT,
        )
    try:
        compiled = compile_dispatch_bundle(repo_root=repo_root)
        payload = compiled["launch"]
    except FileNotFoundError as exc:
        raise CliContractError(
            code="missing_adapter_harness",
            message=str(exc),
            exit_code=ENVIRONMENT_EXIT,
            details={"repo_root": str(repo_root)},
        ) from exc
    return {"launch": payload, "dispatch_bundle": compiled["dispatch_bundle"]}
