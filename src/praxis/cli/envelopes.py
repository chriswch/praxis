from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from praxis.cli.exit_codes import CliContractError, OUTPUT_VERSION
from praxis.commands._support import dump_json
from praxis.cli.parser import PraxisArgumentParser


def success_envelope(
    *,
    command: str,
    timestamp: str,
    repo_root: Path,
    data: dict[str, Any],
) -> dict[str, Any]:
    return {
        "ok": True,
        "output_version": OUTPUT_VERSION,
        "command": command,
        "timestamp": timestamp,
        "repo_root": str(repo_root),
        "data": data,
    }


def error_envelope(
    *,
    command: str,
    timestamp: str,
    repo_root: Path,
    error: CliContractError,
) -> dict[str, Any]:
    return {
        "ok": False,
        "output_version": OUTPUT_VERSION,
        "command": command,
        "timestamp": timestamp,
        "repo_root": str(repo_root),
        "error": {
            "code": error.code,
            "message": error.message,
            "details": error.details,
            "retryable": error.retryable,
        },
    }


def emit_success(*, json_mode: bool, command: str, timestamp: str, repo_root: Path, data: dict[str, Any]) -> None:
    public_data = {key: value for key, value in data.items() if not key.startswith("__")}
    human_output = data.get("__human_output__")
    suppress_human_output = bool(data.get("__suppress_human_output__"))
    if json_mode:
        print(
            dump_json(success_envelope(command=command, timestamp=timestamp, repo_root=repo_root, data=public_data)),
            end="",
        )
        return
    if human_output is not None:
        print(str(human_output), end="")
        return
    if suppress_human_output:
        return
    print(render_human_success(command=command, data=public_data), end="")


def emit_error(
    *,
    json_mode: bool,
    command: str,
    timestamp: str,
    repo_root: Path,
    error: CliContractError,
    parser: PraxisArgumentParser,
) -> None:
    if json_mode:
        print(dump_json(error_envelope(command=command, timestamp=timestamp, repo_root=repo_root, error=error)), end="")
        return
    parser.print_usage(sys.stderr)
    print(f"praxis: error [{error.code}]: {error.message}", file=sys.stderr)


def render_human_success(*, command: str, data: dict[str, Any]) -> str:
    if command in {"run", "status", "continue", "approve", "resume", "dispatch", "submit-stage-result", "cancel"}:
        run = data["run"]
        transition = data.get("transition_action")
        prefix = f"Praxis {command}"
        if transition is not None:
            prefix = f"{prefix} -> {transition}"
        return (
            f"{prefix}\n"
            f"run: {run['run_id']}\n"
            f"status: {run['run_status']}\n"
            f"stage: {run['current']['stage']}\n"
            f"next: {run['routing']['next_action']}\n"
        )
    if command == "init":
        return (
            "Praxis init\n"
            f"created: {len(data['created'])}\n"
            f"updated: {len(data['updated'])}\n"
            f"skipped: {len(data['skipped'])}\n"
        )
    if command == "build-worker-launch":
        launch = data["launch"]
        dispatch = launch["dispatch"]
        return (
            "Praxis build-worker-launch\n"
            f"adapter: {launch['adapter']}\n"
            f"stage: {dispatch['stage']}\n"
            f"worker: {launch['worker']['worker_id']}\n"
        )
    if command == "harness show-adapter":
        harness = data["harness"]
        return (
            "Praxis harness show-adapter\n"
            f"adapter: {harness['adapter']}\n"
            f"config: {harness['config_path']}\n"
            f"worker launch: {harness['worker_launch_command']}\n"
        )
    if command == "doctor":
        return (
            "Praxis doctor\n"
            f"healthy: {'yes' if data['healthy'] else 'no'}\n"
            f"checks: {len(data['checks'])}\n"
        )
    return f"Praxis {command} succeeded.\n"
