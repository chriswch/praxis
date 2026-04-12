from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
SRC_STR = str(SRC)
if SRC_STR not in sys.path:
    sys.path.insert(0, SRC_STR)

existing = os.environ.get("PYTHONPATH")
if existing:
    parts = existing.split(os.pathsep)
    if SRC_STR not in parts:
        os.environ["PYTHONPATH"] = os.pathsep.join([SRC_STR, *parts])
else:
    os.environ["PYTHONPATH"] = SRC_STR
