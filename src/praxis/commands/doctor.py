from __future__ import annotations

import argparse
import shlex
import shutil
import subprocess
from pathlib import Path
from typing import Any

from praxis.commands._support import build_run_snapshot
from praxis.runtime.adapters.harness import build_worker_launch_payload, load_adapter_harness
from praxis.runtime.adapters.provider_resume import _provider_capability
from praxis.runtime.state.durable_state import load_events, load_json, recover_pending_transaction, validate_state_payloads
from praxis.runtime.workers.planning import build_worker_plan, ensure_run_vnext_defaults
from praxis.runtime.workers.worktree import inspect_isolated_worktrees


def _record_check(
    *,
    name: str,
    status: str,
    reason_code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "name": name,
        "status": status,
        "reason_code": reason_code,
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


def _provider_binary(adapter: str) -> str:
    return "codex" if adapter == "codex" else "claude"


def _provider_cli_check(*, repo_root: Path, adapter: str, run: dict[str, Any] | None) -> dict[str, Any]:
    binary = _provider_binary(adapter)
    resolved = shutil.which(binary)
    if resolved is None:
        return _record_check(
            name=f"{adapter}_provider_cli",
            status="error",
            reason_code="provider_cli_missing",
            message=f"Praxis could not find the `{binary}` CLI in PATH.",
            details={"binary": binary},
        )

    if adapter == "claude" and run is not None and run.get("execution", {}).get("mode") == "autopilot":
        capability = _provider_capability(adapter=adapter, repo_root=repo_root, resume_mode="headless")
        if not capability["supported"]:
            return _record_check(
                name=f"{adapter}_provider_cli",
                status="warn",
                reason_code=str(capability["reason_code"]),
                message=str(capability["reason"]),
                details={"binary": binary, "resolved_path": resolved},
            )

    return _record_check(
        name=f"{adapter}_provider_cli",
        status="ok",
        reason_code="provider_cli_available",
        message=f"Praxis found the `{binary}` CLI.",
        details={"binary": binary, "resolved_path": resolved},
    )


def _worker_launch_command_check(*, adapter: str, harness_payload: dict[str, Any]) -> dict[str, Any]:
    command = str(harness_payload["worker_launch_command"])
    try:
        argv = shlex.split(command)
    except ValueError as exc:
        return _record_check(
            name=f"{adapter}_worker_launch_command",
            status="error",
            reason_code="worker_launch_command_invalid",
            message=str(exc),
            details={"command": command},
        )
    if not argv:
        return _record_check(
            name=f"{adapter}_worker_launch_command",
            status="error",
            reason_code="worker_launch_command_invalid",
            message="Worker launch command is empty.",
            details={"command": command},
        )

    binary = argv[0]
    resolved = binary if "/" in binary else shutil.which(binary)
    if resolved is None:
        return _record_check(
            name=f"{adapter}_worker_launch_command",
            status="error",
            reason_code="worker_launch_command_missing",
            message=f"Praxis could not resolve the worker launch command binary `{binary}`.",
            details={"command": command, "binary": binary},
        )
    return _record_check(
        name=f"{adapter}_worker_launch_command",
        status="ok",
        reason_code="worker_launch_command_resolved",
        message="Worker launch command resolves.",
        details={"command": command, "binary": binary, "resolved_path": resolved},
    )


def _git_worktree_check(*, repo_root: Path, run: dict[str, Any] | None) -> dict[str, Any] | None:
    if run is None:
        return None
    plan = build_worker_plan(run)
    if plan is None or plan.get("worktree_mode") != "isolated":
        return _record_check(
            name="git_worktree",
            status="ok",
            reason_code="git_worktree_not_required",
            message="Active worker plan does not require an isolated git worktree.",
        )

    inside = subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if inside.returncode != 0 or inside.stdout.strip() != "true":
        return _record_check(
            name="git_worktree",
            status="error",
            reason_code="git_worktree_unavailable",
            message="Praxis cannot create isolated worktrees because this repo is not a valid git worktree.",
        )

    listed = subprocess.run(
        ["git", "worktree", "list", "--porcelain"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if listed.returncode != 0:
        return _record_check(
            name="git_worktree",
            status="error",
            reason_code="git_worktree_unavailable",
            message=listed.stderr.strip() or listed.stdout.strip() or "git worktree list failed.",
        )

    return _record_check(
        name="git_worktree",
        status="ok",
        reason_code="git_worktree_ready",
        message="Git worktree operations are available for the active plan.",
    )


def _stale_worktree_check(*, repo_root: Path) -> dict[str, Any]:
    inspections = inspect_isolated_worktrees(repo_root)
    stale = [item for item in inspections if item.get("stale")]
    if stale:
        return _record_check(
            name="isolated_worktrees",
            status="warn",
            reason_code="stale_worktrees_present",
            message="Praxis found stale isolated worktrees.",
            details={"stale": stale},
        )
    return _record_check(
        name="isolated_worktrees",
        status="ok",
        reason_code="no_stale_worktrees",
        message="No stale isolated worktrees are present.",
    )


def _failed_worker_logs_check(*, repo_root: Path) -> dict[str, Any]:
    logs_dir = repo_root / ".praxis" / "runtime" / "logs"
    workers_dir = repo_root / ".praxis" / "runtime" / "workers"
    failures: list[dict[str, Any]] = []
    if workers_dir.exists():
        for worker_path in sorted(workers_dir.glob("*.json")):
            worker_record = load_json(worker_path)
            if worker_record.get("status") not in {"failed", "cancelled"}:
                continue
            worker_id = str(worker_record["worker_id"])
            stderr_path = logs_dir / f"{worker_id}.stderr.log"
            stdout_path = logs_dir / f"{worker_id}.stdout.log"
            if stderr_path.exists() or stdout_path.exists():
                failures.append(
                    {
                        "worker_id": worker_id,
                        "status": worker_record.get("status"),
                        "stderr_log": str(stderr_path) if stderr_path.exists() else None,
                        "stdout_log": str(stdout_path) if stdout_path.exists() else None,
                    }
                )
    if failures:
        return _record_check(
            name="worker_logs",
            status="warn",
            reason_code="failed_worker_logs_present",
            message="Praxis found failed or cancelled worker logs.",
            details={"workers": failures},
        )
    return _record_check(
        name="worker_logs",
        status="ok",
        reason_code="no_failed_worker_logs",
        message="No failed worker logs are present.",
    )


def _worktree_cleanup_event_check(*, repo_root: Path) -> dict[str, Any]:
    events_path = repo_root / ".praxis" / "events.jsonl"
    if not events_path.exists():
        return _record_check(
            name="worktree_cleanup_events",
            status="ok",
            reason_code="no_worktree_cleanup_failures",
            message="No worktree cleanup failures are recorded.",
        )
    events = load_events(events_path)
    failures = [event for event in events if event.get("type") == "worktree_cleanup_failed"]
    if failures:
        return _record_check(
            name="worktree_cleanup_events",
            status="warn",
            reason_code="worktree_cleanup_failures_recorded",
            message="Praxis recorded worktree cleanup failures.",
            details={"failures": failures[-5:]},
        )
    return _record_check(
        name="worktree_cleanup_events",
        status="ok",
        reason_code="no_worktree_cleanup_failures",
        message="No worktree cleanup failures are recorded.",
    )


def handle(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    del timestamp
    checks: list[dict[str, Any]] = []
    recovery_result = recover_pending_transaction(repo_root)
    checks.append(
        _record_check(
            name="recovery",
            status="ok",
            reason_code="recovery_checked",
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
                    reason_code="run_state_valid",
                    message="Run state validates.",
                    details={"run_status": run.get("status")},
                )
            )
        except Exception as exc:
            checks.append(
                _record_check(
                    name="run_state",
                    status="error",
                    reason_code="run_state_invalid",
                    message=str(exc),
                    details={"run_path": str(run_path)},
                )
            )
    else:
        checks.append(
            _record_check(
                name="run_state",
                status="ok",
                reason_code="no_active_run",
                message="No active run is present.",
                details={"run_path": str(run_path)},
            )
        )

    for adapter in _selected_adapters(repo_root, run, args.adapter):
        harness_payload: dict[str, Any] | None = None
        try:
            config_path, harness_payload = load_adapter_harness(repo_root=repo_root, adapter=adapter)
            checks.append(
                _record_check(
                    name=f"{adapter}_harness",
                    status="ok",
                    reason_code="adapter_harness_loaded",
                    message=f"{adapter} harness loads from {config_path}.",
                    details={"config_path": config_path, "compatibility": harness_payload.get("compatibility")},
                )
            )
        except Exception as exc:
            checks.append(
                _record_check(
                    name=f"{adapter}_harness",
                    status="error",
                    reason_code="adapter_harness_invalid",
                    message=str(exc),
                )
            )
            continue

        checks.append(_provider_cli_check(repo_root=repo_root, adapter=adapter, run=run))
        checks.append(_worker_launch_command_check(adapter=adapter, harness_payload=harness_payload))

        if (
            run is not None
            and run.get("runtime", {}).get("adapter") == adapter
            and run.get("current", {}).get("stage") is not None
        ):
            try:
                launch = build_worker_launch_payload(repo_root=repo_root)
                checks.append(
                    _record_check(
                        name=f"{adapter}_launch_payload",
                        status="ok",
                        reason_code="worker_launch_payload_valid",
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
                        reason_code="worker_launch_payload_invalid",
                        message=str(exc),
                    )
                )

    git_worktree_check = _git_worktree_check(repo_root=repo_root, run=run)
    if git_worktree_check is not None:
        checks.append(git_worktree_check)
    checks.append(_stale_worktree_check(repo_root=repo_root))
    checks.append(_worktree_cleanup_event_check(repo_root=repo_root))
    checks.append(_failed_worker_logs_check(repo_root=repo_root))

    healthy = not any(check["status"] == "error" for check in checks)
    return {
        "healthy": healthy,
        "checks": checks,
        "run": run_snapshot,
    }
