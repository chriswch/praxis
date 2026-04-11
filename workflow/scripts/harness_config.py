from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .contract_validation import validate_contract_payload
from .durable_state import dump_json, load_json, validate_handoff_file
from .orchestrator import build_dispatch


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _adapter_config_relpath(adapter: str) -> str:
    mapping = {
        "claude": ".claude-plugin/adapter.json",
        "codex": ".codex-plugin/adapter.json",
    }
    try:
        return mapping[adapter]
    except KeyError as exc:
        raise ValueError(f"Unsupported adapter: {adapter!r}.") from exc


def load_adapter_harness(*, repo_root: Path, adapter: str) -> tuple[str, dict[str, Any]]:
    repo_root = repo_root.resolve()
    config_rel = _adapter_config_relpath(adapter)
    config_path = repo_root / config_rel
    if not config_path.exists():
        raise FileNotFoundError(
            f"Praxis could not find repo-scoped harness config for {adapter}: {config_rel}."
        )

    payload = load_json(config_path)
    validate_contract_payload("adapter-harness.schema.json", payload)
    if payload["adapter"] != adapter:
        raise ValueError(
            f"Harness config {config_rel} declares adapter={payload['adapter']!r}, expected {adapter!r}."
        )
    return config_rel, payload


def build_worker_launch_payload(*, repo_root: Path) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    run = load_json(repo_root / ".praxis" / "run.json")
    dispatch = build_dispatch(repo_root)
    config_rel, harness = load_adapter_harness(repo_root=repo_root, adapter=run["runtime"]["adapter"])

    handoff_path = dispatch.get("boundary_handoff_path")
    handoff_payload = validate_handoff_file(repo_root / handoff_path) if handoff_path else None

    payload = {
        "version": 1,
        "workflow": run["workflow"],
        "adapter": run["runtime"]["adapter"],
        "dispatch": dispatch,
        "inputs": {
            "run_path": ".praxis/run.json",
            "boundary_handoff_path": handoff_path,
            "boundary_handoff": handoff_payload,
        },
        "harness": {
            "config_path": config_rel,
            "settings_path": harness["settings_path"],
            "hooks_path": harness["hooks_path"],
            "subagents_path": harness["subagents_path"],
            "worker_launch_command": harness["worker_launch_command"],
            "extension_points": harness["extension_points"],
        },
    }
    validate_contract_payload("worker-launch.schema.json", payload)
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Load repo-scoped Praxis adapter harness config.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    show_parser = subparsers.add_parser("show-adapter-harness")
    show_parser.add_argument("--repo-root", default=".")
    show_parser.add_argument("--adapter", choices=["claude", "codex"], required=True)

    launch_parser = subparsers.add_parser("build-worker-launch")
    launch_parser.add_argument("--repo-root", default=".")
    launch_parser.add_argument("--timestamp")

    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    _ = getattr(args, "timestamp", None) or _utc_now()

    if args.command == "show-adapter-harness":
        config_rel, payload = load_adapter_harness(repo_root=repo_root, adapter=args.adapter)
        print(
            dump_json(
                {
                    "config_path": config_rel,
                    "adapter": payload["adapter"],
                    "settings_path": payload["settings_path"],
                    "hooks_path": payload["hooks_path"],
                    "subagents_path": payload["subagents_path"],
                    "worker_launch_command": payload["worker_launch_command"],
                    "extension_points": payload["extension_points"],
                }
            ),
            end="",
        )
        return 0

    if args.command == "build-worker-launch":
        print(dump_json(build_worker_launch_payload(repo_root=repo_root)), end="")
        return 0

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
