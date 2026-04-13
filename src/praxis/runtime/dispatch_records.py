from __future__ import annotations

from pathlib import Path
from typing import Any

from .state.contract_validation import validate_contract_payload
from .state.durable_state import load_json

_TERMINAL_STATUSES = {
    "provider_resumed",
    "launch_recorded",
    "launch_failed",
}

_LEGACY_STATUS_MAP = {
    "compiled": "intent_recorded",
}

_DEFAULT_REASONS = {
    "compiled": "Praxis compiled the dispatch bundle before adapter launch or resume began.",
    "intent_recorded": "Praxis recorded the dispatch intent before adapter launch or resume began.",
    "provider_resume_requested": "Praxis is attempting provider-native resume before falling back to a fresh launch if needed.",
    "provider_resumed": "Provider-native resume completed from the durable Praxis cursor.",
    "resume_fallback_to_launch": "Provider-native resume could not be used safely, so Praxis is falling back to a fresh launch.",
    "launch_recorded": "Native launch context prepared from durable Praxis state.",
    "launch_failed": "Praxis could not prepare a native launch from the durable dispatch intent.",
}

_UNCHANGED = object()


def _default_reason_for_status(status: str) -> str:
    return _DEFAULT_REASONS.get(status, "Praxis updated the durable dispatch-resolution record.")


def normalize_dispatch_record(record: dict[str, Any]) -> dict[str, Any]:
    validate_contract_payload("dispatch-record.schema.json", record)

    normalized = dict(record)
    resolution = normalized.get("resolution")
    legacy_status = str(normalized.get("status") or "intent_recorded")
    status = _LEGACY_STATUS_MAP.get(legacy_status, legacy_status)

    if not isinstance(resolution, dict):
        normalized["status"] = status
        normalized["resolution"] = {
            "status": status,
            "updated_at": normalized["recorded_at"],
            "resolved": status in _TERMINAL_STATUSES,
            "reason_code": status,
            "reason": _default_reason_for_status(legacy_status),
            "native_launch_record_path": None,
            "native_resume_record_path": None,
            "worker_record_path": None,
            "session_record_path": None,
        }
        return normalized

    normalized_resolution = {
        "status": _LEGACY_STATUS_MAP.get(str(resolution.get("status") or status), str(resolution.get("status") or status)),
        "updated_at": resolution.get("updated_at") or normalized["recorded_at"],
        "resolved": bool(resolution.get("resolved"))
        if "resolved" in resolution
        else str(resolution.get("status") or status) in _TERMINAL_STATUSES,
        "reason_code": resolution.get("reason_code") or status,
        "reason": resolution.get("reason") or _default_reason_for_status(status),
        "native_launch_record_path": resolution.get("native_launch_record_path"),
        "native_resume_record_path": resolution.get("native_resume_record_path"),
        "worker_record_path": resolution.get("worker_record_path"),
        "session_record_path": resolution.get("session_record_path"),
    }
    normalized["status"] = normalized_resolution["status"]
    normalized["resolution"] = normalized_resolution
    return normalized


def build_updated_dispatch_record(
    *,
    repo_root: Path,
    dispatch_record_path: str,
    status: str,
    recorded_at: str,
    reason_code: str,
    reason: str,
    native_launch_record_path: str | None | object = _UNCHANGED,
    native_resume_record_path: str | None | object = _UNCHANGED,
    worker_record_path: str | None | object = _UNCHANGED,
    session_record_path: str | None | object = _UNCHANGED,
) -> dict[str, Any]:
    record = normalize_dispatch_record(load_json(repo_root / dispatch_record_path))
    resolution = dict(record["resolution"])
    resolution["status"] = status
    resolution["updated_at"] = recorded_at
    resolution["resolved"] = status in _TERMINAL_STATUSES
    resolution["reason_code"] = reason_code
    resolution["reason"] = reason

    if native_launch_record_path is not _UNCHANGED:
        resolution["native_launch_record_path"] = native_launch_record_path
    if native_resume_record_path is not _UNCHANGED:
        resolution["native_resume_record_path"] = native_resume_record_path
    if worker_record_path is not _UNCHANGED:
        resolution["worker_record_path"] = worker_record_path
    if session_record_path is not _UNCHANGED:
        resolution["session_record_path"] = session_record_path

    record["status"] = status
    record["resolution"] = resolution
    validate_contract_payload("dispatch-record.schema.json", record)
    return record
