from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any


class GitBoundaryError(RuntimeError):
    def __init__(self, *, code: str, message: str, evidence: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.evidence = evidence


def collect_boundary_evidence(
    *,
    repo_root: Path,
    story: dict[str, Any],
    ledger: dict[str, Any],
    fallback_commit_meta: dict[str, Any] | None = None,
    worktree_mode: str = "in_place",
) -> dict[str, Any] | None:
    repo_root = repo_root.resolve()
    git_root = _git_root(repo_root)
    if git_root is None:
        return fallback_commit_meta

    start_commit = _resolve_start_commit(
        story=story,
        ledger=ledger,
        fallback_commit_meta=fallback_commit_meta,
    )
    end_commit = _git_output(git_root, "rev-parse", "HEAD")
    branch = _git_output(git_root, "branch", "--show-current")
    commits_after_start = _git_lines(git_root, "rev-list", "--reverse", f"{start_commit}..{end_commit}")
    changed_paths = _filter_product_paths(
        _git_lines(git_root, "diff", "--name-only", f"{start_commit}..{end_commit}")
    )
    dirty_paths = _filter_product_paths(_git_status_paths(git_root))

    evidence = {
        "start_commit": start_commit,
        "end_commit": end_commit,
        "commits": _commit_series(start_commit, commits_after_start),
        "changed_paths": changed_paths,
        "dirty_paths": dirty_paths,
        "worktree": {
            "mode": worktree_mode,
            "path": str(git_root),
            "branch": branch or None,
        },
    }

    merge_base_ok = _git_exit_code(git_root, "merge-base", "--is-ancestor", start_commit, end_commit) == 0
    if not merge_base_ok:
        raise GitBoundaryError(
            code="ambiguous_boundary_commits",
            message="Git history is ambiguous because the story start commit is not an ancestor of HEAD.",
            evidence=evidence,
        )

    if dirty_paths:
        raise GitBoundaryError(
            code="dirty_worktree",
            message="Dirty product worktree blocks story boundary.",
            evidence=evidence,
        )

    if not changed_paths:
        raise GitBoundaryError(
            code="zero_delta_checkpoint",
            message="Zero-delta story checkpoint blocks story boundary.",
            evidence=evidence,
        )

    return evidence


def current_git_head(repo_root: Path) -> str | None:
    git_root = _git_root(repo_root.resolve())
    if git_root is None:
        return None
    return _git_output(git_root, "rev-parse", "HEAD")


def current_worktree_metadata(repo_root: Path, *, worktree_mode: str = "in_place") -> dict[str, Any] | None:
    git_root = _git_root(repo_root.resolve())
    if git_root is None:
        return None
    branch = _git_output(git_root, "branch", "--show-current")
    return {
        "mode": worktree_mode,
        "path": str(git_root),
        "branch": branch or None,
    }


def _resolve_start_commit(
    *,
    story: dict[str, Any],
    ledger: dict[str, Any],
    fallback_commit_meta: dict[str, Any] | None,
) -> str:
    story_commit_meta = story.get("commit_meta") or {}
    if story_commit_meta.get("start_commit"):
        return story_commit_meta["start_commit"]

    carry_forward_from = story.get("carry_forward_from")
    if carry_forward_from:
        previous_story = ledger["stories"]["items"].get(carry_forward_from, {})
        previous_commit_meta = previous_story.get("commit_meta") or {}
        if previous_commit_meta.get("end_commit"):
            return previous_commit_meta["end_commit"]

    if fallback_commit_meta and fallback_commit_meta.get("start_commit"):
        return fallback_commit_meta["start_commit"]

    raise GitBoundaryError(
        code="missing_commit_metadata",
        message="Missing commit metadata blocks story boundary.",
    )


def _git_root(repo_root: Path) -> Path | None:
    try:
        root = _git_output(repo_root, "rev-parse", "--show-toplevel")
    except GitBoundaryError as exc:
        if exc.code == "git_unavailable":
            return None
        raise
    return Path(root)


def _git_status_paths(repo_root: Path) -> list[str]:
    lines = _git_lines(repo_root, "status", "--porcelain=v1", "--untracked-files=all")
    paths: list[str] = []
    for line in lines:
        if not line:
            continue
        candidate = line[3:]
        if " -> " in candidate:
            candidate = candidate.split(" -> ", 1)[1]
        paths.append(candidate)
    return paths


def _filter_product_paths(paths: list[str]) -> list[str]:
    return sorted(path for path in paths if path and not path.startswith(".praxis/"))


def _commit_series(start_commit: str, commits_after_start: list[str]) -> list[str]:
    commits = [start_commit]
    for commit in commits_after_start:
        if commit not in commits:
            commits.append(commit)
    return commits


def _git_output(repo_root: Path, *args: str) -> str:
    completed = _git_run(repo_root, *args)
    return completed.stdout.strip()


def _git_lines(repo_root: Path, *args: str) -> list[str]:
    output = _git_output(repo_root, *args)
    return [line for line in output.splitlines() if line.strip()]


def _git_exit_code(repo_root: Path, *args: str) -> int:
    return subprocess.run(
        ["git", *args],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    ).returncode


def _git_run(repo_root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        ["git", *args],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise GitBoundaryError(
            code="git_unavailable",
            message=(completed.stderr.strip() or completed.stdout.strip() or "Git command failed."),
        )
    return completed
