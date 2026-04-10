from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


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


def checkpoint_manual_story_boundary(
    *,
    repo_root: Path,
    stage_result_path: Path,
    commit_meta: dict[str, Any] | None,
    handoff_data: dict[str, Any],
    dirty_paths: list[str] | None,
    timestamp: str,
) -> None:
    repo_root = repo_root.resolve()
    run_path = repo_root / ".praxis" / "run.json"
    ledger_path = repo_root / ".praxis" / "story-ledger.json"
    stage_result_full_path = repo_root / stage_result_path

    run = _load_json(run_path)
    ledger = _load_json(ledger_path)
    stage_result = _load_json(stage_result_full_path)

    current_story_id = run["current"]["slice_id"]
    current_story = ledger["stories"]["items"][current_story_id]
    next_story_id = stage_result["route"]["next_slice_id"]

    if dirty_paths or not commit_meta or not commit_meta.get("end_commit"):
        reason = "Dirty product worktree blocks story boundary." if dirty_paths else "Missing commit metadata blocks story boundary."
        current_story["boundary_status"] = "blocked"
        current_story["boundary_reason"] = reason
        run["status"] = "waiting_for_user"
        run["routing"]["next_action"] = "ask_user"
        run["routing"]["next_stage"] = None
        run["routing"]["next_slice_id"] = None
        run["routing"]["reason"] = reason
        run["timestamps"]["updated_at"] = timestamp
        ledger["timestamps"]["updated_at"] = timestamp
        _write_json(run_path, run)
        _write_json(ledger_path, ledger)
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

    current_story["status"] = "completed"
    current_story["boundary_status"] = "checkpointed"
    current_story["boundary_reason"] = None
    current_story["handoff_path"] = handoff_json_rel
    current_story["handoff_markdown_path"] = handoff_md_rel
    current_story["commit_meta"] = commit_meta
    ledger["stories"]["last_completed"] = current_story_id

    if next_story_id:
        next_story = ledger["stories"]["items"][next_story_id]
        next_story["status"] = "active_next"
        next_story["carry_forward_from"] = current_story_id
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
    else:
        ledger["stories"]["active"] = None
        run["status"] = "completed"
        run["routing"]["next_action"] = "finish"
        run["routing"]["next_stage"] = None
        run["routing"]["next_slice_id"] = None
        run["routing"]["reason"] = f"{current_story_id} checkpointed as the final completed story."
        run["current"]["stage"] = None

    run["timestamps"]["updated_at"] = timestamp
    ledger["timestamps"]["updated_at"] = timestamp

    _write_json(run_path, run)
    _write_json(ledger_path, ledger)


def activate_next_story_from_boundary(*, repo_root: Path, timestamp: str) -> None:
    repo_root = repo_root.resolve()
    run_path = repo_root / ".praxis" / "run.json"
    ledger_path = repo_root / ".praxis" / "story-ledger.json"

    run = _load_json(run_path)
    ledger = _load_json(ledger_path)

    next_story_id = ledger["stories"]["active"]
    next_story = ledger["stories"]["items"][next_story_id]
    next_story["status"] = "active"
    next_story["boundary_status"] = "in_progress"

    run["status"] = "running"
    run["current"]["scope"] = "slice"
    run["current"]["slice_id"] = next_story_id
    run["current"]["artifact_dir"] = next_story["artifact_dir"]
    run["current"]["stage"] = "clarifying-intent"
    run["routing"]["next_action"] = "run_stage"
    run["routing"]["next_stage"] = "clarifying-intent"
    run["routing"]["next_slice_id"] = None
    run["routing"]["reason"] = f"{next_story_id} activated from durable story-boundary state."
    run["timestamps"]["updated_at"] = timestamp
    ledger["timestamps"]["updated_at"] = timestamp

    _write_json(run_path, run)
    _write_json(ledger_path, ledger)
