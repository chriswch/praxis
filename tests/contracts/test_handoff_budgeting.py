import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from praxis.runtime.handoff_policy import HANDOFF_POLICY
from praxis.runtime.story_boundary import checkpoint_manual_story_boundary, checkpoint_story_boundary


FIXTURES = Path(__file__).parent / "fixtures"
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def load_json(path: Path):
    return json.loads(path.read_text())


class HandoffBudgetingContractTest(unittest.TestCase):
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

    def _run_orchestrator_cli(self, *args: str) -> dict:
        completed = subprocess.run(
            [sys.executable, "-m", "praxis.runtime.orchestrator", *args],
            cwd=PROJECT_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(completed.stdout)

    def test_boundary_compacts_handoff_within_policy(self) -> None:
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
                "summary": "S" * (HANDOFF_POLICY["max_summary_chars"] + 120),
                "carry_forward_context": [
                    f"Carry forward item {index}" for index in range(HANDOFF_POLICY["max_carry_forward_items"] + 3)
                ],
                "changed_paths": [
                    f"src/praxis/runtime/file_{index}.py" for index in range(HANDOFF_POLICY["max_changed_paths"] + 4)
                ],
            },
            dirty_paths=[],
            timestamp="2026-04-12T02:00:00Z",
        )

        handoff = load_json(self.repo_root / ".praxis" / "slices" / "S-001" / "handoff.json")

        self.assertTrue(handoff["compaction"]["applied"])
        self.assertTrue(handoff["compaction"]["summary_truncated"])
        self.assertGreater(handoff["compaction"]["carry_forward_items_dropped"], 0)
        self.assertGreater(handoff["compaction"]["changed_paths_dropped"], 0)
        self.assertLessEqual(handoff["metrics"]["summary_chars"], HANDOFF_POLICY["max_summary_chars"])
        self.assertLessEqual(
            handoff["metrics"]["carry_forward_items"],
            HANDOFF_POLICY["max_carry_forward_items"],
        )
        self.assertLessEqual(
            handoff["metrics"]["changed_paths"],
            HANDOFF_POLICY["max_changed_paths"],
        )
        self.assertLessEqual(
            handoff["metrics"]["serialized_bytes"],
            HANDOFF_POLICY["max_serialized_bytes"],
        )
        self.assertEqual(handoff["validation"], {"schema_valid": True, "within_budget": True})

    def test_boundary_blocks_when_required_context_cannot_fit_budget(self) -> None:
        self._prepare_manual_boundary()

        required_context = [f"Required context {index}: " + ("X" * 1700) for index in range(3)]
        checkpoint_manual_story_boundary(
            repo_root=self.repo_root,
            stage_result_path=Path(".praxis/slices/S-001/results/verifying-and-adapting.json"),
            commit_meta={
                "start_commit": "abc1111",
                "end_commit": "def2222",
                "commits": ["abc1111", "def2222"],
            },
            handoff_data={
                "summary": "Compact only what is optional.",
                "carry_forward_context": required_context,
                "required_context": required_context,
                "changed_paths": ["src/praxis/runtime/story_boundary.py"],
            },
            dirty_paths=[],
            timestamp="2026-04-12T02:05:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")

        self.assertEqual(run["status"], "waiting_for_user")
        self.assertEqual(run["routing"]["stop_reason_code"], "handoff_required_context_overflow")
        self.assertEqual(ledger["stories"]["items"]["S-001"]["boundary_status"], "blocked")
        self.assertEqual(
            ledger["stories"]["items"]["S-001"]["boundary_reason_code"],
            "handoff_required_context_overflow",
        )
        self.assertFalse((self.repo_root / ".praxis" / "slices" / "S-001" / "handoff.json").exists())

    def test_show_run_reports_handoff_budget_status(self) -> None:
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
                "carry_forward_context": ["Keep the next story context compact and validated."],
                "changed_paths": ["src/praxis/runtime/story_boundary.py"],
            },
            dirty_paths=[],
            timestamp="2026-04-12T02:10:00Z",
        )

        result = self._run_orchestrator_cli(
            "show-run",
            "--repo-root",
            str(self.repo_root),
        )

        self.assertIn("handoff_status", result)
        self.assertTrue(result["handoff_status"]["schema_valid"])
        self.assertTrue(result["handoff_status"]["within_budget"])
        self.assertEqual(result["handoff_status"]["story_id"], "S-001")
        self.assertEqual(result["handoff_status"]["next_story_id"], "S-002")
        self.assertLessEqual(
            result["handoff_status"]["serialized_bytes"],
            HANDOFF_POLICY["max_serialized_bytes"],
        )

    def test_resume_run_reports_handoff_budget_status(self) -> None:
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
                "carry_forward_context": ["Resume should show the validated handoff budget."],
                "changed_paths": ["src/praxis/runtime/story_boundary.py"],
            },
            dirty_paths=[],
            timestamp="2026-04-12T02:15:00Z",
        )

        result = self._run_orchestrator_cli(
            "resume-run",
            "--repo-root",
            str(self.repo_root),
            "--timestamp",
            "2026-04-12T02:16:00Z",
        )

        self.assertEqual(result["transition_action"], "resume_manual_wait")
        self.assertIn("handoff_status", result)
        self.assertTrue(result["handoff_status"]["schema_valid"])
        self.assertTrue(result["handoff_status"]["within_budget"])
        self.assertEqual(result["handoff_status"]["next_story_id"], "S-002")


if __name__ == "__main__":
    unittest.main()
