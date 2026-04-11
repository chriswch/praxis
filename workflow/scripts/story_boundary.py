from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def _load_events(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    lines = [line for line in path.read_text().splitlines() if line.strip()]
    return [json.loads(line) for line in lines]


def _append_event(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload) + "\n")


def _event_exists(events: list[dict[str, Any]], *, event_type: str, **fields: Any) -> bool:
    for event in events:
        if event.get("type") != event_type:
            continue
        if all(event.get(name) == value for name, value in fields.items()):
            return True
    return False


def _write_resume_stop(
    *,
    run_path: Path,
    ledger_path: Path,
    events_path: Path,
    run: dict[str, Any],
    ledger: dict[str, Any],
    status: str,
    active_story_id: str,
    reason_code: str,
    reason: str,
    timestamp: str,
) -> None:
    run["status"] = status
    run["routing"]["next_action"] = "ask_user"
    run["routing"]["next_stage"] = None
    run["routing"]["next_slice_id"] = None
    run["routing"]["stop_reason_code"] = reason_code
    run["routing"]["reason"] = reason
    run["routing"]["boundary_handoff_path"] = _handoff_path_for_story(ledger, active_story_id)
    run["slices"]["active"] = active_story_id
    run["timestamps"]["updated_at"] = timestamp
    ledger["timestamps"]["updated_at"] = timestamp

    _write_json(run_path, run)
    _write_json(ledger_path, ledger)
    _append_event(
        events_path,
        {
            "ts": timestamp,
            "type": "resume_blocked" if status == "waiting_for_user" else "resume_failed",
            "slice_id": active_story_id,
            "reason_code": reason_code,
            "reason": reason,
        },
    )


def _append_unique(items: list[str], value: str) -> None:
    if value not in items:
        items.append(value)


def _resolve_execution_mode(run: dict[str, Any], ledger: dict[str, Any]) -> str:
    run_mode = run.get("execution", {}).get("mode")
    ledger_mode = ledger.get("execution_mode")
    return run_mode or ledger_mode or "manual"


def _boundary_stop(reason_code: str) -> str:
    reasons = {
        "dirty_worktree": "Dirty product worktree blocks story boundary.",
        "missing_commit_metadata": "Missing commit metadata blocks story boundary.",
        "test_gate_failed": "A failed test gate blocks story boundary.",
        "commit_gate_failed": "A failed commit gate blocks story boundary.",
        "cancelled": "Autopilot cancellation stopped story advancement before activation.",
    }
    return reasons.get(reason_code, f"Boundary gate {reason_code} blocks story boundary.")


def _resolve_boundary_stop(
    *,
    dirty_paths: list[str] | None,
    commit_meta: dict[str, Any] | None,
    gate_failures: list[str] | None,
) -> tuple[str, str] | None:
    if dirty_paths:
        return "dirty_worktree", _boundary_stop("dirty_worktree")
    if not commit_meta or not commit_meta.get("end_commit"):
        return "missing_commit_metadata", _boundary_stop("missing_commit_metadata")
    if gate_failures:
        reason_code = gate_failures[0]
        return reason_code, _boundary_stop(reason_code)
    return None


def _resolve_stage_stop(stage_result: dict[str, Any]) -> tuple[str, str] | None:
    if stage_result.get("needs_user_input"):
        return "needs_user_input", stage_result["route"].get("reason") or "Autopilot paused because user input is required."

    route_kind = stage_result["route"]["kind"]
    route_codes = {
        "ask_user": "route_ask_user",
        "rework": "route_rework",
        "escalate": "route_escalate",
    }
    if route_kind in route_codes:
        return route_codes[route_kind], stage_result["route"].get("reason") or f"Autopilot paused on route {route_kind}."

    return None


