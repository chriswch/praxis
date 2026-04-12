from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from praxis.commands._support import build_run_snapshot, load_run_or_error, normalize_resume_action, resume_run


def handle(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    del args
    load_run_or_error(repo_root)
    action = normalize_resume_action(resume_run(repo_root=repo_root, timestamp=timestamp), repo_root)
    return {"transition_action": action, "run": build_run_snapshot(repo_root)}
