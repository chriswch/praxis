import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from workflow.scripts.contract_validation import ContractValidationError
from workflow.scripts.durable_state import validate_event_log, validate_handoff_payload
from workflow.scripts.story_boundary import (
    activate_next_story_from_boundary,
    checkpoint_manual_story_boundary,
    checkpoint_story_boundary,
    resume_story_run_from_disk,
)


FIXTURES = Path(__file__).parent / "fixtures"


def load_json(path: Path):
    return json.loads(path.read_text())


class DurableBoundaryTransactionContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _prepare_autopilot_boundary(self) -> None:
        (self.repo_root / ".praxis" / "slices" / "S-001" / "results").mkdir(parents=True)
        (self.repo_root / ".praxis" / "slices" / "S-002" / "results").mkdir(parents=True)
        shutil.copy(FIXTURES / "autopilot_run.json", self.repo_root / ".praxis" / "run.json")
        shutil.copy(FIXTURES / "autopilot_story_ledger.json", self.repo_root / ".praxis" / "story-ledger.json")
        shutil.copy(
            FIXTURES / "next_slice_result.json",
            self.repo_root / ".praxis" / "slices" / "S-001" / "results" / "verifying-and-adapting.json",
        )

    def _prepare_manual_boundary(self) -> None:
        (self.repo_root / ".praxis" / "slices" / "S-001" / "results").mkdir(parents=True)
        (self.repo_root / ".praxis" / "slices" / "S-002" / "results").mkdir(parents=True)
        shutil.copy(FIXTURES / "manual_run.json", self.repo_root / ".praxis" / "run.json")
        shutil.copy(FIXTURES / "manual_story_ledger.json", self.repo_root / ".praxis" / "story-ledger.json")
        shutil.copy(
            FIXTURES / "next_slice_result.json",
            self.repo_root / ".praxis" / "slices" / "S-001" / "results" / "verifying-and-adapting.json",
        )

    def test_checkpoint_recovers_an_interrupted_boundary_transaction_on_resume(self) -> None:
        self._prepare_autopilot_boundary()

        commit_meta = {
            "start_commit": "abc1111",
            "end_commit": "def2222",
            "commits": ["abc1111", "def2222"],
        }
        handoff_data = {
            "summary": "S-001 completed.",
            "carry_forward_context": ["Resume from the staged durable transaction."],
            "changed_paths": ["workflow/scripts/story_boundary.py"],
        }

        from workflow.scripts import durable_state

        original_replace = durable_state._replace_target_with_staged_copy
        call_count = {"value": 0}

        def flaky_replace(*, repo_root: Path, staged_path: Path, target_path: Path) -> None:
            original_replace(repo_root=repo_root, staged_path=staged_path, target_path=target_path)
            call_count["value"] += 1
            if call_count["value"] == 2:
                raise OSError("simulated crash between durable file replacements")

        with self.assertRaises(OSError):
            with patch(
                "workflow.scripts.durable_state._replace_target_with_staged_copy",
                side_effect=flaky_replace,
            ):
                checkpoint_story_boundary(
                    repo_root=self.repo_root,
                    stage_result_path=Path(".praxis/slices/S-001/results/verifying-and-adapting.json"),
                    commit_meta=commit_meta,
                    handoff_data=handoff_data,
                    dirty_paths=[],
                    timestamp="2026-04-12T01:00:00Z",
                )

        self.assertTrue((self.repo_root / ".praxis" / "recovery.json").exists())

        action = resume_story_run_from_disk(
            repo_root=self.repo_root,
            timestamp="2026-04-12T01:01:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        events = [
            json.loads(line)
            for line in (self.repo_root / ".praxis" / "events.jsonl").read_text().splitlines()
            if line.strip()
        ]

        self.assertEqual(action, "resume_active")
        self.assertFalse((self.repo_root / ".praxis" / "recovery.json").exists())
        self.assertEqual(run["current"]["slice_id"], "S-002")
        self.assertEqual(run["current"]["stage"], "clarifying-intent")
        self.assertEqual(ledger["stories"]["items"]["S-001"]["status"], "completed")
        self.assertEqual(ledger["stories"]["items"]["S-002"]["status"], "active")
        self.assertEqual(events[-1]["type"], "story_activated")

    def test_activation_rejects_an_invalid_handoff_before_the_next_story_starts(self) -> None:
        self._prepare_manual_boundary()

        checkpoint_manual_story_boundary(
            repo_root=self.repo_root,
            stage_result_path=Path(".praxis/slices/S-001/results/verifying-and-adapting.json"),
            commit_meta={
                "start_commit": "abc1111",
                "end_commit": "def2222",
                "commits": ["abc1111", "def2222"],
            },
            handoff_data={
                "summary": "S-001 completed.",
                "carry_forward_context": ["Manual activation should validate the handoff first."],
                "changed_paths": ["workflow/scripts/story_boundary.py"],
            },
            dirty_paths=[],
            timestamp="2026-04-12T01:10:00Z",
        )

        handoff_path = self.repo_root / ".praxis" / "slices" / "S-001" / "handoff.json"
        handoff = load_json(handoff_path)
        handoff.pop("summary")
        handoff_path.write_text(json.dumps(handoff, indent=2) + "\n")

        with self.assertRaises(ContractValidationError):
            activate_next_story_from_boundary(
                repo_root=self.repo_root,
                timestamp="2026-04-12T01:11:00Z",
            )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")

        self.assertEqual(run["status"], "waiting_for_user")
        self.assertEqual(run["routing"]["next_action"], "confirm_then_run")
        self.assertEqual(ledger["stories"]["items"]["S-002"]["status"], "active_next")

    def test_checkpoint_writes_schema_valid_handoff_and_lifecycle_events(self) -> None:
        self._prepare_autopilot_boundary()

        checkpoint_story_boundary(
            repo_root=self.repo_root,
            stage_result_path=Path(".praxis/slices/S-001/results/verifying-and-adapting.json"),
            commit_meta={
                "start_commit": "abc1111",
                "end_commit": "def2222",
                "commits": ["abc1111", "def2222"],
            },
            handoff_data={
                "summary": "S-001 completed.",
                "carry_forward_context": ["Only validated carry-forward context should persist."],
                "changed_paths": ["workflow/scripts/story_boundary.py"],
            },
            dirty_paths=[],
            timestamp="2026-04-12T01:20:00Z",
        )

        handoff = load_json(self.repo_root / ".praxis" / "slices" / "S-001" / "handoff.json")
        events = [
            json.loads(line)
            for line in (self.repo_root / ".praxis" / "events.jsonl").read_text().splitlines()
            if line.strip()
        ]

        validate_handoff_payload(handoff)
        validate_event_log(events)
        self.assertEqual(handoff["story_id"], "S-001")
        self.assertEqual(events[0]["type"], "stage_completed")
        self.assertEqual(events[-1]["type"], "story_activated")


if __name__ == "__main__":
    unittest.main()