def _validate_completion_result(stage_result: dict[str, Any]) -> tuple[str, str | None]:
    route_kind = stage_result["route"]["kind"]
    outcome_code = stage_result["data"]["outcome_code"]
    next_story_id = stage_result["route"]["next_slice_id"]

    allowed = {
        ("done", "done"),
        ("next_slice", "next_slice"),
    }
    if (route_kind, outcome_code) not in allowed:
        raise ValueError(
            "Story boundary only accepts completed story results: "
            f"got route.kind={route_kind!r}, outcome_code={outcome_code!r}."
        )

    if route_kind == "next_slice" and not next_story_id:
        raise ValueError("A next-slice boundary requires route.next_slice_id.")

    if route_kind == "done" and next_story_id is not None:
        raise ValueError("A final done boundary must not set route.next_slice_id.")

    return route_kind, next_story_id


def _write_markdown(path: Path, story_id: str, next_story_id: str | None, handoff_data: dict[str, Any], commit_meta: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        f"### Story Handoff: {story_id}",
        "",
        f"- Next story: `{next_story_id}`" if next_story_id else "- Next story: none",
        f"- End commit: `{commit_meta.get('end_commit', 'unknown')}`",
        "",
        "#### Summary",
        handoff_data.get("summary", ""),
        "",
        "#### Carry Forward Context",
    ]
    for item in handoff_data.get("carry_forward_context", []):
        lines.append(f"- {item}")
    if handoff_data.get("changed_paths"):
        lines.extend(["", "#### Changed Paths"])
        for item in handoff_data["changed_paths"]:
            lines.append(f"- `{item}`")
    path.write_text("\n".join(lines).rstrip() + "\n")


def _handoff_path_for_story(ledger: dict[str, Any], story_id: str) -> str | None:
    story = ledger["stories"]["items"][story_id]
    carry_forward_from = story.get("carry_forward_from")
    if carry_forward_from:
        return ledger["stories"]["items"][carry_forward_from]["handoff_path"]
    return story.get("handoff_path")


