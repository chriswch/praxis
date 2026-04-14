from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .observability.trace_events import build_trace_context_from_payload, build_trace_event, render_trace_text
from .policy_records import build_policy_record
from .state.contract_validation import validate_contract_payload
from .state.durable_state import commit_transaction, dump_events, dump_json, extend_event_log, load_json
from .workers.bookkeeping import resolve_worker_record_relpath


_READ_ONLY_GIT_SUBCOMMANDS = {"status", "diff", "show", "rev-parse", "log", "branch"}
_READ_ONLY_COMMANDS = {"cat", "head", "tail", "ls", "pwd", "find", "rg", "grep", "sed"}
_NETWORK_COMMANDS = {"curl", "wget", "pip", "pip3", "npm", "pnpm", "yarn", "uv"}
_DESTRUCTIVE_COMMANDS = {"rm", "rmdir", "dd", "mkfs", "diskutil"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _slug(value: str, *, fallback: str) -> str:
    candidate = "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "-" for ch in value).strip("-._")
    return candidate or fallback


def _tool_record_relpath(*, dispatch_id: str, recorded_at: str, tool_id: str) -> str:
    ts = recorded_at.replace("-", "").replace(":", "").replace(".", "")
    tool_slug = _slug(tool_id, fallback="tool")
    return f".praxis/runtime/tools/{dispatch_id}/{ts}-{tool_slug}.json"


def _json_preview(value: Any, *, limit: int = 4000) -> str:
    text = json.dumps(value, ensure_ascii=True, indent=2)
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def _text_preview(value: str, *, limit: int = 4000) -> str:
    if len(value) <= limit:
        return value
    return value[: limit - 3] + "..."


def _repo_relpath(*, repo_root: Path, value: str) -> str:
    path = Path(value)
    if not path.is_absolute():
        path = repo_root / path
    resolved = path.resolve()
    try:
        relative = resolved.relative_to(repo_root)
    except ValueError as exc:
        raise ValueError(f"Path is outside the Praxis workspace: {value!r}.") from exc
    return relative.as_posix() or "."


def _path_within(path: str, root: str) -> bool:
    if path == root:
        return True
    root_prefix = root.rstrip("/") + "/"
    return path.startswith(root_prefix)


def _matches_blocked_path(path: str, blocked_paths: list[str]) -> bool:
    return any(_path_within(path, blocked) for blocked in blocked_paths)


def _matches_writable_root(path: str, writable_roots: list[str]) -> bool:
    return any(_path_within(path, root) for root in writable_roots)


def _command_uses_network(argv: list[str]) -> bool:
    if not argv:
        return False
    first = argv[0]
    if first in _NETWORK_COMMANDS:
        return True
    if first == "git" and len(argv) > 1 and argv[1] in {"clone", "fetch", "pull", "push", "ls-remote"}:
        return True
    return False


def _command_is_destructive(argv: list[str]) -> bool:
    if not argv:
        return False
    first = argv[0]
    if first in _DESTRUCTIVE_COMMANDS:
        return True
    if first == "git" and len(argv) > 1 and argv[1] in {"clean", "reset", "rebase", "checkout"}:
        return True
    return False


def _command_is_read_only(argv: list[str]) -> bool:
    if not argv:
        return False
    first = argv[0]
    if first == "git":
        return len(argv) > 1 and argv[1] in _READ_ONLY_GIT_SUBCOMMANDS
    if first == "sed":
        return all(arg != "-i" and not arg.startswith("-i") for arg in argv[1:])
    return first in _READ_ONLY_COMMANDS


def _tool_lookup(manifest: dict[str, Any], tool_id: str) -> dict[str, Any]:
    for item in manifest.get("tools", []):
        if item.get("tool_id") == tool_id:
            return item
    raise ValueError(f"Praxis could not find tool_id={tool_id!r} in the durable tool manifest.")


def _load_worker_context(*, repo_root: Path, worker_id: str) -> dict[str, Any]:
    relpath = resolve_worker_record_relpath(repo_root=repo_root, worker_id=worker_id)
    if relpath is None:
        raise ValueError(f"Praxis could not find a durable worker record for {worker_id!r}.")
    worker_record = load_json(repo_root / relpath)
    validate_contract_payload("worker-record.schema.json", worker_record)
    payload = load_json(repo_root / worker_record["worker_launch_path"])
    validate_contract_payload("worker-launch.schema.json", payload)
    manifest = load_json(repo_root / payload["bundle"]["tool_manifest_path"])
    validate_contract_payload("tool-manifest.schema.json", manifest)
    run = load_json(repo_root / ".praxis" / "run.json")
    return {
        "run": run,
        "worker_record": worker_record,
        "payload": payload,
        "tool_manifest": manifest,
    }


def _requested_event(*, payload: dict[str, Any], recorded_at: str, tool_id: str, tool_record_path: str) -> dict[str, Any]:
    dispatch = payload["dispatch"]
    return {
        "ts": recorded_at,
        "type": "tool_invocation_requested",
        "adapter": payload["adapter"],
        "scope": dispatch["scope"],
        "slice_id": dispatch["slice_id"],
        "artifact_dir": dispatch["artifact_dir"],
        "stage": dispatch["stage"],
        "boundary_handoff_path": dispatch["boundary_handoff_path"],
        "worker_id": payload["worker"]["worker_id"],
        "tool_id": tool_id,
        "tool_record_path": tool_record_path,
        "reason_code": "tool_invocation_requested",
        "reason": "Praxis recorded a brokered tool invocation request.",
    }


def _final_event(*, payload: dict[str, Any], recorded_at: str, tool_id: str, tool_record_path: str, status: str, reason_code: str, reason: str) -> dict[str, Any]:
    dispatch = payload["dispatch"]
    event_type = {
        "completed": "tool_invocation_completed",
        "denied": "tool_invocation_denied",
        "failed": "tool_invocation_failed",
    }[status]
    return {
        "ts": recorded_at,
        "type": event_type,
        "adapter": payload["adapter"],
        "scope": dispatch["scope"],
        "slice_id": dispatch["slice_id"],
        "artifact_dir": dispatch["artifact_dir"],
        "stage": dispatch["stage"],
        "boundary_handoff_path": dispatch["boundary_handoff_path"],
        "worker_id": payload["worker"]["worker_id"],
        "tool_id": tool_id,
        "tool_record_path": tool_record_path,
        "reason_code": reason_code,
        "reason": reason,
    }


def _write_policy_denial(
    *,
    repo_root: Path,
    run: dict[str, Any],
    payload: dict[str, Any],
    recorded_at: str,
    gate_type: str,
    configured_value: str,
    reason_code: str,
    reason: str,
) -> tuple[str, dict[str, Any]]:
    return build_policy_record(
        run=run,
        recorded_at=recorded_at,
        gate_type=gate_type,
        decision="denied",
        source="tool_broker",
        reason_code=reason_code,
        reason=reason,
        configured_value=configured_value,
        dispatch_id=payload["bundle"]["dispatch_id"],
        dispatch_record_path=payload["bundle"]["dispatch_record_path"],
        context_manifest_path=payload["bundle"]["context_manifest_path"],
        worker_class=payload["worker"]["worker_class"],
        worker_id=payload["worker"]["worker_id"],
        permission_profile=payload["permissions"]["profile"],
        worktree_mode=payload["worker"]["worktree_mode"],
        scope=payload["dispatch"]["scope"],
        slice_id=payload["dispatch"]["slice_id"],
        artifact_dir=payload["dispatch"]["artifact_dir"],
        stage=payload["dispatch"]["stage"],
    )


def _persist_tool_record(
    *,
    repo_root: Path,
    payload: dict[str, Any],
    tool_meta: dict[str, Any],
    recorded_at: str,
    request: dict[str, Any],
    status: str,
    reason_code: str,
    reason: str,
    response: dict[str, Any],
    extra_files: dict[str, str] | None = None,
    policy_record: tuple[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    tool_id = tool_meta["tool_id"]
    record_rel = _tool_record_relpath(
        dispatch_id=payload["bundle"]["dispatch_id"],
        recorded_at=recorded_at,
        tool_id=tool_id,
    )
    record = {
        "version": 1,
        "recorded_at": recorded_at,
        "run_id": load_json(repo_root / ".praxis" / "run.json")["run_id"],
        "dispatch_id": payload["bundle"]["dispatch_id"],
        "adapter": payload["adapter"],
        "workflow": payload["workflow"],
        "scope": payload["dispatch"]["scope"],
        "slice_id": payload["dispatch"]["slice_id"],
        "artifact_dir": payload["dispatch"]["artifact_dir"],
        "stage": payload["dispatch"]["stage"],
        "worker": {
            "worker_id": payload["worker"]["worker_id"],
            "worker_class": payload["worker"]["worker_class"],
            "session_id": payload["resume"].get("session_id"),
            "dispatch_record_path": payload["bundle"]["dispatch_record_path"],
            "worker_record_path": resolve_worker_record_relpath(repo_root=repo_root, worker_id=payload["worker"]["worker_id"]),
        },
        "tool": {
            "tool_id": tool_id,
            "description": tool_meta["description"],
            "permission_class": tool_meta["permission_class"],
            "side_effect_class": tool_meta["side_effect_class"],
            "latency_class": tool_meta["latency_class"],
            "provenance": tool_meta["provenance"],
            "native_surface": tool_meta["native_surface"],
            "broker_action": tool_meta.get("broker_action"),
        },
        "policy": payload["permissions"],
        "request": request,
        "outcome": {
            "status": status,
            "reason_code": reason_code,
            "reason": reason,
        },
        "response": response,
    }
    validate_contract_payload("tool-record.schema.json", record)

    request_event = _requested_event(
        payload=payload,
        recorded_at=recorded_at,
        tool_id=tool_id,
        tool_record_path=record_rel,
    )
    final_event = _final_event(
        payload=payload,
        recorded_at=recorded_at,
        tool_id=tool_id,
        tool_record_path=record_rel,
        status=status,
        reason_code=reason_code,
        reason=reason,
    )
    all_events = extend_event_log(repo_root, [request_event, final_event])

    trace_context = build_trace_context_from_payload(payload)
    trace_events = [
        build_trace_event(
            trace_context,
            recorded_at=recorded_at,
            event_type="tool_invocation_requested",
            reason_code="tool_invocation_requested",
            reason="Praxis recorded a brokered tool invocation request.",
            extra_fields={"tool_id": tool_id, "tool_record_path": record_rel},
        ),
        build_trace_event(
            trace_context,
            recorded_at=recorded_at,
            event_type={"completed": "tool_invocation_completed", "denied": "tool_invocation_denied", "failed": "tool_invocation_failed"}[status],
            reason_code=reason_code,
            reason=reason,
            extra_fields={"tool_id": tool_id, "tool_record_path": record_rel},
        ),
    ]

    files = {
        record_rel: dump_json(record),
        ".praxis/events.jsonl": dump_events(all_events),
        payload["resume"]["trace_path"]: render_trace_text(
            repo_root=repo_root,
            trace_path=payload["resume"]["trace_path"],
            events=trace_events,
        ),
        **(extra_files or {}),
    }
    if policy_record is not None:
        files[policy_record[0]] = dump_json(policy_record[1])
    commit_transaction(
        repo_root=repo_root,
        operation="record_tool_invocation",
        files=files,
        timestamp=recorded_at,
        metadata={"worker_id": payload["worker"]["worker_id"], "tool_id": tool_id, "status": status},
    )
    return {"record_rel": record_rel, "record": record}


def _deny_if_disabled(*, tool_meta: dict[str, Any]) -> tuple[str, str] | None:
    if tool_meta.get("enabled", False):
        return None
    return ("tool_disabled", "The requested brokered tool is disabled by the active dispatch policy.")


def _deny_write_paths(
    *,
    repo_root: Path,
    run: dict[str, Any],
    payload: dict[str, Any],
    write_paths: list[str],
    recorded_at: str,
) -> tuple[str, str, tuple[str, dict[str, Any]] | None] | None:
    permissions = payload["permissions"]
    normalized: list[str] = []
    for value in write_paths:
        try:
            rel = _repo_relpath(repo_root=repo_root, value=value)
        except ValueError:
            return (
                "filesystem_write_denied",
                "Praxis denied a write outside the repo workspace.",
                _write_policy_denial(
                    repo_root=repo_root,
                    run=run,
                    payload=payload,
                    recorded_at=recorded_at,
                    gate_type="filesystem",
                    configured_value=value,
                    reason_code="filesystem_write_denied",
                    reason="Praxis denied a write outside the repo workspace.",
                ),
            )
        normalized.append(rel)
    for rel in normalized:
        if _matches_blocked_path(rel, list(permissions.get("blocked_paths", []))):
            return (
                "control_plane_write_denied",
                "Praxis denied a write that targets blocked control-plane state.",
                _write_policy_denial(
                    repo_root=repo_root,
                    run=run,
                    payload=payload,
                    recorded_at=recorded_at,
                    gate_type="control_plane_write",
                    configured_value=rel,
                    reason_code="control_plane_write_denied",
                    reason="Praxis denied a write that targets blocked control-plane state.",
                ),
            )
        if not _matches_writable_root(rel, list(permissions.get("writable_roots", []))):
            return (
                "filesystem_write_denied",
                "Praxis denied a write outside the dispatch writable roots.",
                _write_policy_denial(
                    repo_root=repo_root,
                    run=run,
                    payload=payload,
                    recorded_at=recorded_at,
                    gate_type="filesystem",
                    configured_value=rel,
                    reason_code="filesystem_write_denied",
                    reason="Praxis denied a write outside the dispatch writable roots.",
                ),
            )
    return None


def invoke_repo_read(*, repo_root: Path, worker_id: str, path: str, timestamp: str | None = None) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    recorded_at = timestamp or _utc_now()
    context = _load_worker_context(repo_root=repo_root, worker_id=worker_id)
    payload = context["payload"]
    tool_meta = _tool_lookup(context["tool_manifest"], "repo_read")
    disabled = _deny_if_disabled(tool_meta=tool_meta)
    request = {"path": path}
    if disabled is not None:
        result = _persist_tool_record(
            repo_root=repo_root,
            payload=payload,
            tool_meta=tool_meta,
            recorded_at=recorded_at,
            request=request,
            status="denied",
            reason_code=disabled[0],
            reason=disabled[1],
            response={},
        )
        return {"status": "denied", "reason_code": disabled[0], "record_path": result["record_rel"]}
    relpath = _repo_relpath(repo_root=repo_root, value=path)
    full_path = repo_root / relpath
    if not full_path.exists():
        result = _persist_tool_record(
            repo_root=repo_root,
            payload=payload,
            tool_meta=tool_meta,
            recorded_at=recorded_at,
            request={"path": relpath},
            status="failed",
            reason_code="path_missing",
            reason="Praxis could not read a missing repo path.",
            response={},
        )
        return {"status": "failed", "reason_code": "path_missing", "record_path": result["record_rel"]}
    content = full_path.read_text()
    result = _persist_tool_record(
        repo_root=repo_root,
        payload=payload,
        tool_meta=tool_meta,
        recorded_at=recorded_at,
        request={"path": relpath},
        status="completed",
        reason_code="tool_completed",
        reason="Praxis completed the repo read helper.",
        response={"path": relpath, "content_preview": _text_preview(content)},
    )
    return {"status": "completed", "path": relpath, "content": content, "record_path": result["record_rel"]}


def invoke_repo_search(*, repo_root: Path, worker_id: str, pattern: str, search_root: str = ".", timestamp: str | None = None) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    recorded_at = timestamp or _utc_now()
    context = _load_worker_context(repo_root=repo_root, worker_id=worker_id)
    payload = context["payload"]
    tool_meta = _tool_lookup(context["tool_manifest"], "repo_search")
    disabled = _deny_if_disabled(tool_meta=tool_meta)
    request = {"pattern": pattern, "search_root": search_root}
    if disabled is not None:
        result = _persist_tool_record(repo_root=repo_root, payload=payload, tool_meta=tool_meta, recorded_at=recorded_at, request=request, status="denied", reason_code=disabled[0], reason=disabled[1], response={})
        return {"status": "denied", "reason_code": disabled[0], "record_path": result["record_rel"]}
    rel_root = _repo_relpath(repo_root=repo_root, value=search_root)
    completed = subprocess.run(["rg", "-n", pattern, rel_root], cwd=repo_root, capture_output=True, text=True, check=False)
    stdout = completed.stdout
    stderr = completed.stderr
    status = "completed" if completed.returncode in {0, 1} else "failed"
    reason_code = "tool_completed" if status == "completed" else "search_failed"
    reason = "Praxis completed the repo search helper." if status == "completed" else (stderr.strip() or "Repo search failed.")
    result = _persist_tool_record(
        repo_root=repo_root,
        payload=payload,
        tool_meta=tool_meta,
        recorded_at=recorded_at,
        request={"pattern": pattern, "search_root": rel_root},
        status=status,
        reason_code=reason_code,
        reason=reason,
        response={"stdout_preview": _text_preview(stdout), "stderr_preview": _text_preview(stderr), "returncode": completed.returncode},
    )
    return {"status": status, "matches": stdout.splitlines(), "record_path": result["record_rel"]}


def invoke_repo_shell(
    *,
    repo_root: Path,
    worker_id: str,
    argv: list[str],
    write_paths: list[str] | None = None,
    timestamp: str | None = None,
) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    recorded_at = timestamp or _utc_now()
    context = _load_worker_context(repo_root=repo_root, worker_id=worker_id)
    payload = context["payload"]
    tool_meta = _tool_lookup(context["tool_manifest"], "repo_shell")
    disabled = _deny_if_disabled(tool_meta=tool_meta)
    request = {"argv": argv, "write_paths": list(write_paths or [])}
    if disabled is not None:
        result = _persist_tool_record(repo_root=repo_root, payload=payload, tool_meta=tool_meta, recorded_at=recorded_at, request=request, status="denied", reason_code=disabled[0], reason=disabled[1], response={})
        return {"status": "denied", "reason_code": disabled[0], "record_path": result["record_rel"]}
    if not argv:
        result = _persist_tool_record(repo_root=repo_root, payload=payload, tool_meta=tool_meta, recorded_at=recorded_at, request=request, status="failed", reason_code="command_missing", reason="Praxis brokered shell commands require at least one argv token.", response={})
        return {"status": "failed", "reason_code": "command_missing", "record_path": result["record_rel"]}
    if _command_uses_network(argv) and payload["permissions"]["network_access"] == "restricted":
        policy = _write_policy_denial(
            repo_root=repo_root,
            run=context["run"],
            payload=payload,
            recorded_at=recorded_at,
            gate_type="network",
            configured_value=" ".join(argv),
            reason_code="network_denied",
            reason="Praxis denied a shell command that requires network access.",
        )
        result = _persist_tool_record(repo_root=repo_root, payload=payload, tool_meta=tool_meta, recorded_at=recorded_at, request=request, status="denied", reason_code="network_denied", reason="Praxis denied a shell command that requires network access.", response={}, policy_record=policy)
        return {"status": "denied", "reason_code": "network_denied", "record_path": result["record_rel"]}
    if _command_is_destructive(argv) and not payload["permissions"]["destructive_commands_allowed"]:
        policy = _write_policy_denial(
            repo_root=repo_root,
            run=context["run"],
            payload=payload,
            recorded_at=recorded_at,
            gate_type="destructive_command",
            configured_value=" ".join(argv),
            reason_code="destructive_command_denied",
            reason="Praxis denied a destructive shell command.",
        )
        result = _persist_tool_record(repo_root=repo_root, payload=payload, tool_meta=tool_meta, recorded_at=recorded_at, request=request, status="denied", reason_code="destructive_command_denied", reason="Praxis denied a destructive shell command.", response={}, policy_record=policy)
        return {"status": "denied", "reason_code": "destructive_command_denied", "record_path": result["record_rel"]}
    declared_write_paths = list(write_paths or [])
    if not declared_write_paths and not _command_is_read_only(argv):
        result = _persist_tool_record(repo_root=repo_root, payload=payload, tool_meta=tool_meta, recorded_at=recorded_at, request=request, status="denied", reason_code="write_paths_required", reason="Praxis requires declared write paths for brokered shell commands with side effects.", response={})
        return {"status": "denied", "reason_code": "write_paths_required", "record_path": result["record_rel"]}
    denial = _deny_write_paths(
        repo_root=repo_root,
        run=context["run"],
        payload=payload,
        write_paths=declared_write_paths,
        recorded_at=recorded_at,
    )
    if denial is not None:
        reason_code, reason, policy = denial
        result = _persist_tool_record(repo_root=repo_root, payload=payload, tool_meta=tool_meta, recorded_at=recorded_at, request=request, status="denied", reason_code=reason_code, reason=reason, response={}, policy_record=policy)
        return {"status": "denied", "reason_code": reason_code, "record_path": result["record_rel"]}
    cwd_value = payload["worker"].get("worktree_path") or "."
    cwd = repo_root / cwd_value if not Path(str(cwd_value)).is_absolute() else Path(str(cwd_value))
    completed = subprocess.run(argv, cwd=cwd, capture_output=True, text=True, check=False)
    status = "completed" if completed.returncode == 0 else "failed"
    reason_code = "tool_completed" if status == "completed" else "shell_command_failed"
    reason = "Praxis completed the brokered shell command." if status == "completed" else (completed.stderr.strip() or completed.stdout.strip() or "Brokered shell command failed.")
    result = _persist_tool_record(
        repo_root=repo_root,
        payload=payload,
        tool_meta=tool_meta,
        recorded_at=recorded_at,
        request=request,
        status=status,
        reason_code=reason_code,
        reason=reason,
        response={"returncode": completed.returncode, "stdout_preview": _text_preview(completed.stdout), "stderr_preview": _text_preview(completed.stderr)},
    )
    return {"status": status, "returncode": completed.returncode, "stdout": completed.stdout, "stderr": completed.stderr, "record_path": result["record_rel"]}


def invoke_repo_patch(
    *,
    repo_root: Path,
    worker_id: str,
    patch_text: str,
    write_paths: list[str],
    timestamp: str | None = None,
) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    recorded_at = timestamp or _utc_now()
    context = _load_worker_context(repo_root=repo_root, worker_id=worker_id)
    payload = context["payload"]
    tool_meta = _tool_lookup(context["tool_manifest"], "repo_patch")
    disabled = _deny_if_disabled(tool_meta=tool_meta)
    request = {"write_paths": list(write_paths), "patch_preview": _text_preview(patch_text)}
    if disabled is not None:
        result = _persist_tool_record(repo_root=repo_root, payload=payload, tool_meta=tool_meta, recorded_at=recorded_at, request=request, status="denied", reason_code=disabled[0], reason=disabled[1], response={})
        return {"status": "denied", "reason_code": disabled[0], "record_path": result["record_rel"]}
    denial = _deny_write_paths(
        repo_root=repo_root,
        run=context["run"],
        payload=payload,
        write_paths=write_paths,
        recorded_at=recorded_at,
    )
    if denial is not None:
        reason_code, reason, policy = denial
        result = _persist_tool_record(repo_root=repo_root, payload=payload, tool_meta=tool_meta, recorded_at=recorded_at, request=request, status="denied", reason_code=reason_code, reason=reason, response={}, policy_record=policy)
        return {"status": "denied", "reason_code": reason_code, "record_path": result["record_rel"]}
    cwd_value = payload["worker"].get("worktree_path") or "."
    cwd = repo_root / cwd_value if not Path(str(cwd_value)).is_absolute() else Path(str(cwd_value))
    with tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8") as handle:
        handle.write(patch_text)
        patch_path = Path(handle.name)
    try:
        completed = subprocess.run(["git", "apply", "--whitespace=nowarn", str(patch_path)], cwd=cwd, capture_output=True, text=True, check=False)
    finally:
        patch_path.unlink(missing_ok=True)
    status = "completed" if completed.returncode == 0 else "failed"
    reason_code = "tool_completed" if status == "completed" else "patch_failed"
    reason = "Praxis completed the brokered patch helper." if status == "completed" else (completed.stderr.strip() or completed.stdout.strip() or "Brokered patch helper failed.")
    result = _persist_tool_record(
        repo_root=repo_root,
        payload=payload,
        tool_meta=tool_meta,
        recorded_at=recorded_at,
        request=request,
        status=status,
        reason_code=reason_code,
        reason=reason,
        response={"returncode": completed.returncode, "stdout_preview": _text_preview(completed.stdout), "stderr_preview": _text_preview(completed.stderr)},
    )
    return {"status": status, "returncode": completed.returncode, "record_path": result["record_rel"]}


def invoke_network_fetch(*, repo_root: Path, worker_id: str, url: str, timestamp: str | None = None) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    recorded_at = timestamp or _utc_now()
    context = _load_worker_context(repo_root=repo_root, worker_id=worker_id)
    payload = context["payload"]
    tool_meta = _tool_lookup(context["tool_manifest"], "network_fetch")
    disabled = _deny_if_disabled(tool_meta=tool_meta)
    request = {"url": url}
    if disabled is not None:
        result = _persist_tool_record(repo_root=repo_root, payload=payload, tool_meta=tool_meta, recorded_at=recorded_at, request=request, status="denied", reason_code=disabled[0], reason=disabled[1], response={})
        return {"status": "denied", "reason_code": disabled[0], "record_path": result["record_rel"]}
    if payload["permissions"]["network_access"] == "restricted":
        policy = _write_policy_denial(
            repo_root=repo_root,
            run=context["run"],
            payload=payload,
            recorded_at=recorded_at,
            gate_type="network",
            configured_value=url,
            reason_code="network_denied",
            reason="Praxis denied network access for the brokered fetch helper.",
        )
        result = _persist_tool_record(repo_root=repo_root, payload=payload, tool_meta=tool_meta, recorded_at=recorded_at, request=request, status="denied", reason_code="network_denied", reason="Praxis denied network access for the brokered fetch helper.", response={}, policy_record=policy)
        return {"status": "denied", "reason_code": "network_denied", "record_path": result["record_rel"]}
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            body = response.read(4096).decode("utf-8", errors="replace")
            status_code = getattr(response, "status", 200)
    except urllib.error.URLError as exc:
        result = _persist_tool_record(repo_root=repo_root, payload=payload, tool_meta=tool_meta, recorded_at=recorded_at, request=request, status="failed", reason_code="network_fetch_failed", reason=str(exc), response={})
        return {"status": "failed", "reason_code": "network_fetch_failed", "record_path": result["record_rel"]}
    result = _persist_tool_record(
        repo_root=repo_root,
        payload=payload,
        tool_meta=tool_meta,
        recorded_at=recorded_at,
        request=request,
        status="completed",
        reason_code="tool_completed",
        reason="Praxis completed the brokered network fetch helper.",
        response={"status_code": status_code, "content_preview": _text_preview(body)},
    )
    return {"status": "completed", "status_code": status_code, "content": body, "record_path": result["record_rel"]}


def tool_usage_snapshot(*, repo_root: Path, dispatch_id: str | None = None, limit: int = 8) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    tools_root = repo_root / ".praxis" / "runtime" / "tools"
    if not tools_root.exists():
        return {"count": 0, "denied_count": 0, "failed_count": 0, "latest": None, "items": []}
    paths = sorted(tools_root.rglob("*.json"))
    items: list[dict[str, Any]] = []
    for path in paths:
        record = load_json(path)
        validate_contract_payload("tool-record.schema.json", record)
        if dispatch_id is not None and record.get("dispatch_id") != dispatch_id:
            continue
        items.append(
            {
                "record_path": str(path.relative_to(repo_root)),
                "recorded_at": record["recorded_at"],
                "dispatch_id": record["dispatch_id"],
                "worker_id": record["worker"]["worker_id"],
                "tool_id": record["tool"]["tool_id"],
                "status": record["outcome"]["status"],
                "reason_code": record["outcome"]["reason_code"],
                "reason": record["outcome"]["reason"],
            }
        )
    return {
        "count": len(items),
        "denied_count": sum(1 for item in items if item["status"] == "denied"),
        "failed_count": sum(1 for item in items if item["status"] == "failed"),
        "latest": items[-1] if items else None,
        "items": items[-limit:],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Praxis runtime tool broker.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    read_parser = subparsers.add_parser("repo-read")
    read_parser.add_argument("--repo-root", default=".")
    read_parser.add_argument("--worker-id", required=True)
    read_parser.add_argument("--path", required=True)
    read_parser.add_argument("--timestamp")

    search_parser = subparsers.add_parser("repo-search")
    search_parser.add_argument("--repo-root", default=".")
    search_parser.add_argument("--worker-id", required=True)
    search_parser.add_argument("--pattern", required=True)
    search_parser.add_argument("--search-root", default=".")
    search_parser.add_argument("--timestamp")

    shell_parser = subparsers.add_parser("repo-shell")
    shell_parser.add_argument("--repo-root", default=".")
    shell_parser.add_argument("--worker-id", required=True)
    shell_parser.add_argument("--write-path", action="append", default=[])
    shell_parser.add_argument("--timestamp")
    shell_parser.add_argument("command", nargs=argparse.REMAINDER)

    patch_parser = subparsers.add_parser("repo-patch")
    patch_parser.add_argument("--repo-root", default=".")
    patch_parser.add_argument("--worker-id", required=True)
    patch_parser.add_argument("--write-path", action="append", default=[])
    patch_parser.add_argument("--patch-path", required=True)
    patch_parser.add_argument("--timestamp")

    fetch_parser = subparsers.add_parser("network-fetch")
    fetch_parser.add_argument("--repo-root", default=".")
    fetch_parser.add_argument("--worker-id", required=True)
    fetch_parser.add_argument("--url", required=True)
    fetch_parser.add_argument("--timestamp")

    summary_parser = subparsers.add_parser("summary")
    summary_parser.add_argument("--repo-root", default=".")
    summary_parser.add_argument("--dispatch-id")

    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    if args.command == "repo-read":
        result = invoke_repo_read(repo_root=repo_root, worker_id=args.worker_id, path=args.path, timestamp=args.timestamp)
    elif args.command == "repo-search":
        result = invoke_repo_search(repo_root=repo_root, worker_id=args.worker_id, pattern=args.pattern, search_root=args.search_root, timestamp=args.timestamp)
    elif args.command == "repo-shell":
        command_tokens = list(args.command)
        if command_tokens and command_tokens[0] == "--":
            command_tokens = command_tokens[1:]
        result = invoke_repo_shell(repo_root=repo_root, worker_id=args.worker_id, argv=command_tokens, write_paths=args.write_path, timestamp=args.timestamp)
    elif args.command == "repo-patch":
        patch_text = Path(args.patch_path).read_text()
        result = invoke_repo_patch(repo_root=repo_root, worker_id=args.worker_id, patch_text=patch_text, write_paths=args.write_path, timestamp=args.timestamp)
    elif args.command == "network-fetch":
        result = invoke_network_fetch(repo_root=repo_root, worker_id=args.worker_id, url=args.url, timestamp=args.timestamp)
    else:
        result = tool_usage_snapshot(repo_root=repo_root, dispatch_id=args.dispatch_id)
    print(_json_preview(result, limit=100000))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
