from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from ..state.durable_state import load_json
from .native_resume import (
    boundary_handoff_fingerprint_from_payload,
    context_fingerprint_from_payload,
    load_session_record,
    worker_signature_from_payload,
    write_native_resume_result,
)
from ..workers.planning import ensure_run_vnext_defaults


def _resume_prompt(payload: dict[str, Any]) -> str:
    stage_result_path = payload["dispatch"].get("stage_result_path")
    return (
        "Resume the Praxis worker for this exact dispatch. "
        "Use only the current Praxis dispatch, run metadata, and declared artifact inputs. "
        f"Write the required stage result to {stage_result_path}. "
        "If the bounded context is insufficient, stop and say so explicitly."
    )


def _check(name: str, passed: bool, reason_code: str | None = None, reason: str | None = None) -> dict[str, Any]:
    return {
        "name": name,
        "passed": passed,
        "reason_code": None if passed else reason_code,
        "reason": None if passed else reason,
    }


def _supports_resume_mode(capability_mode: str, resume_mode: str) -> bool:
    if capability_mode == "either":
        return True
    return capability_mode == resume_mode


def _run_command(args: list[str], *, cwd: Path) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            args,
            cwd=cwd,
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError as exc:
        return {
            "ok": False,
            "returncode": 127,
            "stdout": "",
            "stderr": str(exc),
            "error": str(exc),
            "args": list(args),
        }
    return {
        "ok": completed.returncode == 0,
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "error": None,
        "args": list(args),
    }


def _provider_capability(*, adapter: str, repo_root: Path, resume_mode: str) -> dict[str, Any]:
    if adapter == "codex":
        return {
            "supported": True,
            "mode": "either",
            "reason_code": "provider_resume_available",
            "reason": "Codex exposes provider-native resume for interactive and headless flows.",
        }
    if adapter != "claude":
        raise ValueError(f"Unsupported adapter: {adapter!r}.")
    if resume_mode == "interactive":
        return {
            "supported": True,
            "mode": "interactive",
            "reason_code": "provider_resume_available",
            "reason": "Claude interactive resume is available through SessionStart hooks.",
        }

    help_result = _run_command(["claude", "--help"], cwd=repo_root)
    help_text = f"{help_result['stdout']}\n{help_result['stderr']}"
    has_headless_resume = all(token in help_text for token in ("--resume", "--print", "--output-format"))
    return {
        "supported": has_headless_resume,
        "mode": "either" if has_headless_resume else "interactive",
        "reason_code": "provider_resume_available" if has_headless_resume else "headless_resume_unsupported",
        "reason": (
            "Claude headless resume is available in the installed CLI."
            if has_headless_resume
            else "Claude headless resume is not available in the installed CLI, so Praxis must relaunch fresh."
        ),
        "probe": help_result,
    }


