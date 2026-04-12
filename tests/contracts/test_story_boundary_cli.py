import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


FIXTURES = Path(__file__).parent / "fixtures"
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def load_json(path: Path):
    return json.loads(path.read_text())


class StoryBoundaryCliContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / ".praxis").mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _run_cli(self, *args: str) -> dict:
        completed = subprocess.run(
            [sys.executable, "-m", "praxis.runtime.story_boundary", *args],
            cwd=PROJECT_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(completed.stdout)

    def test_cli_initializes_story_queue_from_slice_map(self) -> None:
        run = {
            "version": 3,
            "workflow": "forge",
            "status": "running",
            "entry_task": "Praxis v3 activation",
            "mode": "multi_slice",
            "runtime": {
                "adapter": "codex",
                "entrypoint": "praxis:forge",
            },
            "execution": {
                "mode": "autopilot",
                "fresh_context_per_story": True,
            },
            "current": {
                "scope": "root",
                "slice_id": None,
                "artifact_dir": ".praxis",
                "stage": "slicing-stories",
            },
            "routing": {
                "next_action": "run_stage",
                "next_stage": "slicing-stories",
                "next_slice_id": None,
                "reason": "Slice map is ready to initialize.",
                "stop_reason_code": None,
                "boundary_handoff_path": None,
            },
            "timestamps": {
                "created_at": "2026-04-12T00:00:00Z",
                "updated_at": "2026-04-12T00:00:00Z",
            },
        }
        slice_map = {
            "meta": {
                "project": "Praxis",
                "source": "Feature Brief",
                "generated_at": "2026-04-12T00:00:00Z",
                "feature_summary": "Make the v3 boundary flow live.",
                "assumptions": [],
                "open_questions": [],
            },
            "slices": [
                {
                    "id": "S-010",
                    "title": "First story",
                    "story": "As a user, I want the first story to start.",
                    "scope_in": ["Initialize the queue."],
                    "scope_out": [],
                    "sequence_rationale": "First story proves the queue starts.",
                },
                {
                    "id": "S-011",
                    "title": "Second story",
                    "story": "As a user, I want the second story queued.",
                    "scope_in": ["Queue the next story."],
                    "scope_out": [],
                    "sequence_rationale": "Second story proves ordering.",
                },
            ],
        }
        (self.repo_root / ".praxis" / "run.json").write_text(json.dumps(run, indent=2) + "\n")
        (self.repo_root / ".praxis" / "slice-map.json").write_text(json.dumps(slice_map, indent=2) + "\n")

        result = self._run_cli(
            "initialize-story-queue",
            "--repo-root",
            str(self.repo_root),
            "--slice-map-path",
            ".praxis/slice-map.json",
            "--timestamp",
            "2026-04-12T00:05:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        events = [json.loads(line) for line in (self.repo_root / ".praxis" / "events.jsonl").read_text().splitlines()]

        self.assertEqual(result["command"], "initialize-story-queue")
        self.assertEqual(result["current_slice_id"], "S-010")
        self.assertEqual(result["next_action"], "run_stage")
        self.assertEqual(run["current"]["slice_id"], "S-010")
        self.assertNotIn("slices", run)
        self.assertEqual(ledger["stories"]["order"], ["S-010", "S-011"])
        self.assertEqual(ledger["stories"]["items"]["S-010"]["status"], "active")
        self.assertEqual(events[-1]["type"], "story_queue_initialized")

    def test_cli_checkpoints_story_boundary_and_reports_state(self) -> None:
        (self.repo_root / ".praxis" / "slices" / "S-001" / "results").mkdir(parents=True)
        (self.repo_root / ".praxis" / "slices" / "S-002" / "results").mkdir(parents=True)
        shutil.copy(FIXTURES / "autopilot_run.json", self.repo_root / ".praxis" / "run.json")
        shutil.copy(FIXTURES / "autopilot_story_ledger.json", self.repo_root / ".praxis" / "story-ledger.json")
        shutil.copy(
            FIXTURES / "next_slice_result.json",
            self.repo_root / ".praxis" / "slices" / "S-001" / "results" / "verifying-and-adapting.json",
        )

        commit_meta = {
            "start_commit": "abc1111",
            "end_commit": "def2222",
            "commits": ["abc1111", "def2222"],
        }
        handoff_data = {
            "summary": "S-001 completed.",
            "carry_forward_context": ["Autopilot should continue from durable state."],
            "changed_paths": ["src/praxis/runtime/story_boundary.py"],
        }
        (self.repo_root / "commit-meta.json").write_text(json.dumps(commit_meta, indent=2) + "\n")
        (self.repo_root / "handoff-data.json").write_text(json.dumps(handoff_data, indent=2) + "\n")

        result = self._run_cli(
            "checkpoint-story-boundary",
            "--repo-root",
            str(self.repo_root),
            "--stage-result-path",
            ".praxis/slices/S-001/results/verifying-and-adapting.json",
            "--commit-meta-path",
            str(self.repo_root / "commit-meta.json"),
            "--handoff-data-path",
            str(self.repo_root / "handoff-data.json"),
            "--timestamp",
            "2026-04-12T00:10:00Z",
        )

        self.assertEqual(result["command"], "checkpoint-story-boundary")
        self.assertEqual(result["run_status"], "running")
        self.assertEqual(result["current_slice_id"], "S-002")
        self.assertEqual(result["next_action"], "run_stage")
        self.assertEqual(result["boundary_handoff_path"], ".praxis/slices/S-001/handoff.json")


if __name__ == "__main__":
    unittest.main()
