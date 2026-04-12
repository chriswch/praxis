from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from praxis.commands._support import build_run_snapshot


def handle(args: argparse.Namespace, repo_root: Path, timestamp: str) -> dict[str, Any]:
    del args, timestamp
    return {"run": build_run_snapshot(repo_root)}
