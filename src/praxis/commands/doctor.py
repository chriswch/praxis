from __future__ import annotations

import argparse
import shlex
import shutil
import subprocess
from pathlib import Path
from typing import Any

from praxis.commands._support import build_run_snapshot, sync_cursor_if_needed
from praxis.runtime.adapters.runtime_contract import get_adapter_runtime
from praxis.runtime.adapters.harness import build_worker_launch_payload, load_adapter_harness
from praxis.runtime.context.bundle import load_dispatch_bundle_status
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
    status = get_adapter_runtime(adapter).status_check(repo_root=repo_root, run=run)
    return _record_check(
        name=f"{adapter}_provider_cli",
        status=status["status"],
        reason_code=status["reason_code"],
        message=status["message"],
        details=status.get("details"),
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


def _artifact_not_required_check(*, name: str, artifact_type: str) -> dict[str, Any]:
    return _record_check(
        name=name,
        status="ok",
        reason_code=f"{artifact_type}_not_yet_recorded",
        message=f"The active dispatch has not linked a {artifact_type.replace('_', ' ')} yet.",
    )


def _active_runtime_artifact_check(
    *,
    name: str,
    artifact_type: str,
    summary: dict[str, Any],
) -> dict[str, Any]:
    if not summary.get("linked"):
        return _artifact_not_required_check(name=name, artifact_type=artifact_type)
    if not summary.get("exists"):
        return _record_check(
            name=name,
            status="error",
            reason_code=f"{artifact_type}_missing",
            message=f"The active dispatch links a missing {artifact_type.replace('_', ' ')}.",
            details=summary,
        )
    if summary.get("schema_valid") is False:
        return _record_check(
            name=name,
            status="error",
            reason_code=f"{artifact_type}_invalid",
            message=f"The active {artifact_type.replace('_', ' ')} failed schema validation.",
            details=summary,
        )
    return _record_check(
        name=name,
        status="ok",
        reason_code=f"{artifact_type}_available",
        message=f"The active {artifact_type.replace('_', ' ')} is available and validates.",
        details=summary,
    )


def _active_trace_stream_check(*, summary: dict[str, Any]) -> dict[str, Any]:
    if not summary.get("linked"):
        return _artifact_not_required_check(name="active_trace_stream", artifact_type="trace_stream")
    if not summary.get("exists"):
        return _record_check(
            name="active_trace_stream",
            status="error",
            reason_code="trace_stream_missing",
            message="The active worker links a missing trace stream.",
            details=summary,
        )
    if summary.get("schema_valid") is False:
        return _record_check(
            name="active_trace_stream",
            status="error",
            reason_code="trace_stream_invalid",
            message="The active trace stream failed schema validation.",
            details=summary,
        )
    return _record_check(
        name="active_trace_stream",
        status="ok",
        reason_code="trace_stream_available",
        message="The active trace stream is available and validates.",
        details=summary,
    )


def _worker_dispatch_consistency_check(
    *,
    run: dict[str, Any] | None,
    dispatch_bundle: dict[str, Any] | None,
    active_runtime: dict[str, Any] | None,
) -> dict[str, Any]:
    if run is None or dispatch_bundle is None or active_runtime is None:
        return _record_check(
            name="active_runtime_consistency",
            status="ok",
            reason_code="active_runtime_not_required",
            message="No active runtime artifact linkage requires consistency checks.",
        )

    expected_worker_id = dispatch_bundle.get("worker_id") or run.get("current", {}).get("worker_id")
    expected_dispatch_id = dispatch_bundle.get("dispatch_id")
    expected_dispatch_record_path = dispatch_bundle.get("dispatch_record_path")
    expected_stage = run.get("current", {}).get("stage")
    expected_session_id = run.get("current", {}).get("session_id")

    mismatches: list[dict[str, Any]] = []
    worker_record = active_runtime.get("worker_record") or {}
    if worker_record.get("schema_valid") and worker_record.get("exists"):
        if expected_worker_id and worker_record.get("worker_id") != expected_worker_id:
            mismatches.append(
                {
                    "artifact": "worker_record",
                    "field": "worker_id",
                    "expected": expected_worker_id,
                    "actual": worker_record.get("worker_id"),
                }
            )
        if expected_dispatch_id and worker_record.get("dispatch_id") != expected_dispatch_id:
            mismatches.append(
                {
                    "artifact": "worker_record",
                    "field": "dispatch_id",
                    "expected": expected_dispatch_id,
                    "actual": worker_record.get("dispatch_id"),
                }
            )
        if expected_dispatch_record_path and worker_record.get("dispatch_record_path") != expected_dispatch_record_path:
            mismatches.append(
                {
                    "artifact": "worker_record",
                    "field": "dispatch_record_path",
                    "expected": expected_dispatch_record_path,
                    "actual": worker_record.get("dispatch_record_path"),
                }
            )

    session_record = active_runtime.get("session_record") or {}
    if session_record.get("schema_valid") and session_record.get("exists"):
        if expected_worker_id and session_record.get("worker_id") != expected_worker_id:
            mismatches.append(
                {
                    "artifact": "session_record",
                    "field": "worker_id",
                    "expected": expected_worker_id,
                    "actual": session_record.get("worker_id"),
                }
            )
        if expected_session_id and session_record.get("session_id") != expected_session_id:
            mismatches.append(
                {
                    "artifact": "session_record",
                    "field": "session_id",
                    "expected": expected_session_id,
                    "actual": session_record.get("session_id"),
                }
            )

    launch_record = active_runtime.get("launch_record") or {}
    if launch_record.get("schema_valid") and launch_record.get("exists"):
        if expected_worker_id and launch_record.get("worker_id") != expected_worker_id:
            mismatches.append(
                {
                    "artifact": "launch_record",
                    "field": "worker_id",
                    "expected": expected_worker_id,
                    "actual": launch_record.get("worker_id"),
                }
            )
        if expected_stage and launch_record.get("stage") != expected_stage:
            mismatches.append(
                {
                    "artifact": "launch_record",
                    "field": "stage",
                    "expected": expected_stage,
                    "actual": launch_record.get("stage"),
                }
            )
        if expected_dispatch_record_path and launch_record.get("dispatch_record_path") != expected_dispatch_record_path:
            mismatches.append(
                {
                    "artifact": "launch_record",
                    "field": "dispatch_record_path",
                    "expected": expected_dispatch_record_path,
                    "actual": launch_record.get("dispatch_record_path"),
                }
            )

    resume_record = active_runtime.get("resume_record") or {}
    if resume_record.get("schema_valid") and resume_record.get("exists") and expected_worker_id:
        if resume_record.get("worker_id") != expected_worker_id:
            mismatches.append(
                {
                    "artifact": "resume_record",
                    "field": "worker_id",
                    "expected": expected_worker_id,
                    "actual": resume_record.get("worker_id"),
                }
            )

    if mismatches:
        return _record_check(
            name="active_runtime_consistency",
            status="error",
            reason_code="active_runtime_mismatch",
            message="One or more active runtime artifacts do not match the current dispatch linkage.",
            details={"mismatches": mismatches},
        )

    return _record_check(
        name="active_runtime_consistency",
        status="ok",
        reason_code="active_runtime_consistent",
        message="Linked active runtime artifacts match the current dispatch.",
        details={
            "dispatch_id": expected_dispatch_id,
            "worker_id": expected_worker_id,
            "session_id": expected_session_id,
        },
    )


def _sidecar_workers_check(*, run_snapshot: dict[str, Any] | None) -> dict[str, Any]:
    sidecars = ((run_snapshot or {}).get("sidecars") or {}).get("items") or []
    if not sidecars:
        return _record_check(
            name="sidecar_workers",
            status="ok",
            reason_code="no_sidecars",
            message="No sidecar workers are recorded for the active run.",
        )
    statuses = {str(item.get("status")) for item in sidecars}
    status = "warn" if statuses & {"failed", "cancelled"} else "ok"
    reason_code = "sidecars_need_attention" if status == "warn" else "sidecars_visible"
    message = (
        "Praxis found sidecar workers that need attention."
        if status == "warn"
        else "Praxis recorded sidecar workers separately from the primary owner."
    )
    return _record_check(
        name="sidecar_workers",
        status=status,
        reason_code=reason_code,
        message=message,
        details={"count": len(sidecars), "items": sidecars},
    )


def _tool_usage_check(*, run_snapshot: dict[str, Any] | None) -> dict[str, Any]:
    usage = ((run_snapshot or {}).get("tool_usage") or {}).get("overall") or {}
    if not usage:
        return _record_check(
            name="tool_usage",
            status="ok",
            reason_code="tool_usage_unavailable",
            message="No brokered tool-usage summary is available.",
        )
    denied = int(usage.get("denied_count") or 0)
    failed = int(usage.get("failed_count") or 0)
    if denied or failed:
        return _record_check(
            name="tool_usage",
            status="warn",
            reason_code="tool_usage_has_risks",
            message="Praxis recorded denied or failed brokered tool invocations.",
            details=usage,
        )
    return _record_check(
        name="tool_usage",
        status="ok",
        reason_code="tool_usage_clean",
        message="Brokered tool usage has no denied or failed invocations.",
        details=usage,
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
            sync_cursor_if_needed(run)
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

    active_runtime: dict[str, Any] | None = None
    if run_snapshot is not None:
        active_runtime = run_snapshot.get("active_runtime")

    if run is not None and run.get("current", {}).get("stage") is not None and run_snapshot is not None:
        dispatch_bundle = load_dispatch_bundle_status(
            repo_root=repo_root,
            run=run,
            dispatch=run_snapshot["dispatch"],
        )
        if dispatch_bundle is not None and dispatch_bundle.get("available"):
            checks.append(
                _record_check(
                    name="active_dispatch_bundle",
                    status="ok",
                    reason_code="dispatch_bundle_available",
                    message="The active dispatch bundle is available under .praxis/runtime/dispatches/.",
                    details=dispatch_bundle,
                )
            )
        elif dispatch_bundle is not None and dispatch_bundle.get("recovery_state") in {"pending_recovery", "intent_recorded_only", "incomplete_bundle"}:
            checks.append(
                _record_check(
                    name="active_dispatch_bundle",
                    status="error",
                    reason_code=str(dispatch_bundle.get("recovery_reason_code") or "dispatch_bundle_incomplete"),
                    message=str(
                        dispatch_bundle.get("recovery_reason")
                        or "The active dispatch bundle is incomplete and requires recovery."
                    ),
                    details=dispatch_bundle,
                )
            )
        else:
            checks.append(
                _record_check(
                    name="active_dispatch_bundle",
                    status="warn",
                    reason_code=str((dispatch_bundle or {}).get("recovery_reason_code") or "dispatch_bundle_missing"),
                    message=str(
                        (dispatch_bundle or {}).get("recovery_reason")
                        or "The active dispatch bundle has not been compiled yet."
                    ),
                    details=dispatch_bundle or {},
                )
            )

        if active_runtime is not None:
            checks.append(
                _active_runtime_artifact_check(
                    name="active_worker_record",
                    artifact_type="worker_record",
                    summary=active_runtime.get("worker_record") or {},
                )
            )
            checks.append(
                _active_runtime_artifact_check(
                    name="active_session_record",
                    artifact_type="session_record",
                    summary=active_runtime.get("session_record") or {},
                )
            )
            checks.append(
                _active_runtime_artifact_check(
                    name="active_launch_record",
                    artifact_type="launch_record",
                    summary=active_runtime.get("launch_record") or {},
                )
            )
            checks.append(
                _active_runtime_artifact_check(
                    name="active_resume_record",
                    artifact_type="resume_record",
                    summary=active_runtime.get("resume_record") or {},
                )
            )
            checks.append(
                _active_trace_stream_check(
                    summary=active_runtime.get("trace_stream") or {},
                )
            )
            checks.append(
                _worker_dispatch_consistency_check(
                    run=run,
                    dispatch_bundle=dispatch_bundle,
                    active_runtime=active_runtime,
                )
            )
    else:
        checks.append(
            _record_check(
                name="active_dispatch_bundle",
                status="ok",
                reason_code="dispatch_bundle_not_required",
                message="No active stage requires a compiled dispatch bundle.",
            )
        )
        checks.append(_artifact_not_required_check(name="active_worker_record", artifact_type="worker_record"))
        checks.append(_artifact_not_required_check(name="active_session_record", artifact_type="session_record"))
        checks.append(_artifact_not_required_check(name="active_launch_record", artifact_type="launch_record"))
        checks.append(_artifact_not_required_check(name="active_resume_record", artifact_type="resume_record"))
        checks.append(_artifact_not_required_check(name="active_trace_stream", artifact_type="trace_stream"))
        checks.append(
            _record_check(
                name="active_runtime_consistency",
                status="ok",
                reason_code="active_runtime_not_required",
                message="No active runtime artifact linkage requires consistency checks.",
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
    checks.append(_sidecar_workers_check(run_snapshot=run_snapshot))
    checks.append(_tool_usage_check(run_snapshot=run_snapshot))

    healthy = not any(check["status"] == "error" for check in checks)
    return {
        "healthy": healthy,
        "checks": checks,
        "run": run_snapshot,
    }
