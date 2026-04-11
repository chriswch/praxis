from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .contract_validation import validate_contract_payload
from .durable_state import dump_json, write_json_atomic
from .harness_config import build_worker_launch_payload


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _load_hook_request() -> dict[str, Any]:
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("Codex hook input must be a JSON object.")
    return payload


def _slug(value: str, *, fallback: str) -> str:
    candidate = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-._")
    return candidate or fallback


def _record_relpath(*, recorded_at: str, session_id: str) -> str:
    ts = recorded_at.replace("-", "").replace(":", "").replace(".", "")
    return f".praxis/runtime/codex-launches/{ts}-{_slug(session_id, fallback='session')}.json"


def build_native_launch_record(
    *,
    repo_root: Path,
    hook_request: dict[str, Any],
    payload: dict[str, Any],
    recorded_at: str,
) -> tuple[str, dict[str, Any]]:
    del repo_root
    session_id = str(hook_request.get("session_id") or "unknown-session")
    handoff = payload["inputs"]["boundary_handoff"]
    record_rel = _record_relpath(recorded_at=recorded_at, session_id=session_id)
    record = {
        "version": 1,
        "recorded_at": recorded_at,
        "adapter": "codex",
        "kind": "session_start",
        "session": {
            "id": session_id,
            "source": str(hook_request.get("source") or "unknown"),
            "cwd": str(hook_request.get("cwd") or "."),
        },
        "dispatch": {
            "workflow": payload["workflow"],
            "scope": payload["dispatch"]["scope"],
            "slice_id": payload["dispatch"]["slice_id"],
            "artifact_dir": payload["dispatch"]["artifact_dir"],
            "stage": payload["dispatch"]["stage"],
            "boundary_handoff_path": payload["dispatch"]["boundary_handoff_path"],
        },
        "context": {
            "fresh_context": payload["context_policy"]["fresh_context"],
            "carry_forward_mode": payload["context_policy"]["carry_forward_mode"],
            "allowed_context_sources": payload["context_policy"]["allowed_context_sources"],
            "handoff_injected": payload["context_policy"]["handoff_injected"],
            "boundary_handoff_story_id": handoff["story_id"] if handoff else None,
            "boundary_handoff_next_story_id": handoff["next_story_id"] if handoff else None,
        },
        "harness": {
            "instructions_path": payload["harness"]["instructions_path"],
            "project_config_path": payload["harness"]["project_config_path"],
            "hooks_path": payload["harness"]["hooks_path"],
            "agents_path": payload["harness"]["agents_path"],
            "launch_record_path": record_rel,
            "compatibility": payload["harness"]["compatibility"],
        },
    }
    validate_contract_payload("native-launch.schema.json", record)
    return record_rel, record


def write_native_launch_record(
    *,
    repo_root: Path,
    hook_request: dict[str, Any],
    payload: dict[str, Any],
    recorded_at: str,
) -> tuple[str, dict[str, Any]]:
    record_rel, record = build_native_launch_record(
        repo_root=repo_root,
        hook_request=hook_request,
        payload=payload,
        recorded_at=recorded_at,
    )
    write_json_atomic(repo_root / record_rel, record)
    return record_rel, record


def build_session_start_additional_context(*, payload: dict[str, Any], record_rel: str) -> str:
    dispatch = payload["dispatch"]
    handoff = payload["inputs"]["boundary_handoff"]
    lines = [
        "Praxis Codex launch context",
        f"- workflow: {payload['workflow']}",
        f"- scope: {dispatch['scope']}",
        f"- slice_id: {dispatch['slice_id'] or 'root'}",
        f"- stage: {dispatch['stage'] or 'none'}",
        f"- artifact_dir: {dispatch['artifact_dir']}",
        f"- run_metadata: {payload['inputs']['run_path']}",
        f"- launch_record: {record_rel}",
        "- carry-forward rule: use only this dispatch plus the active boundary handoff",
    ]
    if handoff is None:
        lines.append("- boundary_handoff: none")
        return "\n".join(lines)

    lines.extend(
        [
            f"- boundary_handoff_path: {payload['inputs']['boundary_handoff_path']}",
            f"- boundary_from_story: {handoff['story_id']}",
            f"- boundary_to_story: {handoff['next_story_id']}",
            f"- handoff_summary: {handoff['summary']}",
            "- carry_forward_context:",
        ]
    )
    for item in handoff.get("carry_forward_context", []):
        lines.append(f"  - {item}")
    return "\n".join(lines)


def _success_response(*, payload: dict[str, Any], record_rel: str) -> dict[str, Any]:
    return {
        "continue": True,
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": build_session_start_additional_context(payload=payload, record_rel=record_rel),
        },
    }


def _failure_response(message: str) -> dict[str, Any]:
    return {
        "continue": False,
        "stopReason": message,
        "systemMessage": message,
    }


def session_start_hook(*, repo_root: Path, recorded_at: str | None = None) -> int:
    hook_request = _load_hook_request()
    ts = recorded_at or _utc_now()

    try:
        payload = build_worker_launch_payload(repo_root=repo_root)
        if payload["adapter"] != "codex":
            raise ValueError(f"Codex session-start hook received non-codex adapter {payload['adapter']!r}.")
        record_rel, _ = write_native_launch_record(
            repo_root=repo_root,
            hook_request=hook_request,
            payload=payload,
            recorded_at=ts,
        )
        response = _success_response(payload=payload, record_rel=record_rel)
    except Exception as exc:
        response = _failure_response(f"Praxis could not prepare the native Codex launch: {exc}")

    print(dump_json(response), end="")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bridge native Codex hooks to shared Praxis runtime helpers.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    session_start_parser = subparsers.add_parser("session-start")
    session_start_parser.add_argument("--repo-root", default=".")
    session_start_parser.add_argument("--timestamp")

    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve()

    if args.command == "session-start":
        return session_start_hook(repo_root=repo_root, recorded_at=args.timestamp)

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
