from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from praxis.cli.exit_codes import ENVIRONMENT_EXIT, CliContractError
from praxis.commands._support import load_adapter_harness


def handle(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    del timestamp
    if args.harness_command != "show-adapter":
        raise CliContractError(
            code="invalid_argument",
            message=f"Unsupported Praxis harness command: {args.harness_command}.",
            exit_code=2,
        )
    try:
        config_path, payload = load_adapter_harness(repo_root=repo_root, adapter=args.adapter)
    except FileNotFoundError as exc:
        raise CliContractError(
            code="missing_adapter_harness",
            message=str(exc),
            exit_code=ENVIRONMENT_EXIT,
            details={"repo_root": str(repo_root), "adapter": args.adapter},
        ) from exc
    return {
        "harness": {
            "config_path": config_path,
            "adapter": payload["adapter"],
            "instructions_path": payload["instructions_path"],
            "project_config_path": payload["project_config_path"],
            "hooks_path": payload["hooks_path"],
            "agents_path": payload["agents_path"],
            "worker_launch_command": payload["worker_launch_command"],
            "extension_points": payload["extension_points"],
            "compatibility": payload.get("compatibility"),
        }
    }