def checkpoint_story_boundary(
    *,
    repo_root: Path,
    stage_result_path: Path,
    commit_meta: dict[str, Any] | None,
    handoff_data: dict[str, Any],
    dirty_paths: list[str] | None,
    gate_failures: list[str] | None = None,
    cancel_requested: bool = False,
    timestamp: str,
) -> None:
    repo_root = repo_root.resolve()
    run_path = repo_root / ".praxis" / "run.json"
    ledger_path = repo_root / ".praxis" / "story-ledger.json"
    events_path = repo_root / ".praxis" / "events.jsonl"
    stage_result_full_path = repo_root / stage_result_path

    run = _load_json(run_path)
    ledger = _load_json(ledger_path)
    stage_result = _load_json(stage_result_full_path)
    events = _load_events(events_path)
    execution_mode = _resolve_execution_mode(run, ledger)
    ledger["execution_mode"] = execution_mode

    current_story_id = run["current"]["slice_id"]
    current_story = ledger["stories"]["items"][current_story_id]
    route_kind, next_story_id = _validate_completion_result(stage_result)
    stage_name = stage_result_full_path.stem

    _append_event(
        events_path,
        {
            "ts": timestamp,
            "type": "stage_completed",
            "slice_id": current_story_id,
            "stage": stage_name,
            "outcome_code": stage_result["data"]["outcome_code"],
            "route_kind": stage_result["route"]["kind"],
        },
    )
    _append_event(
        events_path,
        {
            "ts": timestamp,
            "type": "boundary_started",
            "slice_id": current_story_id,
            "stage": stage_name,
        },
    )

    boundary_stop = _resolve_boundary_stop(
        dirty_paths=dirty_paths,
        commit_meta=commit_meta,
        gate_failures=gate_failures,
    )
    if boundary_stop:
        reason_code, reason = boundary_stop
        current_story["boundary_status"] = "blocked"
        current_story["boundary_reason_code"] = reason_code
        current_story["boundary_reason"] = reason
        ledger["stories"]["active"] = current_story_id
        run["status"] = "waiting_for_user"
        run["routing"]["next_action"] = "ask_user"
        run["routing"]["next_stage"] = None
        run["routing"]["next_slice_id"] = None
        run["routing"]["stop_reason_code"] = reason_code
        run["routing"]["reason"] = reason
        run["routing"]["boundary_handoff_path"] = None
        run["slices"]["active"] = current_story_id
        run["timestamps"]["updated_at"] = timestamp
        ledger["timestamps"]["updated_at"] = timestamp
        _write_json(run_path, run)
        _write_json(ledger_path, ledger)
        _append_event(
            events_path,
            {
                "ts": timestamp,
                "type": "boundary_blocked",
                "slice_id": current_story_id,
                "reason_code": reason_code,
                "reason": reason,
            },
        )
        return

    handoff_json_rel = f".praxis/slices/{current_story_id}/handoff.json"
    handoff_md_rel = f".praxis/slices/{current_story_id}/handoff.md"
    handoff_payload = {
        "version": 1,
        "story_id": current_story_id,
        "next_story_id": next_story_id,
        "summary": handoff_data.get("summary", ""),
        "carry_forward_context": handoff_data.get("carry_forward_context", []),
        "changed_paths": handoff_data.get("changed_paths", []),
        "commit_meta": commit_meta,
        "generated_at": timestamp,
    }

    _write_json(repo_root / handoff_json_rel, handoff_payload)
    _write_markdown(repo_root / handoff_md_rel, current_story_id, next_story_id, handoff_data, commit_meta)
    _append_event(
        events_path,
        {
            "ts": timestamp,
            "type": "boundary_checkpointed",
            "slice_id": current_story_id,
            "next_slice_id": next_story_id,
            "handoff_path": handoff_json_rel,
        },
    )

    current_story["status"] = "completed"
    current_story["boundary_status"] = "checkpointed"
    current_story["boundary_reason_code"] = None
    current_story["boundary_reason"] = None
    current_story["stop_reason_code"] = None
    current_story["stop_reason"] = None
    current_story["handoff_path"] = handoff_json_rel
    current_story["handoff_markdown_path"] = handoff_md_rel
    current_story["commit_meta"] = commit_meta
    ledger["stories"]["last_completed"] = current_story_id
    _append_unique(run["slices"]["completed"], current_story_id)

    if route_kind == "next_slice":
        next_story = ledger["stories"]["items"][next_story_id]
        next_story["status"] = "active_next"
        next_story["carry_forward_from"] = current_story_id
        next_story["stop_reason_code"] = None
        next_story["stop_reason"] = None
        ledger["stories"]["active"] = next_story_id
        run["status"] = "waiting_for_user"
        run["current"]["scope"] = "slice"
        run["current"]["slice_id"] = next_story_id
        run["current"]["artifact_dir"] = next_story["artifact_dir"]
        run["current"]["stage"] = "clarifying-intent"
        run["routing"]["next_action"] = "confirm_then_run"
        run["routing"]["next_stage"] = "clarifying-intent"
        run["routing"]["next_slice_id"] = next_story_id
        run["routing"]["reason"] = f"{current_story_id} checkpointed. Awaiting confirmation to begin {next_story_id}."
        run["routing"]["boundary_handoff_path"] = handoff_json_rel
        run["routing"]["stop_reason_code"] = None
        run["slices"]["active"] = next_story_id

        if execution_mode == "autopilot" and cancel_requested:
            reason_code = "cancelled"
            reason = _boundary_stop(reason_code)
            next_story["stop_reason_code"] = reason_code
            next_story["stop_reason"] = reason
            next_story["boundary_reason_code"] = reason_code
            next_story["boundary_reason"] = reason
            run["status"] = "cancelled"
            run["routing"]["next_action"] = "idle"
            run["routing"]["next_stage"] = None
            run["routing"]["next_slice_id"] = next_story_id
            run["routing"]["stop_reason_code"] = reason_code
            run["routing"]["reason"] = reason
            _append_event(
                events_path,
                {
                    "ts": timestamp,
                    "type": "story_activation_cancelled",
                    "slice_id": next_story_id,
                    "from_slice_id": current_story_id,
                    "reason_code": reason_code,
                    "reason": reason,
                },
            )
        elif execution_mode == "autopilot":
            next_story["status"] = "active"
            next_story["boundary_status"] = "in_progress"
            next_story["boundary_reason_code"] = None
            next_story["boundary_reason"] = None
            run["status"] = "running"
            run["routing"]["next_action"] = "run_stage"
            run["routing"]["next_stage"] = "clarifying-intent"
            run["routing"]["next_slice_id"] = None
            run["routing"]["stop_reason_code"] = None
            run["routing"]["reason"] = f"{next_story_id} activated from durable story-boundary state."
            if not _event_exists(
                events,
                event_type="story_activated",
                slice_id=next_story_id,
                from_slice_id=current_story_id,
            ):
                _append_event(
                    events_path,
                    {
                        "ts": timestamp,
                        "type": "story_activated",
                        "slice_id": next_story_id,
                        "from_slice_id": current_story_id,
                    },
                )
    else:
        ledger["stories"]["active"] = None
        run["status"] = "completed"
        run["routing"]["next_action"] = "finish"
        run["routing"]["next_stage"] = None
        run["routing"]["next_slice_id"] = None
        run["routing"]["stop_reason_code"] = None
        run["routing"]["reason"] = f"{current_story_id} checkpointed as the final completed story."
        run["routing"]["boundary_handoff_path"] = handoff_json_rel
        run["slices"]["active"] = None
        run["current"]["stage"] = None

    run["timestamps"]["updated_at"] = timestamp
    ledger["timestamps"]["updated_at"] = timestamp

    _write_json(run_path, run)
    _write_json(ledger_path, ledger)


