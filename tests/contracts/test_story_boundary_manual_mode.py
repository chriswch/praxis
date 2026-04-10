import json
import shutil
import tempfile
import unittest
from pathlib import Path

from workflow.scripts.story_boundary import (
    activate_next_story_from_boundary,
    checkpoint_manual_story_boundary,
)


FIXTURES = Path(__file__).parent / "fixtures"


def load_json(path: Path):
    return json.loads(path.read_text())


class ManualStoryBoundaryContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / ".praxis" / "slices" / "S-001" / "results").mkdir(parents=True)
        (self.repo_root / ".praxis" / "slices" / "S-002" / "results").mkdir(parents=True)
        shutil.copy(FIXTURES / "manual_run.json", self.repo_root / ".praxis" / "run.json")
        shutil.copy(
            FIXTURES / "manual_story_ledger.json",
            self.repo_root / ".praxis" / "story-ledger.json",
        )
        shutil.copy(
            FIXTURES / "next_slice_result.json",
            self.repo_root / ".praxis" / "slices" / "S-001" / "results" / "verifying-and-adapting.json",
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_checkpoints_completed_story_and_arms_next_story_in_manual_mode(self) -> None:
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
                "carry_forward_context": [
                    "Execution mode is modeled separately from workflow and story shape."
                ],
                "changed_paths": [
                    "workflow/contracts/run.schema.json",
                    "workflow/contracts/story-ledger.schema.json"
                ]
            },
            dirty_paths=[],
            timestamp="2026-04-10T18:00:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        handoff = load_json(self.repo_root / ".praxis" / "slices" / "S-001" / "handoff.json")

        self.assertEqual(run["execution"]["mode"], "manual")
        self.assertEqual(run["mode"], "multi_slice")
        self.assertEqual(run["current"]["slice_id"], "S-002")
        self.assertEqual(run["current"]["stage"], "clarifying-intent")
        self.assertEqual(run["routing"]["next_action"], "confirm_then_run")
        self.assertEqual(run["routing"]["next_stage"], "clarifying-intent")
        self.assertEqual(run["status"], "waiting_for_user")

        self.assertEqual(ledger["stories"]["last_completed"], "S-001")
        self.assertEqual(ledger["stories"]["active"], "S-002")
        self.assertEqual(ledger["stories"]["items"]["S-001"]["status"], "completed")
        self.assertEqual(ledger["stories"]["items"]["S-002"]["status"], "active_next")
        self.assertEqual(
            ledger["stories"]["items"]["S-001"]["handoff_path"],
            ".praxis/slices/S-001/handoff.json",
        )
        self.assertEqual(handoff["story_id"], "S-001")
        self.assertEqual(handoff["next_story_id"], "S-002")
        self.assertEqual(handoff["commit_meta"]["end_commit"], "def2222")

    def test_activates_next_story_from_boundary_after_confirmation(self) -> None:
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
                "carry_forward_context": [
                    "Execution mode is modeled separately from workflow and story shape."
                ],
                "changed_paths": [
                    "workflow/contracts/run.schema.json"
                ]
            },
            dirty_paths=[],
            timestamp="2026-04-10T18:00:00Z",
        )

        activate_next_story_from_boundary(
            repo_root=self.repo_root,
            timestamp="2026-04-10T18:05:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")

        self.assertEqual(run["status"], "running")
        self.assertEqual(run["current"]["slice_id"], "S-002")
        self.assertEqual(run["current"]["stage"], "clarifying-intent")
        self.assertEqual(run["routing"]["next_action"], "run_stage")
        self.assertEqual(run["routing"]["next_stage"], "clarifying-intent")

        self.assertEqual(ledger["stories"]["active"], "S-002")
        self.assertEqual(ledger["stories"]["items"]["S-002"]["status"], "active")
        self.assertEqual(ledger["stories"]["items"]["S-002"]["carry_forward_from"], "S-001")

    def test_blocks_boundary_when_product_worktree_is_dirty(self) -> None:
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
                "carry_forward_context": [],
                "changed_paths": ["README.md"],
            },
            dirty_paths=["README.md"],
            timestamp="2026-04-10T18:10:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")

        self.assertEqual(run["status"], "waiting_for_user")
        self.assertEqual(run["routing"]["next_action"], "ask_user")
        self.assertIsNone(run["routing"]["next_stage"])
        self.assertIsNone(run["routing"]["next_slice_id"])
        self.assertEqual(run["current"]["slice_id"], "S-001")

        self.assertEqual(ledger["stories"]["active"], "S-001")
        self.assertEqual(ledger["stories"]["last_completed"], None)
        self.assertEqual(ledger["stories"]["items"]["S-001"]["status"], "active")
        self.assertEqual(ledger["stories"]["items"]["S-001"]["boundary_status"], "blocked")
        self.assertIn("Dirty product worktree", ledger["stories"]["items"]["S-001"]["boundary_reason"])
        self.assertFalse((self.repo_root / ".praxis" / "slices" / "S-001" / "handoff.json").exists())

    def test_finishes_run_when_last_story_completes(self) -> None:
        shutil.copy(
            FIXTURES / "final_done_result.json",
            self.repo_root / ".praxis" / "slices" / "S-001" / "results" / "verifying-and-adapting.json",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        run["slices"]["order"] = ["S-001"]
        run["slices"]["active"] = "S-001"
        (self.repo_root / ".praxis" / "run.json").write_text(json.dumps(run, indent=2) + "\n")

        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        ledger["stories"]["order"] = ["S-001"]
        ledger["stories"]["items"].pop("S-002", None)
        ledger["stories"]["active"] = "S-001"
        (self.repo_root / ".praxis" / "story-ledger.json").write_text(json.dumps(ledger, indent=2) + "\n")

        checkpoint_manual_story_boundary(
            repo_root=self.repo_root,
            stage_result_path=Path(".praxis/slices/S-001/results/verifying-and-adapting.json"),
            commit_meta={
                "start_commit": "abc1111",
                "end_commit": "def2222",
                "commits": ["abc1111", "def2222"],
            },
            handoff_data={
                "summary": "Final story completed.",
                "carry_forward_context": [],
                "changed_paths": ["workflow/pipelines/craft.md"],
            },
            dirty_paths=[],
            timestamp="2026-04-10T18:15:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        handoff = load_json(self.repo_root / ".praxis" / "slices" / "S-001" / "handoff.json")

        self.assertEqual(run["status"], "completed")
        self.assertEqual(run["routing"]["next_action"], "finish")
        self.assertIsNone(run["routing"]["next_stage"])
        self.assertEqual(run["current"]["slice_id"], "S-001")
        self.assertIsNone(run["current"]["stage"])

        self.assertIsNone(ledger["stories"]["active"])
        self.assertEqual(ledger["stories"]["last_completed"], "S-001")
        self.assertEqual(ledger["stories"]["items"]["S-001"]["status"], "completed")
        self.assertEqual(handoff["next_story_id"], None)


if __name__ == "__main__":
    unittest.main()
