from __future__ import annotations

import argparse
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..adapters.native_resume import worker_record_relpath
from ..state.durable_state import commit_transaction, dump_events, dump_json, extend_event_log, load_json


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _payload_path(*, repo_root: Path) -> Path:
    raw = os.environ.get("PRAXIS_WORKER_PAYLOAD_PATH")
    if not raw:
        raise ValueError("Praxis worker launcher requires PRAXIS_WORKER_PAYLOAD_PATH.")
    path = Path(raw)
    if not path.is_absolute():
        path = repo_root / path
    return path.resolve()


def _logs_dir(repo_root: Path) -> Path:
    path = repo_root / ".praxis" / "runtime" / "logs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _provider_command(*, payload: dict[str, Any], payload_relpath: str) -> tuple[list[str], str]:
    prompt = _worker_prompt(payload=payload, payload_relpath=payload_relpath)
    adapter = payload["adapter"]
    if adapter == "codex":
        return ["codex", "exec", "--full-auto", prompt], "codex_exec"
    if adapter == "claude":
        return [
            "claude",
            "-p",
            "--permission-mode",
            "dontAsk",
            "--agent",
            "praxis-story-worker",
            prompt,
        ], "claude_print"
    raise ValueError(f"Unsupported adapter: {adapter!r}.")


def _worker_prompt(*, payload: dict[str, Any], payload_relpath: str) -> str:
    dispatch = payload["dispatch"]
    lines = [
        "You are the Praxis worker for one bounded stage dispatch.",
        f"Load the launch payload from `{payload_relpath}`.",
        "Work only on the current dispatch and the declared artifact inputs.",
        "Treat `inputs.boundary_handoff` as the only cross-story carry-forward context.",
        f"Current stage: {dispatch['stage']}",
        f"Artifact directory: {dispatch['artifact_dir']}",
        f"Stage result path: {dispatch['stage_result_path']}",
        "Write every required output listed in `artifact_outputs_expected`.",
        "If the bounded context is insufficient, write a stage result that routes back for user input instead of guessing.",
    ]
    return "\n".join(lines)


def _trace_text(*, trace_path: Path, event: dict[str, Any]) -> str:
    existing = trace_path.read_text() if trace_path.exists() else ""
    return existing + json.dumps(event) + "\n"


def _commit_worker_event(
    *,
    repo_root: Path,
    payload: dict[str, Any],
    worker_status: str | None,
    event: dict[str, Any],
    trace_event: dict[str, Any],
) -> None:
    events = extend_event_log(repo_root, [event])
    files = {
        ".praxis/events.jsonl": dump_events(events),
    }
    worker_path = repo_root / worker_record_relpath(payload["worker"]["worker_id"])
    if worker_path.exists():
        worker_record = load_json(worker_path)
        if worker_status is not None:
            worker_record["status"] = worker_status
        files[str(worker_path.relative_to(repo_root))] = dump_json(worker_record)

    trace_path = repo_root / payload["resume"]["trace_path"]
    files[payload["resume"]["trace_path"]] = _trace_text(trace_path=trace_path, event=trace_event)
    commit_transaction(
        repo_root=repo_root,
        operation=f"worker_launcher_{event['type']}",
        files=files,
        timestamp=event["ts"],
        metadata={"worker_id": payload["worker"]["worker_id"]},
    )