def pause_autopilot_for_stage_result(
    *,
    repo_root: Path,
    stage_result_path: Path,
    timestamp: str,
) -> bool:
    repo_root = repo_root.resolve()
    run_path = repo_root / ".praxis" / "run.json"
    ledger_path = repo_root / ".praxis" / "story-ledger.json"
    events_path = repo_root / ".praxis" / "events.jsonl"
    stage_result_full_path = repo_root / stage_result_path

    run = _load_json(run_path)
    ledger = _load_json(ledger_path)
    stage_result = _load_json(stage_result_full_path)

    if _resolve_execution_mode(run, ledger) != "autopilot":
        return False

    stage_stop = _resolve_stage_stop(stage_result)
    if stage_stop is None:
        return False

    reason_code, reason = stage_stop
    current_story_id = run["current"]["slice_id"]
    current_story = ledger["stories"]["items"][current_story_id]
    next_stage = stage_result["route"]["next_stage"]

    current_story["status"] = "active"
    current_story["stop_reason_code"] = reason_code
    current_story["stop_reason"] = reason
    ledger["stories"]["active"] = current_story_id

    run["status"] = "waiting_for_user"
    run["current"]["stage"] = next_stage
    run["routing"]["next_action"] = "ask_user"
    run["routing"]["next_stage"] = next_stage
    run["routing"]["next_slice_id"] = stage_result["route"]["next_slice_id"]
    run["routing"]["stop_reason_code"] = reason_code
    run["routing"]["reason"] = reason
    run["timestamps"]["updated_at"] = timestamp
    ledger["timestamps"]["updated_at"] = timestamp

    _write_json(run_path, run)
    _write_json(ledger_path, ledger)
    _append_event(
        events_path,
        {
            "ts": timestamp,
            "type": "autopilot_stopped",
            "slice_id": current_story_id,
            "stage": stage_result_full_path.stem,
            "reason_code": reason_code,
            "reason": reason,
            "next_stage": next_stage,
        },
    )
    return True


def checkpoint_manual_story_boundary(
    *,
    repo_root: Path,
    stage_result_path: Path,
    commit_meta: dict[str, Any] | None,
    handoff_data: dict[str, Any],
    dirty_paths: list[str] | None,
    gate_failures: list[str] | None = None,
    timestamp: str,
) -> None:
    checkpoint_story_boundary(
        repo_root=repo_root,
        stage_result_path=stage_result_path,
        commit_meta=commit_meta,
        handoff_data=handoff_data,
        dirty_paths=dirty_paths,
        gate_failures=gate_failures,
        timestamp=timestamp,
    )


