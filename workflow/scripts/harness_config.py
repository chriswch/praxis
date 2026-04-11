from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .contract_validation import validate_contract_payload
from .durable_state import dump_json, inspect_handoff_file, load_json, validate_handoff_file
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


def _referenced_harness_paths(payload: dict[str, Any]) -> list[str]:
    paths = [
        payload["instructions_path"],
        payload["hooks_path"],
        payload["agents_path"],
    ]
    if payload["project_config_path"] is not None:
        paths.append(payload["project_config_path"])

    compatibility = payload.get("compatibility")
    if compatibility is not None:
        paths.extend(
            [
                compatibility["settings_path"],
                compatibility["hooks_path"],
                compatibility["subagents_path"],
            ]
        )

    for value in payload["extension_points"].values():
        if value is not None:
            paths.append(value)

    return paths


def _validate_harness_paths_exist(*, repo_root: Path, config_rel: str, payload: dict[str, Any]) -> None:
    missing = [rel_path for rel_path in _referenced_harness_paths(payload) if not (repo_root / rel_path).exists()]
    if missing:
        joined = ", ".join(sorted(missing))
        raise FileNotFoundError(
            "Praxis could not load the repo-scoped harness because referenced adapter surfaces are missing "
            f"from {config_rel}: {joined}."
        )


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
    _validate_harness_paths_exist(repo_root=repo_root, config_rel=config_rel, payload=payload)
    return config_rel, payload


def inspect_worker_launch_context(*, repo_root: Path) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    run = load_json(repo_root / ".praxis" / "run.json")
    dispatch = build_dispatch(repo_root)
    handoff_path = dispatch.get("boundary_handoff_path")
    handoff_status = inspect_handoff_file(repo_root / handoff_path) if handoff_path else None
    return {
        "workflow": run["workflow"],
        "adapter": run["runtime"]["adapter"],
        "dispatch": dispatch,
        "boundary_handoff_path": handoff_path,
        "handoff_status": handoff_status,
    }


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
        "context_policy": {
            "fresh_context": bool(run.get("execution", {}).get("fresh_context_per_story")),
            "carry_forward_mode": "boundary_handoff_only",
            "allowed_context_sources": [
                "dispatch",
                "run_metadata",
                "boundary_handoff",
            ],
            "handoff_injected": handoff_payload is not None,
        },
        "harness": {
            "config_path": config_rel,
            "instructions_path": harness["instructions_path"],
            "project_config_path": harness["project_config_path"],
            "hooks_path": harness["hooks_path"],
            "agents_path": harness["agents_path"],
            "worker_launch_command": harness["worker_launch_command"],
            "extension_points": harness["extension_points"],
            "compatibility": harness["compatibility"],
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
                    "instructions_path": payload["instructions_path"],
                    "project_config_path": payload["project_config_path"],
                    "hooks_path": payload["hooks_path"],
                    "agents_path": payload["agents_path"],
                    "worker_launch_command": payload["worker_launch_command"],
                    "extension_points": payload["extension_points"],
                    "compatibility": payload["compatibility"],
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