def _evaluate_resume_safety(
    *,
    repo_root: Path,
    run: dict[str, Any],
    payload: dict[str, Any],
    requested_session_id: str,
    session_record: dict[str, Any] | None,
    resume_mode: str,
    capability: dict[str, Any],
) -> tuple[bool, str | None, str | None, list[dict[str, Any]]]:
    checks: list[dict[str, Any]] = []
    adapter = payload["adapter"]
    dispatch = payload["dispatch"]
    repo_root_str = str(repo_root.resolve())

    if session_record is None:
        checks.append(
            _check(
                "session_record_present",
                False,
                "session_missing",
                "Praxis could not find a durable session record for the requested provider session.",
            )
        )
        return False, checks[-1]["reason_code"], checks[-1]["reason"], checks

    checks.append(_check("session_record_present", True))

    if session_record.get("version") != 2:
        checks.append(
            _check(
                "session_record_version",
                False,
                "legacy_session_record",
                "Praxis can only safely provider-resume sessions that were recorded with v2 durable metadata.",
            )
        )
        return False, checks[-1]["reason_code"], checks[-1]["reason"], checks
    checks.append(_check("session_record_version", True))

    if not capability["supported"] or not _supports_resume_mode(capability["mode"], resume_mode):
        checks.append(
            _check(
                "provider_capability",
                False,
                capability["reason_code"],
                capability["reason"],
            )
        )
        return False, checks[-1]["reason_code"], checks[-1]["reason"], checks
    checks.append(_check("provider_capability", True))

    comparisons = [
        (
            "adapter_match",
            session_record.get("adapter") == adapter,
            "adapter_mismatch",
            f"Praxis recorded adapter={session_record.get('adapter')!r}, expected {adapter!r}.",
        ),
        (
            "requested_session_match",
            session_record.get("session_id") == requested_session_id,
            "session_id_mismatch",
            "The requested provider session does not match the durable Praxis cursor.",
        ),
        (
            "run_match",
            session_record.get("run_id") == run.get("run_id"),
            "run_mismatch",
            "The stored session belongs to a different Praxis run.",
        ),
        (
            "worker_match",
            session_record.get("worker_id") == payload["worker"]["worker_id"],
            "worker_mismatch",
            "The stored session belongs to a different Praxis worker.",
        ),
        (
            "workspace_match",
            session_record.get("workspace_root") == repo_root_str,
            "workspace_mismatch",
            "The stored session was recorded in a different workspace root.",
        ),
        (
            "permission_profile_match",
            session_record.get("permission_profile") == payload["permissions"]["profile"],
            "permission_profile_mismatch",
            "The stored session used a different permission profile.",
        ),
        (
            "worktree_mode_match",
            session_record.get("worktree_mode") == payload["worker"]["worktree_mode"],
            "worktree_mode_mismatch",
            "The stored session used a different worktree mode.",
        ),
        (
            "scope_match",
            session_record.get("current_scope") == dispatch["scope"],
            "scope_mismatch",
            "The stored session belongs to a different workflow scope.",
        ),
        (
            "slice_match",
            session_record.get("current_slice_id") == dispatch["slice_id"],
            "slice_mismatch",
            "The stored session belongs to a different slice.",
        ),
        (
            "stage_match",
            session_record.get("current_stage") == dispatch["stage"],
            "stage_mismatch",
            "The stored session belongs to a different workflow stage.",
        ),
        (
            "artifact_dir_match",
            session_record.get("current_artifact_dir") == dispatch["artifact_dir"],
            "artifact_dir_mismatch",
            "The stored session belongs to a different artifact directory.",
        ),
        (
            "worker_signature_match",
            session_record.get("worker_signature")
            == worker_signature_from_payload(run_id=run["run_id"], payload=payload),
            "worker_signature_mismatch",
            "The worker plan changed since the provider session was recorded.",
        ),
        (
            "context_fingerprint_match",
            session_record.get("context_fingerprint") == context_fingerprint_from_payload(payload),
            "context_fingerprint_mismatch",
            "The bounded Praxis context changed since the provider session was recorded.",
        ),
        (
            "boundary_handoff_match",
            session_record.get("boundary_handoff_fingerprint")
            == boundary_handoff_fingerprint_from_payload(payload),
            "handoff_fingerprint_mismatch",
            "The active story-boundary handoff changed since the provider session was recorded.",
        ),
        (
            "artifact_dir_exists",
            (repo_root / dispatch["artifact_dir"]).exists(),
            "artifact_dir_missing",
            "The expected artifact directory is no longer present in the workspace.",
        ),
    ]

    for name, passed, reason_code, reason in comparisons:
        checks.append(_check(name, passed, reason_code, reason))
        if not passed:
            return False, reason_code, reason, checks

    return True, None, None, checks


def _extract_session_id(text: str) -> str | None:
    for line in text.splitlines():
        candidate = line.strip()
        if not candidate:
            continue
        try:
            payload = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            for key in ("session_id", "sessionId", "conversation_id", "conversationId", "id"):
                value = payload.get(key)
                if isinstance(value, str) and value:
                    return value
    return None


def _provider_resume_command(
    *,
    adapter: str,
    repo_root: Path,
    session_id: str,
    prompt: str,
    resume_mode: str,
) -> dict[str, Any]:
    if adapter == "codex":
        args = ["codex", "exec", "resume", session_id, prompt, "--json"]
        return _run_command(args, cwd=repo_root)
    if adapter == "claude" and resume_mode == "headless":
        args = ["claude", "--print", "--resume", session_id, prompt, "--output-format", "stream-json"]
        return _run_command(args, cwd=repo_root)
    raise ValueError(f"Unsupported provider resume path for adapter={adapter!r} mode={resume_mode!r}.")


