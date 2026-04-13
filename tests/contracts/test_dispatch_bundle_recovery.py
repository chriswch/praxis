import json
import tempfile
import unittest
from pathlib import Path

from praxis.runtime.context.bundle import dispatch_bundle_paths, load_dispatch_bundle_status
from praxis.runtime.state.contract_validation import validate_contract_payload


def load_json(path: Path):
    return json.loads(path.read_text())


class DispatchBundleRecoveryContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write_json(self, rel_path: str, payload: dict) -> None:
        path = self.repo_root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2) + "\n")

    def _intent_record(self, bundle: dict[str, str]) -> dict:
        record = {
            "version": 1,
            "dispatch_id": bundle["dispatch_id"],
            "run_id": "run_20260414000000",
            "recorded_at": "2026-04-14T00:00:00Z",
            "status": "intent_recorded",
            "dispatch": {
                "workflow": "forge",
                "adapter": "codex",
                "entrypoint": "praxis:forge",
                "scope": "slice",
                "slice_id": "S-010",
                "artifact_dir": ".praxis/slices/S-010",
                "stage": "clarifying-intent",
                "boundary_handoff_path": None,
                "transition_id": "tx_063",
                "reason": "Recover the active dispatch bundle from durable state.",
            },
            "worker": {
                "worker_id": "wrk_S010_clarify_63",
                "worker_class": "session_worker",
                "reuse_policy": "new_story_worker",
                "permission_profile": "planning",
                "worktree_mode": "shared",
                "fresh_context": True,
            },
            "resume": {
                "strategy": "prefer_resume_then_relaunch",
                "session_id": None,
                "resumable": False,
                "mode": "headless",
            },
            "bundle": {
                "bundle_dir": bundle["bundle_dir"],
                "worker_launch_path": bundle["worker_launch_path"],
                "dispatch_record_path": bundle["dispatch_record_path"],
                "context_manifest_path": bundle["context_manifest_path"],
                "tool_manifest_path": bundle["tool_manifest_path"],
            },
            "artifact_inputs": [".praxis/run.json", ".praxis/slices/S-009/handoff.json"],
            "artifact_outputs_expected": [".praxis/slices/S-010/results/clarifying-intent.json"],
            "resolution": {
                "status": "intent_recorded",
                "updated_at": "2026-04-14T00:00:00Z",
                "resolved": False,
                "reason_code": "intent_recorded",
                "reason": "Praxis recorded the dispatch intent before adapter launch or resume began.",
                "native_launch_record_path": None,
                "native_resume_record_path": None,
                "worker_record_path": None,
                "session_record_path": None,
            },
        }
        validate_contract_payload("dispatch-record.schema.json", record)
        return record

    def test_intent_only_dispatch_bundle_fails_closed(self) -> None:
        bundle = dispatch_bundle_paths(
            dispatch_id="tx-063-wrk-S010-clarify-63-clarifying-intent",
            worker_class="session_worker",
        )
        self._write_json(bundle["dispatch_record_path"], self._intent_record(bundle))

        status = load_dispatch_bundle_status(repo_root=self.repo_root, bundle=bundle)

        assert status is not None
        self.assertFalse(status["available"])
        self.assertEqual(status["recovery_state"], "intent_recorded_only")
        self.assertEqual(status["recovery_reason_code"], "dispatch_intent_only")
        self.assertFalse(status["worker_launch_exists"])
        self.assertFalse(status["context_manifest_exists"])
        self.assertFalse(status["tool_manifest_exists"])

    def test_pending_recovery_marker_reports_dispatch_bundle_recovery(self) -> None:
        bundle = dispatch_bundle_paths(
            dispatch_id="tx-063-wrk-S010-clarify-63-clarifying-intent",
            worker_class="session_worker",
        )
        self._write_json(
            ".praxis/recovery.json",
            {
                "version": 1,
                "status": "pending",
                "operation": "persist_dispatch_bundle",
                "transaction_id": "tx_recovery_001",
                "transaction_dir": ".praxis/transactions/tx_recovery_001",
                "started_at": "2026-04-14T00:00:00Z",
                "metadata": {
                    "kind": "dispatch_bundle",
                    "dispatch_id": bundle["dispatch_id"],
                    "bundle_dir": bundle["bundle_dir"],
                },
                "files": [
                    {
                        "target_path": bundle["worker_launch_path"],
                        "staged_path": ".praxis/transactions/tx_recovery_001/files/00",
                        "sha256": "0" * 64,
                    }
                ],
            },
        )

        status = load_dispatch_bundle_status(repo_root=self.repo_root, bundle=bundle)

        assert status is not None
        self.assertFalse(status["available"])
        self.assertEqual(status["recovery_state"], "pending_recovery")
        self.assertEqual(status["recovery_reason_code"], "dispatch_bundle_recovery_pending")


if __name__ == "__main__":
    unittest.main()
