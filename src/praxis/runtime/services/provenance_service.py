from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..state.durable_state import load_json
from ..store.dispatch_repo import load_active_dispatch_bundle_status, load_dispatch_record
from ..store.worker_repo import load_worker_record


@dataclass
class ProvenanceFailure:
    check: str
    reason: str
    details: dict[str, Any]


class StageResultProvenanceError(ValueError):
    def __init__(self, *, message: str, details: list[dict[str, Any]]) -> None:
        super().__init__(message)
        self.reason_code = "stage_result_provenance_invalid"
        self.details = details


def _result_is_owner_result(stage_result: dict[str, Any]) -> bool:
    worker = stage_result.get("worker") or {}
    ownership = stage_result.get("ownership") or {}
    if ownership:
        return bool(ownership.get("run_routing_owned", True))
    return worker.get("worker_class") != "subagent_worker"


def validate_owner_stage_result(
    *,
    repo_root: Path,
    run: dict[str, Any],
    stage_result: dict[str, Any],
) -> None:
    if not _result_is_owner_result(stage_result):
        return

    failures: list[ProvenanceFailure] = []
    worker = stage_result.get("worker") or {}
    result_worker_id = worker.get("worker_id")
    current_worker_id = run.get("current", {}).get("worker_id")
    pending_worker_action = run.get("routing", {}).get("pending_worker_action")

    if pending_worker_action != "await_stage_result":
        failures.append(
            ProvenanceFailure(
                check="run_expects_owner_stage_result",
                reason="Run routing is not awaiting an owner stage result.",
                details={
                    "pending_worker_action": pending_worker_action,
                    "next_action": run.get("routing", {}).get("next_action"),
                },
            )
        )

    dispatch_bundle = load_active_dispatch_bundle_status(repo_root=repo_root, run=run)
    if dispatch_bundle is None or not dispatch_bundle.get("available"):
        failures.append(
            ProvenanceFailure(
                check="active_dispatch_bundle_complete",
                reason="Active dispatch bundle is missing or incomplete for the current stage.",
                details={
                    "available": None if dispatch_bundle is None else bool(dispatch_bundle.get("available")),
                    "bundle_status": None if dispatch_bundle is None else dispatch_bundle.get("status"),
                    "bundle_reason_code": None if dispatch_bundle is None else dispatch_bundle.get("reason_code"),
                },
            )
        )
    else:
        dispatch_id = dispatch_bundle.get("dispatch_id")
        dispatch_record_path = dispatch_bundle.get("dispatch_record_path")

        if result_worker_id != current_worker_id:
            failures.append(
                ProvenanceFailure(
                    check="worker_id_matches_active_worker",
                    reason="Stage result worker_id does not match run.current.worker_id.",
                    details={
                        "result_worker_id": result_worker_id,
                        "current_worker_id": current_worker_id,
                    },
                )
            )

        if dispatch_record_path is None:
            failures.append(
                ProvenanceFailure(
                    check="dispatch_record_linked",
                    reason="Dispatch bundle is missing dispatch_record_path linkage.",
                    details={"dispatch_id": dispatch_id},
                )
            )
        else:
            record = load_dispatch_record(repo_root=repo_root, dispatch_record_path=dispatch_record_path)
            resolution = record.get("resolution", {})

            worker_record_path = resolution.get("worker_record_path")
            if not isinstance(worker_record_path, str) or not worker_record_path:
                failures.append(
                    ProvenanceFailure(
                        check="worker_record_exists",
                        reason="Dispatch record has no worker_record_path evidence.",
                        details={"dispatch_id": dispatch_id},
                    )
                )
            else:
                worker_record = load_worker_record(repo_root=repo_root, worker_record_path=worker_record_path)
                if worker_record.get("dispatch_id") != dispatch_id:
                    failures.append(
                        ProvenanceFailure(
                            check="worker_record_dispatch_link",
                            reason="Worker record dispatch_id does not match active dispatch.",
                            details={
                                "expected_dispatch_id": dispatch_id,
                                "actual_dispatch_id": worker_record.get("dispatch_id"),
                                "worker_record_path": worker_record_path,
                            },
                        )
                    )
                if worker_record.get("worker_id") != current_worker_id:
                    failures.append(
                        ProvenanceFailure(
                            check="worker_record_worker_link",
                            reason="Worker record worker_id does not match active run worker.",
                            details={
                                "expected_worker_id": current_worker_id,
                                "actual_worker_id": worker_record.get("worker_id"),
                                "worker_record_path": worker_record_path,
                            },
                        )
                    )

            native_launch_record_path = resolution.get("native_launch_record_path")
            native_resume_record_path = resolution.get("native_resume_record_path")
            if not native_launch_record_path and not native_resume_record_path:
                failures.append(
                    ProvenanceFailure(
                        check="launch_or_resume_evidence_exists",
                        reason="Dispatch record has no launch or resume evidence.",
                        details={"dispatch_id": dispatch_id},
                    )
                )
            else:
                for record_path in [native_launch_record_path, native_resume_record_path]:
                    if not record_path:
                        continue
                    evidence = load_json(repo_root / record_path)
                    bundle = evidence.get("bundle") or {}
                    if bundle.get("dispatch_id") != dispatch_id:
                        failures.append(
                            ProvenanceFailure(
                                check="launch_or_resume_dispatch_link",
                                reason="Launch/resume evidence dispatch_id does not match active dispatch.",
                                details={
                                    "expected_dispatch_id": dispatch_id,
                                    "actual_dispatch_id": bundle.get("dispatch_id"),
                                    "evidence_path": record_path,
                                },
                            )
                        )

    if failures:
        raise StageResultProvenanceError(
            message="Owner stage-result provenance validation failed for the active run cursor.",
            details=[
                {
                    "check": failure.check,
                    "reason": failure.reason,
                    "details": failure.details,
                }
                for failure in failures
            ],
        )
