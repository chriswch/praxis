from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from ..policy import projection_required
from ..state.contract_validation import validate_contract_payload
from ..state.durable_state import load_json


def _slug(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "-" for ch in value).strip("-._") or "worker"


def isolated_worktree_relpath(worker_id: str) -> str:
    return f".praxis/runtime/worktrees/{_slug(worker_id)}"


def _worker_record_relpath(worker_id: str) -> str:
    return f".praxis/runtime/workers/{_slug(worker_id)}.json"


def _pid_running(pid: int | None) -> bool:
    if pid is None or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def inspect_isolated_worktree(*, repo_root: Path, worker_id: str) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    worktree_path = repo_root / isolated_worktree_relpath(worker_id)
    worker_record_path = repo_root / _worker_record_relpath(worker_id)
    worker_record = None
    if worker_record_path.exists():
        worker_record = load_json(worker_record_path)
        validate_contract_payload("worker-record.schema.json", worker_record)

    launcher_pid = worker_record.get("launcher_pid") if isinstance(worker_record, dict) else None
    if not isinstance(launcher_pid, int):
        launcher_pid = None
    worker_status = worker_record.get("status") if isinstance(worker_record, dict) else None
    launcher_running = _pid_running(launcher_pid)
    in_use = bool(worktree_path.exists() and worker_status == "running" and launcher_running)
    stale = bool(worktree_path.exists() and not in_use)

    return {
        "worker_id": worker_id,
        "worktree_path": str(worktree_path),
        "exists": worktree_path.exists(),
        "worker_record_path": str(worker_record_path) if worker_record_path.exists() else None,
        "worker_status": worker_status,
        "launcher_pid": launcher_pid,
        "launcher_running": launcher_running,
        "in_use": in_use,
        "stale": stale,
    }


def inspect_isolated_worktrees(repo_root: Path) -> list[dict[str, Any]]:
    repo_root = repo_root.resolve()
    worktrees_root = repo_root / ".praxis" / "runtime" / "worktrees"
    if not worktrees_root.exists():
        return []

    inspections: list[dict[str, Any]] = []
    seen_worktree_names: set[str] = set()

    worker_records_root = repo_root / ".praxis" / "runtime" / "workers"
    for worker_record_path in sorted(worker_records_root.glob("*.json")) if worker_records_root.exists() else []:
        worker_record = load_json(worker_record_path)
        validate_contract_payload("worker-record.schema.json", worker_record)
        if worker_record.get("worktree_mode") != "isolated":
            continue
        worker_id = str(worker_record["worker_id"])
        seen_worktree_names.add(_slug(worker_id))
        inspections.append(inspect_isolated_worktree(repo_root=repo_root, worker_id=worker_id))

    for path in sorted(worktrees_root.iterdir()):
        if path.name in seen_worktree_names:
            continue
        inspections.append(
            {
                "worker_id": path.name,
                "worktree_path": str(path),
                "exists": True,
                "worker_record_path": None,
                "worker_status": None,
                "launcher_pid": None,
                "launcher_running": False,
                "in_use": False,
                "stale": True,
            }
        )

    return inspections


def _safe_rmtree(path: Path) -> None:
    if not path.exists() and not path.is_symlink():
        return
    if path.is_symlink() or path.is_file():
        try:
            path.chmod(0o700)
        except OSError:
            pass
        path.unlink()
        return
    for child in sorted(path.rglob("*"), reverse=True):
        try:
            if child.is_dir():
                child.chmod(0o700)
            else:
                child.chmod(0o600)
        except OSError:
            pass
    try:
        path.chmod(0o700)
    except OSError:
        pass
    shutil.rmtree(path)


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _copy_read_only(src: Path, dst: Path) -> None:
    if src.is_dir():
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
        for child in dst.rglob("*"):
            if child.is_dir():
                child.chmod(0o555)
            else:
                child.chmod(0o444)
        dst.chmod(0o555)
        return
    _ensure_parent(dst)
    shutil.copy2(src, dst)
    dst.chmod(0o444)


def _link_writable(src: Path, dst: Path) -> None:
    _ensure_parent(dst)
    if dst.exists() or dst.is_symlink():
        _safe_rmtree(dst)
    dst.symlink_to(src, target_is_directory=src.is_dir())


def _projection_paths(*, repo_root: Path, payload: dict[str, Any]) -> tuple[list[str], list[str]]:
    readable = [payload["inputs"]["run_path"], payload["bundle"]["bundle_dir"]]
    story_ledger_path = repo_root / ".praxis" / "story-ledger.json"
    if story_ledger_path.exists():
        readable.append(".praxis/story-ledger.json")
    handoff_path = payload["inputs"].get("boundary_handoff_path")
    if handoff_path:
        readable.append(handoff_path)
    for artifact_path in payload.get("artifact_inputs", []):
        if artifact_path in readable:
            continue
        readable.append(artifact_path)
    writable = list(payload.get("artifact_outputs_expected", []))
    return readable, writable