def activate_next_story_from_boundary(*, repo_root: Path, timestamp: str) -> None:
    repo_root = repo_root.resolve()
    run_path = repo_root / ".praxis" / "run.json"
    ledger_path = repo_root / ".praxis" / "story-ledger.json"
    events_path = repo_root / ".praxis" / "events.jsonl"

    run = _load_json(run_path)
    ledger = _load_json(ledger_path)
    events = _load_events(events_path)

    next_story_id = ledger["stories"]["active"]
    next_story = ledger["stories"]["items"][next_story_id]
    from_story_id = next_story.get("carry_forward_from")
    next_story["status"] = "active"
    next_story["boundary_status"] = "in_progress"
    next_story["stop_reason_code"] = None
    next_story["stop_reason"] = None

    run["status"] = "running"
    run["current"]["scope"] = "slice"
    run["current"]["slice_id"] = next_story_id
    run["current"]["artifact_dir"] = next_story["artifact_dir"]
    run["current"]["stage"] = "clarifying-intent"
    run["routing"]["next_action"] = "run_stage"
    run["routing"]["next_stage"] = "clarifying-intent"
    run["routing"]["next_slice_id"] = None
    run["routing"]["stop_reason_code"] = None
    run["routing"]["reason"] = f"{next_story_id} activated from durable story-boundary state."
    run["routing"]["boundary_handoff_path"] = next_story.get("carry_forward_from") and ledger["stories"]["items"][next_story["carry_forward_from"]]["handoff_path"]
    run["slices"]["active"] = next_story_id
    run["timestamps"]["updated_at"] = timestamp
    ledger["timestamps"]["updated_at"] = timestamp

    _write_json(run_path, run)
    _write_json(ledger_path, ledger)
    if not _event_exists(
        events,
        event_type="story_activated",
        slice_id=next_story_id,
        from_slice_id=from_story_id,
    ):
        _append_event(
            events_path,
            {
                "ts": timestamp,
                "type": "story_activated",
                "slice_id": next_story_id,
                "from_slice_id": from_story_id,
            },
        )


