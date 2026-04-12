#!/usr/bin/env python3
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
SRC_ROOT = REPO_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from praxis.runtime.adapters.codex.hooks import main


if __name__ == "__main__":
    raise SystemExit(main(["session-start", "--repo-root", str(REPO_ROOT)]))