def _project_runtime_state(*, repo_root: Path, worktree_path: Path, payload: dict[str, Any]) -> None:
    praxis_root = worktree_path / ".praxis"
    _safe_rmtree(praxis_root)
    praxis_root.mkdir(parents=True, exist_ok=True)

    readable, writable = _projection_paths(repo_root=repo_root, payload=payload)
    for rel_path in readable:
        src = repo_root / rel_path
        if not src.exists():
            continue
        _copy_read_only(src, worktree_path / rel_path)
    for rel_path in writable:
        src = repo_root / rel_path
        if not src.exists():
            if Path(rel_path).suffix:
                src.parent.mkdir(parents=True, exist_ok=True)
            else:
                src.mkdir(parents=True, exist_ok=True)
        _link_writable(src, worktree_path / rel_path)
    praxis_root.chmod(0o555)


def ensure_isolated_worktree(*, repo_root: Path, worker_id: str, payload: dict[str, Any] | None = None) -> Path:
    repo_root = repo_root.resolve()
    worktree_path = repo_root / isolated_worktree_relpath(worker_id)
    inspection = inspect_isolated_worktree(repo_root=repo_root, worker_id=worker_id)
    if inspection["in_use"]:
        raise RuntimeError(
            "Praxis cannot recreate an isolated worktree that is still owned by a running worker: "
            f"{worker_id} (launcher_pid={inspection['launcher_pid']})."
        )
    if worktree_path.exists():
        cleanup_isolated_worktree(repo_root=repo_root, worker_id=worker_id)

    worktree_path.parent.mkdir(parents=True, exist_ok=True)
    completed = subprocess.run(
        ["git", "worktree", "add", "--detach", str(worktree_path), "HEAD"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        stderr = completed.stderr.strip() or completed.stdout.strip() or "git worktree add failed."
        raise RuntimeError(f"Praxis could not create an isolated worktree for {worker_id}: {stderr}")

    if payload is not None and projection_required(payload.get("permissions", {})):
        _project_runtime_state(repo_root=repo_root, worktree_path=worktree_path, payload=payload)
    else:
        _link_shared_runtime(repo_root=repo_root, worktree_path=worktree_path)
    return worktree_path


def cleanup_isolated_worktree(*, repo_root: Path, worker_id: str) -> None:
    repo_root = repo_root.resolve()
    worktree_path = repo_root / isolated_worktree_relpath(worker_id)
    if not worktree_path.exists():
        return

    for child in sorted(worktree_path.rglob("*"), reverse=True):
        try:
            if child.is_symlink():
                continue
            if child.is_dir():
                child.chmod(0o700)
            else:
                child.chmod(0o600)
        except OSError:
            pass
    try:
        worktree_path.chmod(0o700)
    except OSError:
        pass

    completed = subprocess.run(
        ["git", "worktree", "remove", "--force", str(worktree_path)],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0 and worktree_path.exists():
        raise RuntimeError(
            f"Praxis could not remove isolated worktree for {worker_id}: "
            f"{completed.stderr.strip() or completed.stdout.strip() or 'git worktree remove failed.'}"
        )

    if worktree_path.exists():
        shutil.rmtree(worktree_path, ignore_errors=True)


def cleanup_isolated_worktree_event(
    *,
    repo_root: Path,
    worker_id: str,
    recorded_at: str,
) -> dict[str, Any] | None:
    repo_root = repo_root.resolve()
    worktree_path = repo_root / isolated_worktree_relpath(worker_id)
    if not worktree_path.exists():
        return None

    try:
        cleanup_isolated_worktree(repo_root=repo_root, worker_id=worker_id)
    except Exception as exc:
        return {
            "ts": recorded_at,
            "type": "worktree_cleanup_failed",
            "worker_id": worker_id,
            "worktree_path": str(worktree_path),
            "reason_code": "worktree_cleanup_failed",
            "reason": str(exc),
        }

    return {
        "ts": recorded_at,
        "type": "worktree_cleaned",
        "worker_id": worker_id,
        "worktree_path": str(worktree_path),
    }


def _link_shared_runtime(*, repo_root: Path, worktree_path: Path) -> None:
    runtime_link = worktree_path / ".praxis"
    if runtime_link.is_symlink():
        return
    if runtime_link.exists():
        if runtime_link.is_dir():
            shutil.rmtree(runtime_link)
        else:
            runtime_link.unlink()
    runtime_link.symlink_to(repo_root / ".praxis", target_is_directory=True)
