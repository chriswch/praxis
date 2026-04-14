from __future__ import annotations

import re


def slug(value: str, *, fallback: str) -> str:
    candidate = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-._")
    return candidate or fallback


def dispatch_id_for_transition(*, transition_id: str, worker_id: str, stage: str) -> str:
    return slug(f"{transition_id}-{worker_id}-{stage}", fallback="dispatch")
