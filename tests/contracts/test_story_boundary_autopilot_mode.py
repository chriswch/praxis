import json
import shutil
import tempfile
import unittest
from pathlib import Path

from workflow.scripts.story_boundary import checkpoint_story_boundary


FIXTURES = Path(__file__).parent / "fixtures"


def load_json(path: Path):
    return json.loads(path.read_text())


class AutopilotStoryBoundaryContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / ".praxis" / "slices" / "S-001" / "results").mkdir(parents=True)
        (self.repo_root / ".praxis" / "slices" / "S-002" / "results").mkdir(parents=True)
        shutil.copy(FIXTURES / "autopilot_run.json", self.repo_root / ".praxis" / "run.json")
        shutil.copy(
            FIXTURES / "autopilot_story_ledger.json",
            self.repo_root / ".praxis" / "story-ledger.json",
        )
        shutil.copy(
            FIXTURES / "next_slice_result.json",
            self.repo_root / ".praxis" / "slices" / "S-001" / "results" / "verifying-and-adapting.json",
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_autopilot_checkpoints_and_activates_next_story(self) -> None:
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
                "carry_forward_context": [
                    "Autopilot should continue from durable state."
                ],
                "changed_paths": [
                    "workflow/scripts/story_boundary.py"
                ]
            },
            dirty_paths=[],
            timestamp="2026-04-11T03:00:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        handoff = load_json(self.repo_root / ".praxis" / "slices" / "S-001" / "handoff.json")

        self.assertEqual(run["execution"]["mode"], "autopilot")
        self.assertEqual(run["status"], "running")
        self.assertEqual(run["current"]["slice_id"], "S-002")
        self.assertEqual(run["current"]["stage"], "clarifying-intent")
        self.assertEqual(run["routing"]["next_action"], "run_stage")
        self.assertEqual(run["routing"]["boundary_handoff_path"], ".praxis/slices/S-001/handoff.json")
        self.assertEqual(run["slices"]["active"], "S-002")

        self.assertEqual(ledger["execution_mode"], "autopilot")
        self.assertEqual(ledger["stories"]["last_completed"], "S-001")
        self.assertEqual(ledger["stories"]["active"], "S-002")
        self.assertEqual(ledger["stories"]["items"]["S-001"]["status"], "completed")
        self.assertEqual(ledger["stories"]["items"]["S-002"]["status"], "active")
        self.assertEqual(ledger["stories"]["items"]["S-002"]["carry_forward_from"], "S-001")
        self.assertEqual(handoff["next_story_id"], "S-002")

    def test_autopilot_stops_when_a_boundary_gate_fails(self) -> None:
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
                "carry_forward_context": [],
                "changed_paths": ["workflow/scripts/story_boundary.py"],
            },
            dirty_paths=[],
            gate_failures=["test_gate_failed"],
            timestamp="2026-04-11T03:05:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")

        self.assertEqual(run["status"], "waiting_for_user")
        self.assertEqual(run["routing"]["next_action"], "ask_user")
        self.assertEqual(run["routing"]["stop_reason_code"], "test_gate_failed")
        self.assertEqual(run["current"]["slice_id"], "S-001")

        self.assertEqual(ledger["stories"]["active"], "S-001")
        self.assertEqual(ledger["stories"]["items"]["S-001"]["status"], "active")
        self.assertEqual(ledger["stories"]["items"]["S-001"]["boundary_status"], "blocked")
        self.assertEqual(
            ledger["stories"]["items"]["S-001"]["boundary_reason_code"],
            "test_gate_failed",
        )
        self.assertFalse((self.repo_root / ".praxis" / "slices" / "S-001" / "handoff.json").exists())


if __name__ == "__main__":
    unittest.main()