def launch_worker(*, repo_root: Path) -> int:
    repo_root = repo_root.resolve()
    payload_path = _payload_path(repo_root=repo_root)
    payload = load_json(payload_path)
    payload_relpath = str(payload_path.relative_to(repo_root))
    command, launch_surface = _provider_command(payload=payload, payload_relpath=payload_relpath)
    logs_dir = _logs_dir(repo_root)
    stdout_path = logs_dir / f"{payload['worker']['worker_id']}.stdout.log"
    stderr_path = logs_dir / f"{payload['worker']['worker_id']}.stderr.log"
    ts = _utc_now()

    started_event = {
        "ts": ts,
        "type": "worker_process_started",
        "adapter": payload["adapter"],
        "scope": payload["dispatch"]["scope"],
        "slice_id": payload["dispatch"]["slice_id"],
        "artifact_dir": payload["dispatch"]["artifact_dir"],
        "stage": payload["dispatch"]["stage"],
        "boundary_handoff_path": payload["dispatch"]["boundary_handoff_path"],
        "worker_id": payload["worker"]["worker_id"],
        "launch_surface": launch_surface,
        "reason_code": "worker_process_started",
        "reason": "Background worker launcher started the provider task.",
    }
    _commit_worker_event(
        repo_root=repo_root,
        payload=payload,
        worker_status="running",
        event=started_event,
        trace_event={
            "ts": ts,
            "type": "worker_process_started",
            "worker_id": payload["worker"]["worker_id"],
            "launch_surface": launch_surface,
        },
    )

    with stdout_path.open("a", encoding="utf-8") as stdout_handle, stderr_path.open("a", encoding="utf-8") as stderr_handle:
        try:
            completed = subprocess.run(
                command,
                cwd=Path.cwd(),
                env=os.environ.copy(),
                stdin=subprocess.DEVNULL,
                stdout=stdout_handle,
                stderr=stderr_handle,
                check=False,
            )
        except FileNotFoundError as exc:
            failed_at = _utc_now()
            _commit_worker_event(
                repo_root=repo_root,
                payload=payload,
                worker_status="failed",
                event={
                    "ts": failed_at,
                    "type": "worker_process_failed",
                    "adapter": payload["adapter"],
                    "scope": payload["dispatch"]["scope"],
                    "slice_id": payload["dispatch"]["slice_id"],
                    "artifact_dir": payload["dispatch"]["artifact_dir"],
                    "stage": payload["dispatch"]["stage"],
                    "boundary_handoff_path": payload["dispatch"]["boundary_handoff_path"],
                    "worker_id": payload["worker"]["worker_id"],
                    "launch_surface": launch_surface,
                    "reason_code": "worker_process_failed",
                    "reason": str(exc),
                },
                trace_event={
                    "ts": failed_at,
                    "type": "worker_process_failed",
                    "worker_id": payload["worker"]["worker_id"],
                    "launch_surface": launch_surface,
                    "reason": str(exc),
                },
            )
            return 127

    finished_at = _utc_now()
    if completed.returncode != 0:
        _commit_worker_event(
            repo_root=repo_root,
            payload=payload,
            worker_status="failed",
            event={
                "ts": finished_at,
                "type": "worker_process_failed",
                "adapter": payload["adapter"],
                "scope": payload["dispatch"]["scope"],
                "slice_id": payload["dispatch"]["slice_id"],
                "artifact_dir": payload["dispatch"]["artifact_dir"],
                "stage": payload["dispatch"]["stage"],
                "boundary_handoff_path": payload["dispatch"]["boundary_handoff_path"],
                "worker_id": payload["worker"]["worker_id"],
                "launch_surface": launch_surface,
                "reason_code": "worker_process_failed",
                "reason": f"Worker provider command exited with code {completed.returncode}.",
            },
            trace_event={
                "ts": finished_at,
                "type": "worker_process_failed",
                "worker_id": payload["worker"]["worker_id"],
                "launch_surface": launch_surface,
                "returncode": completed.returncode,
            },
        )
        return completed.returncode

    _commit_worker_event(
        repo_root=repo_root,
        payload=payload,
        worker_status="completed",
        event={
            "ts": finished_at,
            "type": "worker_process_completed",
            "adapter": payload["adapter"],
            "scope": payload["dispatch"]["scope"],
            "slice_id": payload["dispatch"]["slice_id"],
            "artifact_dir": payload["dispatch"]["artifact_dir"],
            "stage": payload["dispatch"]["stage"],
            "boundary_handoff_path": payload["dispatch"]["boundary_handoff_path"],
            "worker_id": payload["worker"]["worker_id"],
            "launch_surface": launch_surface,
            "reason_code": "worker_process_completed",
            "reason": "Background worker process completed.",
        },
        trace_event={
            "ts": finished_at,
            "type": "worker_process_completed",
            "worker_id": payload["worker"]["worker_id"],
            "launch_surface": launch_surface,
        },
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Launch a bounded Praxis background worker.")
    parser.add_argument("--repo-root", default=".")
    args = parser.parse_args(argv)
    return launch_worker(repo_root=Path(args.repo_root))


if __name__ == "__main__":
    raise SystemExit(main())