def attempt_provider_resume(*, repo_root: Path, payload: dict[str, Any], timestamp: str) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    run = load_json(repo_root / ".praxis" / "run.json")
    ensure_run_vnext_defaults(run)

    requested_session_id = payload["resume"].get("session_id")
    if not isinstance(requested_session_id, str) or not requested_session_id:
        return {
            "status": "fallback",
            "reason_code": "session_missing",
            "reason": "Praxis does not have an active provider session to resume.",
            "resume_mode": "headless",
            "session_id": None,
        }

    try:
        session_record_rel, session_record = load_session_record(
            repo_root=repo_root,
            adapter=payload["adapter"],
            session_id=requested_session_id,
        )
    except Exception as exc:
        safety_checks = [
            _check(
                "session_record_valid",
                False,
                "invalid_session_record",
                str(exc),
            )
        ]
        write_result = write_native_resume_result(
            repo_root=repo_root,
            payload=payload,
            recorded_at=timestamp,
            resume_mode="headless",
            requested_session_id=requested_session_id,
            resolved_session_id=None,
            outcome="invalid_session_record",
            reason_code="invalid_session_record",
            reason=str(exc),
            safety_checks=safety_checks,
            provider_metadata={},
            prompt_injected=False,
            session_record=None,
            session_record_rel=None,
        )
        return {
            "status": "fallback",
            "reason_code": "invalid_session_record",
            "reason": str(exc),
            "resume_mode": "headless",
            "session_id": requested_session_id,
            "resume_record_path": write_result["record_rel"],
        }
    capability = _provider_capability(
        adapter=payload["adapter"],
        repo_root=repo_root,
        resume_mode="headless",
    )
    safe, reason_code, reason, safety_checks = _evaluate_resume_safety(
        repo_root=repo_root,
        run=run,
        payload=payload,
        requested_session_id=requested_session_id,
        session_record=session_record,
        resume_mode="headless",
        capability=capability,
    )
    if not safe:
        write_result = write_native_resume_result(
            repo_root=repo_root,
            payload=payload,
            recorded_at=timestamp,
            resume_mode="headless",
            requested_session_id=requested_session_id,
            resolved_session_id=None,
            outcome=reason_code or "provider_resume_failed",
            reason_code=reason_code or "provider_resume_failed",
            reason=reason or "Provider-native resume could not be used safely.",
            safety_checks=safety_checks,
            provider_metadata={"capability": capability},
            prompt_injected=False,
            session_record=session_record,
            session_record_rel=session_record_rel,
        )
        return {
            "status": "fallback",
            "reason_code": reason_code,
            "reason": reason,
            "resume_mode": "headless",
            "session_id": requested_session_id,
            "resume_record_path": write_result["record_rel"],
        }

    prompt = _resume_prompt(payload)
    provider_result = _provider_resume_command(
        adapter=payload["adapter"],
        repo_root=repo_root,
        session_id=session_record.get("provider_locator") or requested_session_id,
        prompt=prompt,
        resume_mode="headless",
    )
    stage_result_path = payload["dispatch"].get("stage_result_path")
    stage_result_written = bool(stage_result_path) and (repo_root / stage_result_path).exists()
    provider_metadata = {
        "capability": capability,
        "command": provider_result["args"],
        "returncode": provider_result["returncode"],
        "stdout": provider_result["stdout"],
        "stderr": provider_result["stderr"],
    }

    if not provider_result["ok"]:
        write_result = write_native_resume_result(
            repo_root=repo_root,
            payload=payload,
            recorded_at=timestamp,
            resume_mode="headless",
            requested_session_id=requested_session_id,
            resolved_session_id=None,
            outcome="provider_rejected",
            reason_code="provider_rejected",
            reason="The provider-native resume command exited without completing successfully.",
            safety_checks=safety_checks,
            provider_metadata=provider_metadata,
            prompt_injected=True,
            session_record=session_record,
            session_record_rel=session_record_rel,
        )
        return {
            "status": "fallback",
            "reason_code": "provider_rejected",
            "reason": "The provider-native resume command exited without completing successfully.",
            "resume_mode": "headless",
            "session_id": requested_session_id,
            "resume_record_path": write_result["record_rel"],
        }

    if not stage_result_written:
        write_result = write_native_resume_result(
            repo_root=repo_root,
            payload=payload,
            recorded_at=timestamp,
            resume_mode="headless",
            requested_session_id=requested_session_id,
            resolved_session_id=None,
            outcome="missing_stage_result",
            reason_code="missing_stage_result",
            reason="The resumed provider session did not write the required stage result artifact.",
            safety_checks=safety_checks,
            provider_metadata=provider_metadata,
            prompt_injected=True,
            session_record=session_record,
            session_record_rel=session_record_rel,
        )
        return {
            "status": "fallback",
            "reason_code": "missing_stage_result",
            "reason": "The resumed provider session did not write the required stage result artifact.",
            "resume_mode": "headless",
            "session_id": requested_session_id,
            "resume_record_path": write_result["record_rel"],
        }

    resolved_session_id = _extract_session_id(provider_result["stdout"]) or requested_session_id
    write_result = write_native_resume_result(
        repo_root=repo_root,
        payload=payload,
        recorded_at=timestamp,
        resume_mode="headless",
        requested_session_id=requested_session_id,
        resolved_session_id=resolved_session_id,
        outcome="resumed",
        reason_code="worker_resumed",
        reason="The provider-native resume completed and the worker remains aligned with the durable Praxis cursor.",
        safety_checks=safety_checks,
        provider_metadata=provider_metadata,
        prompt_injected=True,
        session_record=session_record,
        session_record_rel=session_record_rel,
        source="resume",
    )
    return {
        "status": "resumed",
        "reason_code": "worker_resumed",
        "reason": "The provider-native resume completed and the worker remains aligned with the durable Praxis cursor.",
        "resume_mode": "headless",
        "session_id": resolved_session_id,
        "resume_record_path": write_result["record_rel"],
    }


