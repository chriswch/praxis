from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any
from uuid import uuid4

from .contract_validation import ContractValidationError, validate_contract_payload


class RecoveryRequiredError(RuntimeError):
    def __init__(self, *, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def load_optional_json(path: str | None) -> dict[str, Any] | None:
    if path is None:
        return None
    return load_json(Path(path))


def load_events(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    lines = [line for line in path.read_text().splitlines() if line.strip()]
    return [json.loads(line) for line in lines]


def dump_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, indent=2) + "\n"


def dump_events(events: list[dict[str, Any]]) -> str:
    if not events:
        return ""
    return "\n".join(json.dumps(event) for event in events) + "\n"


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    write_text_atomic(path, dump_json(payload))


def write_text_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", delete=False, dir=path.parent, encoding="utf-8") as handle:
        handle.write(text)
        temp_path = Path(handle.name)
    os.replace(temp_path, path)


def validate_run_payload(payload: dict[str, Any]) -> None:
    validate_contract_payload("run.schema.json", payload)


def validate_story_ledger_payload(payload: dict[str, Any]) -> None:
    validate_contract_payload("story-ledger.schema.json", payload)


def validate_stage_result_payload(payload: dict[str, Any]) -> None:
    validate_contract_payload("stage-result.schema.json", payload)


def validate_handoff_payload(payload: dict[str, Any]) -> None:
    validate_contract_payload("handoff.schema.json", payload)


def validate_lifecycle_event_payload(payload: dict[str, Any]) -> None:
    validate_contract_payload("lifecycle-event.schema.json", payload)


def validate_recovery_payload(payload: dict[str, Any]) -> None:
    validate_contract_payload("recovery.schema.json", payload)


def validate_handoff_file(path: Path) -> dict[str, Any]:
    payload = load_json(path)
    validate_handoff_payload(payload)
    return payload


def validate_event_log(events: list[dict[str, Any]]) -> None:
    for index, event in enumerate(events):
        try:
            validate_lifecycle_event_payload(event)
        except ContractValidationError as exc:
            raise ContractValidationError(f"$.events[{index}]: {exc}") from exc


def validate_state_payloads(
    *,
    run: dict[str, Any] | None = None,
    ledger: dict[str, Any] | None = None,
    stage_result: dict[str, Any] | None = None,
    handoff: dict[str, Any] | None = None,
    events: list[dict[str, Any]] | None = None,
    recovery: dict[str, Any] | None = None,
) -> None:
    if run is not None:
        validate_run_payload(run)
    if ledger is not None:
        validate_story_ledger_payload(ledger)
    if stage_result is not None:
        validate_stage_result_payload(stage_result)
    if handoff is not None:
        validate_handoff_payload(handoff)
    if events is not None:
        validate_event_log(events)
    if recovery is not None:
        validate_recovery_payload(recovery)


def recover_pending_transaction(repo_root: Path) -> str | None:
    repo_root = repo_root.resolve()
    recovery_path = repo_root / ".praxis" / "recovery.json"
    if not recovery_path.exists():
        return None

    recovery = load_json(recovery_path)
    validate_recovery_payload(recovery)
    for file_entry in recovery["files"]:
        staged_path = repo_root / file_entry["staged_path"]
        if not staged_path.exists():
            raise RecoveryRequiredError(
                code="recovery_artifact_missing",
                message=(
                    "Praxis found an incomplete durable transaction but one of the staged "
                    f"artifacts is missing: {file_entry['staged_path']}."
                ),
            )
        if _sha256(staged_path.read_text()) != file_entry["sha256"]:
            raise RecoveryRequiredError(
                code="recovery_artifact_corrupt",
                message=(
                    "Praxis found an incomplete durable transaction but one of the staged "
                    f"artifacts no longer matches its recorded digest: {file_entry['staged_path']}."
                ),
            )

    if not _targets_match_recovery(repo_root=repo_root, recovery=recovery):
        _apply_recovery(repo_root=repo_root, recovery=recovery)
        result = "reapplied"
    else:
        result = "already_applied"

    _cleanup_transaction(repo_root=repo_root, recovery=recovery)
    return result


def commit_transaction(
    *,
    repo_root: Path,
    operation: str,
    files: dict[str, str],
    timestamp: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    repo_root = repo_root.resolve()
    recover_pending_transaction(repo_root)

    transaction_id = _build_transaction_id(operation)
    transaction_dir_rel = f".praxis/transactions/{transaction_id}"
    transaction_dir = repo_root / transaction_dir_rel
    staged_dir = transaction_dir / "files"
    staged_dir.mkdir(parents=True, exist_ok=True)

    recovery = {
        "version": 1,
        "status": "pending",
        "operation": operation,
        "transaction_id": transaction_id,
        "transaction_dir": transaction_dir_rel,
        "started_at": timestamp,
        "metadata": metadata or {},
        "files": [],
    }

    ordered_paths = sorted(files)
    for index, target_path in enumerate(ordered_paths):
        staged_path = staged_dir / f"{index:02d}"
        text = files[target_path]
        staged_path.write_text(text)
        recovery["files"].append(
            {
                "target_path": target_path,
                "staged_path": _relative_to_repo(repo_root, staged_path),
                "sha256": _sha256(text),
            }
        )

    validate_recovery_payload(recovery)
    recovery_path = repo_root / ".praxis" / "recovery.json"
    write_json_atomic(recovery_path, recovery)

    try:
        _apply_recovery(repo_root=repo_root, recovery=recovery)
    except Exception:
        raise
    else:
        _cleanup_transaction(repo_root=repo_root, recovery=recovery)


def _apply_recovery(*, repo_root: Path, recovery: dict[str, Any]) -> None:
    for file_entry in recovery["files"]:
        _replace_target_with_staged_copy(
            repo_root=repo_root,
            staged_path=repo_root / file_entry["staged_path"],
            target_path=repo_root / file_entry["target_path"],
        )


def _replace_target_with_staged_copy(*, repo_root: Path, staged_path: Path, target_path: Path) -> None:
    del repo_root
    text = staged_path.read_text()
    write_text_atomic(target_path, text)


def _targets_match_recovery(*, repo_root: Path, recovery: dict[str, Any]) -> bool:
    for file_entry in recovery["files"]:
        target_path = repo_root / file_entry["target_path"]
        if not target_path.exists():
            return False
        if _sha256(target_path.read_text()) != file_entry["sha256"]:
            return False
    return True


def _cleanup_transaction(*, repo_root: Path, recovery: dict[str, Any]) -> None:
    recovery_path = repo_root / ".praxis" / "recovery.json"
    if recovery_path.exists():
        recovery_path.unlink()

    transaction_dir = repo_root / recovery["transaction_dir"]
    if transaction_dir.exists():
        shutil.rmtree(transaction_dir)


def _build_transaction_id(operation: str) -> str:
    safe_operation = operation.replace(" ", "-").replace("/", "-")
    return f"{safe_operation}-{uuid4().hex[:12]}"


def _relative_to_repo(repo_root: Path, path: Path) -> str:
    return str(path.resolve().relative_to(repo_root.resolve()))


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
