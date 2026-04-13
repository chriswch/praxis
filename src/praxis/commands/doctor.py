from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from praxis.commands._support import build_run_snapshot, load_run_or_error
from praxis.runtime.adapters.harness import build_worker_launch_payload, load_adapter_harness
from praxis.runtime.state.contract_validation import ContractValidationError
from praxis.runtime.state.durable_state import load_json, recover_pending_transaction, validate_state_payloads
from praxis.runtime.workers.planning import ensure_run_vnext_defaults


def _record_check(*, name: str, status: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "name": name,
        "status": status,
        "message": message,
        "details": details or {},
    }


def _selected_adapters(repo_root: Path, run: dict[str, Any] | None, selection: str) -> list[str]:
    if selection == "all":
        return ["codex", "claude"]
    if selection in {"codex", "claude"}:
        return [selection]
    if run is not None:
        adapter = run.get("runtime", {}).get("adapter")
        if adapter in {"codex", "claude"}:
            return [adapter]
    detected = []
    if (repo_root / ".codex" / "adapter.json").exists():
        detected.append("codex")
    if (repo_root / ".claude" / "adapter.json").exists():
        detected.append("claude")
    return detected or ["codex", "claude"]


def handle(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    del timestamp
    checks: list[dict[str, Any]] = []
    recovery_result = recover_pending_transaction(repo_root)
    checks.append(
        _record_check(
            name="recovery",
            status="ok",
            message=f"Recovery state: {recovery_result}.",
            details={"result": recovery_result},
        )
    )

    run: dict[str, Any] | None = None
    run_snapshot: dict[str, Any] | None = None
    run_path = repo_root / ".praxis" / "run.json"
    if run_path.exists():
        try:
            run = load_json(run_path)
            ensure_run_vnext_defaults(run)
            validate_state_payloads(run=run)
            run_snapshot = build_run_snapshot(repo_root)
            checks.append(
                _record_check(
                    name="run_state",
                    status="ok",
                    message="Run state validates.",
                    details={"run_status": run.get("status")},
                )
            )
        except Exception as exc:
            checks.append(
                _record_check(
                    name="run_state",
                    status="error",
                    message=str(exc),
                    details={"run_path": str(run_path)},
                )
            )
    else:
        checks.append(
            _record_check(
                name="run_state",
                status="ok",
                message="No active run is present.",
                details={"run_path": str(run_path)},
            )
        )

    for adapter in _selected_adapters(repo_root, run, args.adapter):
        try:
            config_path, payload = load_adapter_harness(repo_root=repo_root, adapter=adapter)
            checks.append(
                _record_check(
                    name=f"{adapter}_harness",
                    status="ok",
                    message=f"{adapter} harness loads from {config_path}.",
                    details={"config_path": config_path, "compatibility": payload.get("compatibility")},
                )
            )
        except Exception as exc:
            checks.append(
                _record_check(
                    name=f"{adapter}_harness",
                    status="error",
                    message=str(exc),
                )
            )
            continue

        if run is not None and run.get("runtime", {}).get("adapter") == adapter and run.get("current", {}).get("stage") is not None:
            try:
                launch = build_worker_launch_payload(repo_root=repo_root)
                checks.append(
                    _record_check(
                        name=f"{adapter}_launch_payload",
                        status="ok",
                        message="Worker launch payload validates.",
                        details={
                            "worker_id": launch["worker"]["worker_id"],
                            "stage": launch["dispatch"]["stage"],
                            "worktree_mode": launch["worker"]["worktree_mode"],
                        },
                    )
                )
            except Exception as exc:
                checks.append(
                    _record_check(
                        name=f"{adapter}_launch_payload",
                        status="error",
                        message=str(exc),
                    )
                )

    healthy = all(check["status"] == "ok" for check in checks)
    return {
        "healthy": healthy,
        "checks": checks,
        "run": run_snapshot,
    }