def reconcile_manual_resume(
    *,
    repo_root: Path,
    payload: dict[str, Any],
    hook_request: dict[str, Any],
    recorded_at: str,
) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    run = load_json(repo_root / ".praxis" / "run.json")
    ensure_run_vnext_defaults(run)

    requested_session_id = payload["resume"].get("session_id")
    if not isinstance(requested_session_id, str) or not requested_session_id:
        safety_checks = [
            _check(
                "session_cursor_present",
                False,
                "session_missing",
                "Praxis does not have an active provider session cursor to resume.",
            )
        ]
        write_result = write_native_resume_result(
            repo_root=repo_root,
            payload=payload,
            recorded_at=recorded_at,
            resume_mode="interactive",
            requested_session_id=str(hook_request.get("session_id") or "unknown-session"),
            resolved_session_id=None,
            outcome="session_missing",
            reason_code="session_missing",
            reason="Praxis does not have an active provider session cursor to resume.",
            safety_checks=safety_checks,
            provider_metadata={"hook_source": hook_request.get("source")},
            prompt_injected=False,
            session_record=None,
            session_record_rel=None,
            source=str(hook_request.get("source") or "resume"),
        )
        return {
            "allowed": False,
            "reason_code": "session_missing",
            "reason": "Praxis does not have an active provider session cursor to resume.",
            "resume_record_path": write_result["record_rel"],
        }

    try:
        session_record_rel, session_record = load_session_record(
            repo_root=repo_root,
            adapter=payload["adapter"],
            session_id=requested_session_id,
        )
    except Exception as exc:
        safety_checks = [
            _check(
                "session_record_valid",
                False,
                "invalid_session_record",
                str(exc),
            )
        ]
        write_result = write_native_resume_result(
            repo_root=repo_root,
            payload=payload,
            recorded_at=recorded_at,
            resume_mode="interactive",
            requested_session_id=requested_session_id,
            resolved_session_id=None,
            outcome="invalid_session_record",
            reason_code="invalid_session_record",
            reason=str(exc),
            safety_checks=safety_checks,
            provider_metadata={"hook_source": hook_request.get("source")},
            prompt_injected=False,
            session_record=None,
            session_record_rel=None,
            source=str(hook_request.get("source") or "resume"),
        )
        return {
            "allowed": False,
            "reason_code": "invalid_session_record",
            "reason": str(exc),
            "resume_record_path": write_result["record_rel"],
        }
    capability = _provider_capability(
        adapter=payload["adapter"],
        repo_root=repo_root,
        resume_mode="interactive",
    )
    safe, reason_code, reason, safety_checks = _evaluate_resume_safety(
        repo_root=repo_root,
        run=run,
        payload=payload,
        requested_session_id=requested_session_id,
        session_record=session_record,
        resume_mode="interactive",
        capability=capability,
    )
    provider_metadata = {
        "hook_source": hook_request.get("source"),
        "cwd": str(hook_request.get("cwd") or repo_root),
    }
    if not safe:
        write_result = write_native_resume_result(
            repo_root=repo_root,
            payload=payload,
            recorded_at=recorded_at,
            resume_mode="interactive",
            requested_session_id=requested_session_id,
            resolved_session_id=None,
            outcome=reason_code or "provider_resume_failed",
            reason_code=reason_code or "provider_resume_failed",
            reason=reason or "Provider-native resume could not be used safely.",
            safety_checks=safety_checks,
            provider_metadata=provider_metadata,
            prompt_injected=False,
            session_record=session_record,
            session_record_rel=session_record_rel,
            source=str(hook_request.get("source") or "resume"),
        )
        return {
            "allowed": False,
            "reason_code": reason_code,
            "reason": reason,
            "resume_record_path": write_result["record_rel"],
        }

    resolved_session_id = str(hook_request.get("session_id") or requested_session_id)
    write_result = write_native_resume_result(
        repo_root=repo_root,
        payload=payload,
        recorded_at=recorded_at,
        resume_mode="interactive",
        requested_session_id=requested_session_id,
        resolved_session_id=resolved_session_id,
        outcome="resumed",
        reason_code="worker_resumed",
        reason="The manual provider resume remains aligned with the durable Praxis cursor.",
        safety_checks=safety_checks,
        provider_metadata=provider_metadata,
        prompt_injected=False,
        session_record=session_record,
        session_record_rel=session_record_rel,
        source=str(hook_request.get("source") or "resume"),
    )
    return {
        "allowed": True,
        "reason_code": "worker_resumed",
        "reason": "The manual provider resume remains aligned with the durable Praxis cursor.",
        "session_id": resolved_session_id,
        "resume_record_path": write_result["record_rel"],
    }