def resume_story_run_from_disk(*, repo_root: Path, timestamp: str) -> str:
    repo_root = repo_root.resolve()
    run_path = repo_root / ".praxis" / "run.json"
    ledger_path = repo_root / ".praxis" / "story-ledger.json"
    events_path = repo_root / ".praxis" / "events.jsonl"

    run = _load_json(run_path)
    ledger = _load_json(ledger_path)
    events = _load_events(events_path)

    active_story_id = ledger["stories"]["active"]
    if not active_story_id:
        raise ValueError("Cannot resume without an active story in the ledger.")

    current_slice_id = run["current"].get("slice_id")
    mirrored_active_story_id = run.get("slices", {}).get("active")
    if current_slice_id and current_slice_id != active_story_id:
        reason = (
            "Inconsistent durable state: "
            f"run.current.slice_id={current_slice_id!r} but "
            f"story-ledger active={active_story_id!r}. "
            "Repair run.current.slice_id or story-ledger.json before resuming."
        )
        _write_resume_stop(
            run_path=run_path,
            ledger_path=ledger_path,
            events_path=events_path,
            run=run,
            ledger=ledger,
            status="failed",
            active_story_id=active_story_id,
            reason_code="inconsistent_state",
            reason=reason,
            timestamp=timestamp,
        )
        return "resume_inconsistent"
    if mirrored_active_story_id and mirrored_active_story_id != active_story_id:
        reason = (
            "Inconsistent durable state: "
            f"run.slices.active={mirrored_active_story_id!r} but "
            f"story-ledger active={active_story_id!r}. "
            "Repair the compatibility mirror before resuming."
        )
        _write_resume_stop(
            run_path=run_path,
            ledger_path=ledger_path,
            events_path=events_path,
            run=run,
            ledger=ledger,
            status="failed",
            active_story_id=active_story_id,
            reason_code="inconsistent_state",
            reason=reason,
            timestamp=timestamp,
        )
        return "resume_inconsistent"

    active_story = ledger["stories"]["items"][active_story_id]
    if active_story.get("boundary_status") == "blocked":
        reason_code = active_story.get("boundary_reason_code") or "boundary_blocked"
        reason = (
            active_story.get("boundary_reason")
            or f"Resolve {reason_code} before resuming {active_story_id}."
        )
        if f"Resolve {reason_code}" not in reason:
            reason = f"{reason} Resolve {reason_code} before resuming {active_story_id}."
        _write_resume_stop(
            run_path=run_path,
            ledger_path=ledger_path,
            events_path=events_path,
            run=run,
            ledger=ledger,
            status="waiting_for_user",
            active_story_id=active_story_id,
            reason_code=reason_code,
            reason=reason,
            timestamp=timestamp,
        )
        return "resume_blocked"

    if active_story["status"] == "active_next":
        handoff_path = _handoff_path_for_story(ledger, active_story_id)
        if not handoff_path or not (repo_root / handoff_path).exists():
            reason = (
                f"Cannot resume {active_story_id} because the boundary handoff artifact is missing. "
                "Repair the handoff file before resuming."
            )
            _write_resume_stop(
                run_path=run_path,
                ledger_path=ledger_path,
                events_path=events_path,
                run=run,
                ledger=ledger,
                status="failed",
                active_story_id=active_story_id,
                reason_code="inconsistent_state",
                reason=reason,
                timestamp=timestamp,
            )
            return "resume_inconsistent"

        run["current"]["scope"] = "slice"
        run["current"]["slice_id"] = active_story_id
        run["current"]["artifact_dir"] = active_story["artifact_dir"]
        run["current"]["stage"] = "clarifying-intent"
        run["routing"]["boundary_handoff_path"] = handoff_path
        run["routing"]["stop_reason_code"] = None
        run["slices"]["active"] = active_story_id

        if _resolve_execution_mode(run, ledger) == "manual":
            run["status"] = "waiting_for_user"
            run["routing"]["next_action"] = "confirm_then_run"
            run["routing"]["next_stage"] = "clarifying-intent"
            run["routing"]["next_slice_id"] = active_story_id
            run["routing"]["reason"] = f"{active_story_id} is checkpointed and awaiting manual confirmation."
            run["timestamps"]["updated_at"] = timestamp
            ledger["timestamps"]["updated_at"] = timestamp
            _write_json(run_path, run)
            _write_json(ledger_path, ledger)
            return "resume_manual_wait"

        if _event_exists(
            events,
            event_type="story_activated",
            slice_id=active_story_id,
            from_slice_id=active_story.get("carry_forward_from"),
        ):
            activate_next_story_from_boundary(repo_root=repo_root, timestamp=timestamp)
            return "resume_replayed_activation"

        activate_next_story_from_boundary(repo_root=repo_root, timestamp=timestamp)
        return "resume_autopilot_activation"

    if active_story["status"] != "active":
        raise ValueError(
            "Resume currently expects an active or checkpointed-next story; "
            f"got status={active_story['status']!r}."
        )

    run["status"] = "running"
    run["current"]["scope"] = "slice"
    run["current"]["slice_id"] = active_story_id
    run["current"]["artifact_dir"] = active_story["artifact_dir"]
    run["routing"]["next_action"] = "run_stage"
    run["routing"]["next_stage"] = run["current"]["stage"]
    run["routing"]["next_slice_id"] = None
    run["routing"]["stop_reason_code"] = None
    run["routing"]["reason"] = f"{active_story_id} resumed from durable story-boundary state."
    run["slices"]["active"] = active_story_id
    run["timestamps"]["updated_at"] = timestamp
    ledger["timestamps"]["updated_at"] = timestamp

    _write_json(run_path, run)
    _write_json(ledger_path, ledger)
    return "resume_active"
