from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


def _slug(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "-" for ch in value).strip("-._") or "worker"


def isolated_worktree_relpath(worker_id: str) -> str:
    return f".praxis/runtime/worktrees/{_slug(worker_id)}"


def ensure_isolated_worktree(*, repo_root: Path, worker_id: str) -> Path:
    repo_root = repo_root.resolve()
    worktree_path = repo_root / isolated_worktree_relpath(worker_id)
    if worktree_path.exists():
        _link_shared_runtime(repo_root=repo_root, worktree_path=worktree_path)
        return worktree_path

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

    _link_shared_runtime(repo_root=repo_root, worktree_path=worktree_path)
    return worktree_path


def cleanup_isolated_worktree(*, repo_root: Path, worker_id: str) -> None:
    repo_root = repo_root.resolve()
    worktree_path = repo_root / isolated_worktree_relpath(worker_id)
    if not worktree_path.exists():
        return

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
