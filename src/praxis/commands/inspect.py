from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from praxis.cli.exit_codes import INVALID_INPUT_EXIT, CliContractError
from praxis.commands._support import build_run_snapshot
from praxis.runtime.adapters.native_resume import session_record_relpath
from praxis.runtime.state.contract_validation import ContractValidationError, validate_contract_payload
from praxis.runtime.state.durable_state import load_events, load_json
from praxis.runtime.workers.bookkeeping import resolve_worker_record_relpath


def handle(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    inspect_command = getattr(args, "inspect_command", None)
    if inspect_command in {None, "run"}:
        return _handle_run(args=args, repo_root=repo_root, timestamp=timestamp)
    if inspect_command == "worker":
        return _handle_worker(args=args, repo_root=repo_root, timestamp=timestamp)
    if inspect_command == "session":
        return _handle_session(args=args, repo_root=repo_root, timestamp=timestamp)
    if inspect_command == "watch":
        return _handle_watch(args=args, repo_root=repo_root, timestamp=timestamp)
    if inspect_command == "logs":
        return _handle_logs(args=args, repo_root=repo_root)
    if inspect_command == "trace":
        return _handle_trace(args=args, repo_root=repo_root)
    if inspect_command == "events":
        return _handle_events(args=args, repo_root=repo_root)
    raise CliContractError(
        code="invalid_argument",
        message=f"Unsupported Praxis inspect subcommand: {inspect_command!r}.",
        exit_code=INVALID_INPUT_EXIT,
    )


def _handle_run(*, args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    snapshot = build_run_snapshot(repo_root)
    requested_run_id = getattr(args, "run_id", None)
    if requested_run_id and requested_run_id != snapshot["run_id"]:
        raise CliContractError(
            code="unsupported_argument",
            message="Praxis inspect can only read the active run in v1.",
            exit_code=INVALID_INPUT_EXIT,
            details={"run_id": requested_run_id},
        )

    inspect_payload = _build_run_inspect_payload(repo_root=repo_root, snapshot=snapshot)
    return {
        "run": snapshot,
        "inspect": inspect_payload,
        "__human_output__": _render_run_inspect(snapshot=snapshot, inspect_payload=inspect_payload, now_ts=timestamp),
    }


def _handle_worker(*, args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    worker_id = getattr(args, "worker_id", None)
    if worker_id is None:
        snapshot = build_run_snapshot(repo_root)
        worker_id = snapshot["current"]["worker_id"]
        if worker_id is None:
            raise CliContractError(
                code="missing_required_artifact",
                message="Praxis could not resolve an active worker to inspect.",
                exit_code=INVALID_INPUT_EXIT,
            )
    payload = _build_worker_inspect_payload(repo_root=repo_root, worker_id=worker_id)
    return {
        **payload,
        "__human_output__": _render_worker_inspect(payload=payload, now_ts=timestamp),
    }


def _handle_session(*, args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    session_id = getattr(args, "session_id", None)
    if session_id is None:
        snapshot = build_run_snapshot(repo_root)
        session_id = snapshot["current"]["session_id"]
        if session_id is None:
            raise CliContractError(
                code="missing_required_artifact",
                message="Praxis could not resolve an active session to inspect.",
                exit_code=INVALID_INPUT_EXIT,
            )
    payload = _build_session_inspect_payload(repo_root=repo_root, session_id=session_id)
    return {
        **payload,
        "__human_output__": _render_session_inspect(payload=payload, now_ts=timestamp),
    }


def _handle_watch(*, args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    del timestamp
    if getattr(args, "json", False):
        raise CliContractError(
            code="invalid_argument",
            message="Praxis inspect watch does not support --json in v1.",
            exit_code=INVALID_INPUT_EXIT,
        )
    interval = float(getattr(args, "interval", 2.0))
    if interval <= 0:
        raise CliContractError(
            code="invalid_argument",
            message="--interval must be greater than 0.",
            exit_code=INVALID_INPUT_EXIT,
        )
    once = bool(getattr(args, "once", False))
    tty = sys.stdout.isatty()
    last_rendered: str | None = None
    try:
        while True:
            now_ts = _utc_now()
            snapshot = build_run_snapshot(repo_root)
            rendered = _render_watch_snapshot(repo_root=repo_root, snapshot=snapshot, now_ts=now_ts)
            if tty:
                sys.stdout.write("\x1b[2J\x1b[H")
                sys.stdout.write(rendered)
                sys.stdout.flush()
            elif rendered != last_rendered:
                if last_rendered is not None:
                    sys.stdout.write("\n")
                sys.stdout.write(rendered)
                sys.stdout.flush()
            last_rendered = rendered
            if once:
                break
            time.sleep(interval)
    except KeyboardInterrupt:
        pass
    return {"__suppress_human_output__": True}


def _handle_logs(*, args: argparse.Namespace, repo_root: Path) -> dict[str, Any]:
    _validate_tail(getattr(args, "tail", 50))
    if getattr(args, "json", False) and getattr(args, "follow", False):
        raise CliContractError(
            code="invalid_argument",
            message="Praxis inspect logs does not support --json with --follow.",
            exit_code=INVALID_INPUT_EXIT,
        )

    worker_id = getattr(args, "worker_id", None) or _resolve_active_worker_id(repo_root)
    stream = getattr(args, "stream", "both")
    logs = _build_logs_payload(repo_root=repo_root, worker_id=worker_id, tail=int(getattr(args, "tail", 50)), stream=stream)

    if getattr(args, "path_only", False):
        lines = [stream_payload["path"] for stream_payload in logs["streams"]]
        return {
            **logs,
            "__human_output__": "".join(f"{line}\n" for line in lines),
        }

    if getattr(args, "follow", False):
        _stream_logs_follow(repo_root=repo_root, logs=logs, stream=stream)
        return {"__suppress_human_output__": True}

    return {
        **logs,
        "__human_output__": _render_logs(logs=logs, stream=stream),
    }


def _handle_trace(*, args: argparse.Namespace, repo_root: Path) -> dict[str, Any]:
    _validate_tail(getattr(args, "tail", 50))
    if getattr(args, "json", False) and getattr(args, "follow", False):
        raise CliContractError(
            code="invalid_argument",
            message="Praxis inspect trace does not support --json with --follow.",
            exit_code=INVALID_INPUT_EXIT,
        )

    worker_id = getattr(args, "worker_id", None) or _resolve_active_worker_id(repo_root)
    payload = _build_trace_payload(
        repo_root=repo_root,
        worker_id=worker_id,
        tail=int(getattr(args, "tail", 50)),
        event_type=getattr(args, "event_type", None),
        reason_code=getattr(args, "reason_code", None),
    )
    if getattr(args, "follow", False):
        _stream_jsonl_follow(
            repo_root=repo_root,
            rel_path=payload["trace_path"],
            initial_events=payload["events"],
            formatter=lambda event: _format_trace_event(event, raw=bool(getattr(args, "raw", False))),
            predicate=lambda event: _trace_event_matches(
                event,
                event_type=getattr(args, "event_type", None),
                reason_code=getattr(args, "reason_code", None),
            ),
        )
        return {"__suppress_human_output__": True}

    if getattr(args, "json", False):
        return payload
    return {
        **payload,
        "__human_output__": _render_trace_events(payload["events"], raw=bool(getattr(args, "raw", False))),
    }


def _handle_events(*, args: argparse.Namespace, repo_root: Path) -> dict[str, Any]:
    _validate_tail(getattr(args, "tail", 50))
    if getattr(args, "json", False) and getattr(args, "follow", False):
        raise CliContractError(
            code="invalid_argument",
            message="Praxis inspect events does not support --json with --follow.",
            exit_code=INVALID_INPUT_EXIT,
        )

    payload = _build_events_payload(
        repo_root=repo_root,
        tail=int(getattr(args, "tail", 50)),
        event_type=getattr(args, "event_type", None),
        stage=getattr(args, "stage", None),
        slice_id=getattr(args, "slice_id", None),
    )
    if getattr(args, "follow", False):
        _stream_jsonl_follow(
            repo_root=repo_root,
            rel_path=payload["events_path"],
            initial_events=payload["events"],
            formatter=lambda event: _format_lifecycle_event(event, raw=bool(getattr(args, "raw", False))),
            predicate=lambda event: _lifecycle_event_matches(
                event,
                event_type=getattr(args, "event_type", None),
                stage=getattr(args, "stage", None),
                slice_id=getattr(args, "slice_id", None),
            ),
        )
        return {"__suppress_human_output__": True}

    if getattr(args, "json", False):
        return payload
    return {
        **payload,
        "__human_output__": _render_lifecycle_events(payload["events"], raw=bool(getattr(args, "raw", False))),
    }


def _build_run_inspect_payload(*, repo_root: Path, snapshot: dict[str, Any]) -> dict[str, Any]:
    worker_id = snapshot["current"]["worker_id"]
    session_id = snapshot["current"]["session_id"]
    trace_path = snapshot.get("active_runtime", {}).get("trace_stream", {}).get("path")
    log_paths = _log_paths_for_worker(worker_id) if worker_id else {"stdout_path": None, "stderr_path": None}
    adapter = _active_adapter(repo_root)
    suggestions = ["praxis inspect watch"]
    if worker_id:
        suggestions.append("praxis inspect logs --follow")
        suggestions.append("praxis inspect trace --follow")

    return {
        "adapter": adapter,
        "worker_id": worker_id,
        "session_id": session_id,
        "artifact_dir": snapshot["current"]["artifact_dir"],
        "dispatch_bundle_path": snapshot.get("dispatch_bundle", {}).get("bundle_dir"),
        "stdout_path": log_paths["stdout_path"],
        "stderr_path": log_paths["stderr_path"],
        "trace_path": trace_path,
        "suggested_commands": suggestions,
        "last_trace_event_type": snapshot.get("active_runtime", {}).get("trace_stream", {}).get("last_event_type"),
        "last_trace_reason_code": snapshot.get("active_runtime", {}).get("trace_stream", {}).get("last_event_reason_code"),
        "last_launch_event_type": (snapshot.get("trace", {}).get("last_launch_event") or {}).get("type"),
        "last_resume_event_type": (snapshot.get("trace", {}).get("last_resume_event") or {}).get("type"),
        "last_stop_event_type": (snapshot.get("trace", {}).get("last_stop_event") or {}).get("type"),
        "paths": {
            "dispatch_bundle_dir": snapshot.get("dispatch_bundle", {}).get("bundle_dir"),
            "stdout_log": log_paths["stdout_path"],
            "stderr_log": log_paths["stderr_path"],
            "trace_stream": trace_path,
            "artifact_dir": snapshot["current"]["artifact_dir"],
        },
    }


def _build_worker_inspect_payload(*, repo_root: Path, worker_id: str) -> dict[str, Any]:
    worker_rel = resolve_worker_record_relpath(repo_root=repo_root, worker_id=worker_id)
    if worker_rel is None:
        raise CliContractError(
            code="missing_required_artifact",
            message=f"Praxis could not find a worker record for `{worker_id}`.",
            exit_code=INVALID_INPUT_EXIT,
            details={"worker_id": worker_id},
        )

    worker_record = _load_record(repo_root=repo_root, rel_path=worker_rel, contract_name="worker-record.schema.json")
    session = _load_session_by_id(repo_root=repo_root, session_id=worker_record.get("session_id"))
    launch = _load_record_if_present(
        repo_root=repo_root,
        rel_path=worker_record.get("launch_record_path"),
        contract_name="native-launch.schema.json",
    )
    resume = _find_latest_resume_for_worker(repo_root=repo_root, worker_id=worker_id)
    trace = _build_trace_payload(
        repo_root=repo_root,
        worker_id=worker_id,
        tail=10,
        event_type=None,
        reason_code=None,
        allow_missing=True,
    )
    logs = _build_logs_payload(repo_root=repo_root, worker_id=worker_id, tail=10, stream="both", allow_missing=True)
    last_event = _find_last_lifecycle_event(repo_root=repo_root, worker_id=worker_id)

    return {
        "worker": {"path": worker_rel, "record": worker_record},
        "session": session,
        "launch": launch,
        "resume": resume,
        "trace": trace,
        "logs": logs,
        "last_lifecycle_event": last_event,
    }


def _build_session_inspect_payload(*, repo_root: Path, session_id: str) -> dict[str, Any]:
    session = _load_session_by_id(repo_root=repo_root, session_id=session_id)
    if session is None:
        raise CliContractError(
            code="missing_required_artifact",
            message=f"Praxis could not find a session record for `{session_id}`.",
            exit_code=INVALID_INPUT_EXIT,
            details={"session_id": session_id},
        )
    session_record = session["record"]
    linked_worker = None
    worker_id = session_record.get("worker_id")
    if isinstance(worker_id, str) and worker_id:
        try:
            linked_worker = _build_worker_inspect_payload(repo_root=repo_root, worker_id=worker_id)
        except CliContractError:
            linked_worker = None

    linked_launch = None
    if linked_worker is not None:
        linked_launch = linked_worker.get("launch")
    linked_resume = _find_latest_resume_for_session(repo_root=repo_root, session_id=session_id)
    return {
        "session": session,
        "linked_worker": linked_worker,
        "linked_launch": linked_launch,
        "linked_resume": linked_resume,
    }


def _build_logs_payload(
    *,
    repo_root: Path,
    worker_id: str,
    tail: int,
    stream: str,
    allow_missing: bool = False,
) -> dict[str, Any]:
    logs_dir = repo_root / ".praxis" / "runtime" / "logs"
    stdout_path = logs_dir / f"{worker_id}.stdout.log"
    stderr_path = logs_dir / f"{worker_id}.stderr.log"
    streams: list[dict[str, Any]] = []
    for name, path in (("stdout", stdout_path), ("stderr", stderr_path)):
        if stream != "both" and stream != name:
            continue
        if not path.exists():
            if allow_missing:
                streams.append({"stream": name, "path": str(path.relative_to(repo_root)), "lines": [], "exists": False})
                continue
            raise CliContractError(
                code="missing_required_artifact",
                message=f"Praxis could not find the {name} log for `{worker_id}`.",
                exit_code=INVALID_INPUT_EXIT,
                details={"worker_id": worker_id, "stream": name, "path": str(path)},
            )
        streams.append(
            {
                "stream": name,
                "path": str(path.relative_to(repo_root)),
                "lines": _tail_lines(path, tail),
                "exists": True,
            }
        )
    return {
        "worker_id": worker_id,
        "stdout_path": str(stdout_path.relative_to(repo_root)),
        "stderr_path": str(stderr_path.relative_to(repo_root)),
        "streams": streams,
    }


def _build_trace_payload(
    *,
    repo_root: Path,
    worker_id: str,
    tail: int,
    event_type: str | None,
    reason_code: str | None,
    allow_missing: bool = False,
) -> dict[str, Any]:
    worker_rel = resolve_worker_record_relpath(repo_root=repo_root, worker_id=worker_id)
    trace_rel = None
    if worker_rel is not None:
        worker_record = _load_record(repo_root=repo_root, rel_path=worker_rel, contract_name="worker-record.schema.json")
        trace_rel = worker_record.get("trace_path")
    if not isinstance(trace_rel, str) or not trace_rel:
        trace_rel = f".praxis/runtime/traces/{worker_id}.jsonl"
    trace_path = repo_root / trace_rel
    if not trace_path.exists():
        if allow_missing:
            return {"worker_id": worker_id, "trace_path": trace_rel, "event_count": 0, "events": []}
        raise CliContractError(
            code="missing_required_artifact",
            message=f"Praxis could not find the trace stream for `{worker_id}`.",
            exit_code=INVALID_INPUT_EXIT,
            details={"worker_id": worker_id, "trace_path": trace_rel},
        )
    events = [event for event in load_events(trace_path) if _trace_event_matches(event, event_type=event_type, reason_code=reason_code)]
    return {
        "worker_id": worker_id,
        "trace_path": trace_rel,
        "event_count": len(events),
        "events": events[-tail:] if tail >= 0 else events,
    }


def _build_events_payload(
    *,
    repo_root: Path,
    tail: int,
    event_type: str | None,
    stage: str | None,
    slice_id: str | None,
) -> dict[str, Any]:
    events_rel = ".praxis/events.jsonl"
    events_path = repo_root / events_rel
    if not events_path.exists():
        raise CliContractError(
            code="missing_required_artifact",
            message="Praxis could not find the lifecycle event log.",
            exit_code=INVALID_INPUT_EXIT,
            details={"path": str(events_path)},
        )
    events = [
        event
        for event in load_events(events_path)
        if _lifecycle_event_matches(event, event_type=event_type, stage=stage, slice_id=slice_id)
    ]
    return {
        "events_path": events_rel,
        "event_count": len(events),
        "events": events[-tail:] if tail >= 0 else events,
    }


def _load_record(*, repo_root: Path, rel_path: str, contract_name: str) -> dict[str, Any]:
    payload = load_json(repo_root / rel_path)
    validate_contract_payload(contract_name, payload)
    return payload


def _load_record_if_present(*, repo_root: Path, rel_path: str | None, contract_name: str) -> dict[str, Any] | None:
    if not isinstance(rel_path, str) or not rel_path:
        return None
    path = repo_root / rel_path
    if not path.exists():
        return None
    return {"path": rel_path, "record": _load_record(repo_root=repo_root, rel_path=rel_path, contract_name=contract_name)}


def _load_session_by_id(*, repo_root: Path, session_id: str | None) -> dict[str, Any] | None:
    if not isinstance(session_id, str) or not session_id:
        return None
    for adapter in ("codex", "claude"):
        rel_path = session_record_relpath(adapter, session_id)
        path = repo_root / rel_path
        if not path.exists():
            continue
        return {
            "path": rel_path,
            "record": _load_record(repo_root=repo_root, rel_path=rel_path, contract_name="session-record.schema.json"),
        }
    sessions_root = repo_root / ".praxis" / "runtime" / "sessions"
    if not sessions_root.exists():
        return None
    for candidate in sorted(sessions_root.glob("*/*.json")):
        payload = load_json(candidate)
        if payload.get("session_id") != session_id:
            continue
        try:
            validate_contract_payload("session-record.schema.json", payload)
        except ContractValidationError:
            continue
        return {
            "path": str(candidate.relative_to(repo_root)),
            "record": payload,
        }
    return None


def _find_latest_resume_for_worker(*, repo_root: Path, worker_id: str) -> dict[str, Any] | None:
    latest: tuple[str, str, dict[str, Any]] | None = None
    resumes_root = repo_root / ".praxis" / "runtime" / "resumes"
    if not resumes_root.exists():
        return None
    for path in sorted(resumes_root.glob("*/*.json")):
        payload = load_json(path)
        if payload.get("worker_id") != worker_id:
            continue
        try:
            validate_contract_payload("native-resume.schema.json", payload)
        except ContractValidationError:
            continue
        recorded_at = str(payload.get("recorded_at") or "")
        if latest is None or recorded_at > latest[0]:
            latest = (recorded_at, str(path.relative_to(repo_root)), payload)
    if latest is None:
        return None
    return {"path": latest[1], "record": latest[2]}


def _find_latest_resume_for_session(*, repo_root: Path, session_id: str) -> dict[str, Any] | None:
    latest: tuple[str, str, dict[str, Any]] | None = None
    resumes_root = repo_root / ".praxis" / "runtime" / "resumes"
    if not resumes_root.exists():
        return None
    for path in sorted(resumes_root.glob("*/*.json")):
        payload = load_json(path)
        if session_id not in {
            payload.get("requested_session_id"),
            payload.get("resolved_session_id"),
            payload.get("session_id"),
        }:
            continue
        try:
            validate_contract_payload("native-resume.schema.json", payload)
        except ContractValidationError:
            continue
        recorded_at = str(payload.get("recorded_at") or "")
        if latest is None or recorded_at > latest[0]:
            latest = (recorded_at, str(path.relative_to(repo_root)), payload)
    if latest is None:
        return None
    return {"path": latest[1], "record": latest[2]}


def _find_last_lifecycle_event(*, repo_root: Path, worker_id: str) -> dict[str, Any] | None:
    events_path = repo_root / ".praxis" / "events.jsonl"
    for event in reversed(load_events(events_path)):
        if event.get("worker_id") == worker_id:
            return event
    return None


def _last_lifecycle_event(*, repo_root: Path) -> dict[str, Any] | None:
    events_path = repo_root / ".praxis" / "events.jsonl"
    events = load_events(events_path)
    return events[-1] if events else None


def _resolve_active_worker_id(repo_root: Path) -> str:
    snapshot = build_run_snapshot(repo_root)
    worker_id = snapshot["current"]["worker_id"]
    if worker_id is None:
        raise CliContractError(
            code="missing_required_artifact",
            message="Praxis could not resolve an active worker to inspect.",
            exit_code=INVALID_INPUT_EXIT,
        )
    return worker_id


def _render_run_inspect(*, snapshot: dict[str, Any], inspect_payload: dict[str, Any], now_ts: str) -> str:
    current = snapshot["current"]
    routing = snapshot["routing"]
    trace = snapshot["trace"]
    active_trace = snapshot["active_runtime"]["trace_stream"]
    lines = [
        f"Run        {snapshot['run_id']}",
        f"Status     {snapshot['run_status']}",
        f"Workflow   {snapshot['workflow']} / {snapshot['execution_mode']}",
        f"Adapter    {inspect_payload.get('adapter') or '-'}",
        "",
        "Current",
        f"  Scope    {current['scope'] or '-'}",
        f"  Stage    {current['stage'] or '-'}",
        f"  Slice    {current['slice_id'] or '-'}",
        f"  Worker   {_display_worker(current['worker_id'], snapshot['active_runtime']['worker_record'].get('status'))}",
        f"  Session  {current['session_id'] or '-'}",
        f"  Result   {current['artifact_dir'] or '-'}",
        "",
        "Progress",
        f"  Last trace    {_render_signal(active_trace.get('last_event_type'), active_trace.get('last_event_recorded_at'), now_ts)}",
        f"  Last launch   {_render_signal((trace.get('last_launch_event') or {}).get('type'), (trace.get('last_launch_event') or {}).get('ts'), now_ts)}",
        f"  Last resume   {_render_signal((trace.get('last_resume_event') or {}).get('type'), (trace.get('last_resume_event') or {}).get('ts'), now_ts)}",
        f"  Last stop     {_render_signal((trace.get('last_stop_event') or {}).get('type'), (trace.get('last_stop_event') or {}).get('ts'), now_ts)}",
        f"  Next action   {routing['next_action'] or '-'}",
    ]
    if routing.get("stop_reason_code"):
        lines.append(f"  Stop reason   {routing['stop_reason_code']}")
    lines.extend(
        [
            "",
            "Output",
            f"  Stdout   {inspect_payload['stdout_path'] or '-'}",
            f"  Stderr   {inspect_payload['stderr_path'] or '-'}",
            f"  Trace    {inspect_payload['trace_path'] or '-'}",
        ]
    )
    if inspect_payload.get("dispatch_bundle_path"):
        lines.append(f"  Bundle   {inspect_payload['dispatch_bundle_path']}")
    lines.extend(["", "Try"])
    for command in inspect_payload["suggested_commands"]:
        lines.append(f"  {command}")
    return "\n".join(lines) + "\n"


def _render_worker_inspect(*, payload: dict[str, Any], now_ts: str) -> str:
    worker = payload["worker"]["record"]
    session = (payload.get("session") or {}).get("record") or {}
    trace_events = payload.get("trace", {}).get("events") or []
    last_trace = trace_events[-1] if trace_events else None
    last_event = payload.get("last_lifecycle_event") or {}
    lines = [
        f"Worker      {worker['worker_id']}",
        f"Status      {worker.get('status') or '-'}",
        f"Class       {worker.get('worker_class') or '-'}",
        f"Profile     {worker.get('permission_profile') or '-'}",
        f"Worktree    {worker.get('worktree_mode') or '-'}",
        "",
        "Links",
        f"  Worker    {payload['worker']['path']}",
        f"  Session   {_maybe_path(payload.get('session'))}",
        f"  Launch    {_maybe_path(payload.get('launch'))}",
        f"  Resume    {_maybe_path(payload.get('resume'))}",
        f"  Trace     {payload.get('trace', {}).get('trace_path') or '-'}",
        "",
        "Runtime",
        f"  Session   {worker.get('session_id') or '-'}",
        f"  Worktree  {worker.get('worktree_path') or '-'}",
        f"  Channel   {worker.get('isolation', {}).get('runtime_state_channel') or worker.get('runtime_state_channel') or '-'}",
        f"  Resumable {session.get('resumable') if session else '-'}",
        "",
        "Output",
        f"  Stdout    {payload['logs']['stdout_path']}",
        f"  Stderr    {payload['logs']['stderr_path']}",
        "",
        "Recent",
        f"  Trace     {_render_signal((last_trace or {}).get('type'), (last_trace or {}).get('ts'), now_ts)}",
        f"  Event     {_render_signal(last_event.get('type'), last_event.get('ts'), now_ts)}",
    ]
    return "\n".join(lines) + "\n"


def _render_session_inspect(*, payload: dict[str, Any], now_ts: str) -> str:
    del now_ts
    session = payload["session"]["record"]
    linked_worker = payload.get("linked_worker")
    lines = [
        f"Session      {session['session_id']}",
        f"Worker       {session.get('worker_id') or '-'}",
        f"Resumable    {session.get('resumable')}",
        f"Reason code  {session.get('resumable_reason_code') or '-'}",
        f"Reason       {session.get('resumable_reason') or '-'}",
        f"Locator      {'present' if session.get('provider_locator') else 'missing'}",
        f"Stage        {session.get('current_stage') or '-'}",
        f"Slice        {session.get('current_slice_id') or '-'}",
        f"Worktree     {session.get('worktree_mode') or '-'}",
        f"Last resume  {session.get('last_resume_outcome') or '-'}",
        "",
        "Links",
        f"  Session    {payload['session']['path']}",
        f"  Worker     {_maybe_path((linked_worker or {}).get('worker'))}",
        f"  Launch     {_maybe_path(payload.get('linked_launch'))}",
        f"  Resume     {_maybe_path(payload.get('linked_resume'))}",
        "",
        "Note",
        "  Praxis exposes durable session state, logs, and traces, not provider transcripts.",
    ]
    return "\n".join(lines) + "\n"


def _render_watch_snapshot(*, repo_root: Path, snapshot: dict[str, Any], now_ts: str) -> str:
    worker_status = snapshot["active_runtime"]["worker_record"].get("status")
    session = snapshot["active_runtime"]["session_record"]
    last_trace = snapshot["active_runtime"]["trace_stream"]
    last_event = _last_lifecycle_event(repo_root=repo_root)
    latest_result = _latest_result_artifact(repo_root=repo_root, artifact_dir=snapshot["current"]["artifact_dir"])
    lines = [
        f"Run        {snapshot['run_id']}",
        f"Status     {snapshot['run_status']}",
        f"Stage      {snapshot['current']['stage'] or '-'}",
        f"Slice      {snapshot['current']['slice_id'] or '-'}",
        f"Worker     {_display_worker(snapshot['current']['worker_id'], worker_status)}",
        f"Session    {snapshot['current']['session_id'] or '-'}",
        f"Resumable  {session.get('resumable') if session.get('exists') else '-'}",
        "",
        "Signals",
        f"  Trace    {_render_signal(last_trace.get('last_event_type'), last_trace.get('last_event_recorded_at'), now_ts)}",
        f"  Event    {_render_signal((last_event or {}).get('type'), (last_event or {}).get('ts'), now_ts)}",
        "",
        "Artifacts",
        f"  Dir      {snapshot['current']['artifact_dir'] or '-'}",
        f"  Latest   {latest_result or '-'}",
        "",
        "Ctrl-C to stop. Try `praxis inspect logs --follow` or `praxis inspect trace --follow` for detail.",
    ]
    return "\n".join(lines) + "\n"


def _render_logs(*, logs: dict[str, Any], stream: str) -> str:
    del stream
    lines: list[str] = []
    for stream_payload in logs["streams"]:
        prefix = f"[{stream_payload['stream']}] "
        for line in stream_payload["lines"]:
            lines.append(f"{prefix}{line}")
    if not lines:
        return ""
    return "\n".join(lines) + "\n"


def _render_trace_events(events: list[dict[str, Any]], *, raw: bool) -> str:
    if raw:
        return "".join(json.dumps(event) + "\n" for event in events)
    return "".join(_format_trace_event(event, raw=False) for event in events)


def _render_lifecycle_events(events: list[dict[str, Any]], *, raw: bool) -> str:
    if raw:
        return "".join(json.dumps(event) + "\n" for event in events)
    return "".join(_format_lifecycle_event(event, raw=False) for event in events)


def _format_trace_event(event: dict[str, Any], *, raw: bool) -> str:
    if raw:
        return json.dumps(event) + "\n"
    details = []
    if event.get("reason_code"):
        details.append(f"reason={event['reason_code']}")
    if event.get("launch_surface"):
        details.append(f"launch_surface={event['launch_surface']}")
    return f"{event.get('ts', '-')}  {event.get('type', '-')}  {' '.join(details).strip()}\n".rstrip() + "\n"


def _format_lifecycle_event(event: dict[str, Any], *, raw: bool) -> str:
    if raw:
        return json.dumps(event) + "\n"
    details = []
    if event.get("scope"):
        details.append(f"scope={event['scope']}")
    if event.get("stage"):
        details.append(f"stage={event['stage']}")
    if event.get("slice_id"):
        details.append(f"slice={event['slice_id']}")
    if event.get("reason_code"):
        details.append(f"reason={event['reason_code']}")
    return f"{event.get('ts', '-')}  {event.get('type', '-')}  {' '.join(details).strip()}\n".rstrip() + "\n"


def _stream_logs_follow(*, repo_root: Path, logs: dict[str, Any], stream: str) -> None:
    entries = []
    for stream_payload in logs["streams"]:
        if stream != "both" and stream_payload["stream"] != stream:
            continue
        path = repo_root / stream_payload["path"]
        prefix = f"[{stream_payload['stream']}] "
        entries.append((path, prefix))
    for stream_payload in logs["streams"]:
        prefix = f"[{stream_payload['stream']}] "
        for line in stream_payload["lines"]:
            sys.stdout.write(f"{prefix}{line}\n")
    sys.stdout.flush()
    try:
        _follow_text_entries(
            entries,
            formatter=lambda prefix, line: f"{prefix}{line}\n",
        )
    except KeyboardInterrupt:
        return


def _stream_jsonl_follow(
    *,
    repo_root: Path,
    rel_path: str,
    initial_events: list[dict[str, Any]],
    formatter,
    predicate,
) -> None:
    path = repo_root / rel_path
    for event in initial_events:
        sys.stdout.write(formatter(event))
    sys.stdout.flush()
    try:
        _follow_text_entries(
            [(path, "")],
            formatter=lambda _prefix, line: _format_follow_json_line(line, formatter=formatter, predicate=predicate),
        )
    except KeyboardInterrupt:
        return


def _format_follow_json_line(line: str, *, formatter, predicate) -> str:
    if not line.strip():
        return ""
    event = json.loads(line)
    if not predicate(event):
        return ""
    return formatter(event)


def _follow_text_entries(entries: list[tuple[Path, str]], *, formatter) -> None:
    states: dict[Path, dict[str, Any]] = {}
    for path, _prefix in entries:
        offset = path.stat().st_size if path.exists() else 0
        states[path] = {"offset": offset, "buffer": ""}

    while True:
        emitted = False
        for path, prefix in entries:
            state = states[path]
            if not path.exists():
                continue
            with path.open("r", encoding="utf-8") as handle:
                handle.seek(state["offset"])
                chunk = handle.read()
                state["offset"] = handle.tell()
            if not chunk:
                continue
            text = state["buffer"] + chunk
            lines = text.splitlines(keepends=True)
            if lines and not lines[-1].endswith("\n"):
                state["buffer"] = lines.pop()
            else:
                state["buffer"] = ""
            for line in lines:
                rendered = formatter(prefix, line.rstrip("\n"))
                if rendered:
                    sys.stdout.write(rendered)
                    emitted = True
        if emitted:
            sys.stdout.flush()
        time.sleep(0.2)


def _trace_event_matches(event: dict[str, Any], *, event_type: str | None, reason_code: str | None) -> bool:
    if event_type is not None and event.get("type") != event_type:
        return False
    if reason_code is not None and event.get("reason_code") != reason_code:
        return False
    return True


def _lifecycle_event_matches(
    event: dict[str, Any],
    *,
    event_type: str | None,
    stage: str | None,
    slice_id: str | None,
) -> bool:
    if event_type is not None and event.get("type") != event_type:
        return False
    if stage is not None and event.get("stage") != stage:
        return False
    if slice_id is not None and event.get("slice_id") != slice_id:
        return False
    return True


def _tail_lines(path: Path, tail: int) -> list[str]:
    if tail < 0:
        raise CliContractError(
            code="invalid_argument",
            message="--tail must be 0 or greater.",
            exit_code=INVALID_INPUT_EXIT,
        )
    lines = path.read_text().splitlines()
    if tail == 0:
        return []
    return lines[-tail:]


def _validate_tail(tail: int) -> None:
    if int(tail) < 0:
        raise CliContractError(
            code="invalid_argument",
            message="--tail must be 0 or greater.",
            exit_code=INVALID_INPUT_EXIT,
        )


def _latest_result_artifact(*, repo_root: Path, artifact_dir: str | None) -> str | None:
    if not artifact_dir:
        return None
    results_dir = repo_root / artifact_dir / "results"
    if not results_dir.exists():
        return None
    candidates = sorted(results_dir.glob("*.json"), key=lambda path: path.stat().st_mtime)
    if not candidates:
        return None
    return str(candidates[-1].relative_to(repo_root))


def _render_signal(event_type: str | None, recorded_at: str | None, now_ts: str) -> str:
    if event_type is None:
        return "-"
    if recorded_at is None:
        return event_type
    return f"{event_type}   {_relative_age(recorded_at, now_ts)}"


def _relative_age(then_ts: str, now_ts: str) -> str:
    try:
        then = _parse_iso8601(then_ts)
        now = _parse_iso8601(now_ts)
    except ValueError:
        return then_ts
    delta = max(0, int((now - then).total_seconds()))
    if delta < 60:
        return f"{delta}s ago"
    if delta < 3600:
        return f"{delta // 60}m ago"
    return f"{delta // 3600}h ago"


def _parse_iso8601(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _log_paths_for_worker(worker_id: str) -> dict[str, str]:
    return {
        "stdout_path": f".praxis/runtime/logs/{worker_id}.stdout.log",
        "stderr_path": f".praxis/runtime/logs/{worker_id}.stderr.log",
    }


def _active_adapter(repo_root: Path) -> str | None:
    run_path = repo_root / ".praxis" / "run.json"
    if not run_path.exists():
        return None
    payload = load_json(run_path)
    adapter = payload.get("runtime", {}).get("adapter")
    return str(adapter) if isinstance(adapter, str) else None


def _display_worker(worker_id: str | None, status: str | None) -> str:
    if worker_id is None:
        return "-"
    if status:
        return f"{worker_id}  ({status})"
    return worker_id


def _maybe_path(payload: dict[str, Any] | None) -> str:
    if not isinstance(payload, dict):
        return "-"
    path = payload.get("path")
    return str(path) if path else "-"
