from __future__ import annotations

from pathlib import Path
from typing import Any

from ..state.contract_validation import validate_contract_payload
from ..state.durable_state import load_json


def load_worker_record(*, repo_root: Path, worker_record_path: str) -> dict[str, Any]:
    record = load_json(repo_root / worker_record_path)
    validate_contract_payload("worker-record.schema.json", record)
    return record
