import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from praxis.runtime.story_boundary import checkpoint_story_boundary


FIXTURES = Path(__file__).parent / "fixtures"
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def load_json(path: Path):
    return json.loads(path.read_text())


class GitBoundaryVerificationContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / ".praxis" / "slices" / "S-001" / "results").mkdir(parents=True)
        (self.repo_root / ".praxis" / "slices" / "S-002" / "results").mkdir(parents=True)
        shutil.copy(FIXTURES / "autopilot_run.json", self.repo_root / ".praxis" / "run.json")
        shutil.copy(FIXTURES / "autopilot_story_ledger.json", self.repo_root / ".praxis" / "story-ledger.json")
        shutil.copy(
            FIXTURES / "next_slice_result.json",
            self.repo_root / ".praxis" / "slices" / "S-001" / "results" / "verifying-and-adapting.json",
        )
        self._git("init")
        self._git("config", "user.name", "Praxis Test")
        self._git("config", "user.email", "praxis@example.com")
        self._git("config", "commit.gpgsign", "false")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _git(self, *args: str) -> str:
        completed = subprocess.run(
            ["git", *args],
            cwd=self.repo_root,
            check=True,
            capture_output=True,
            text=True,
        )
        return completed.stdout.strip()

    def _write_product_commit(self, filename: str, content: str, message: str) -> str:
        path = self.repo_root / filename
        path.write_text(content)
        self._git("add", filename)
        self._git("commit", "-m", message)
        return self._git("rev-parse", "HEAD")

    def _set_story_start_commit(self, start_commit: str) -> None:
        ledger_path = self.repo_root / ".praxis" / "story-ledger.json"
        ledger = load_json(ledger_path)
        ledger["stories"]["items"]["S-001"]["commit_meta"] = {
            "start_commit": start_commit,
            "worktree": {
                "mode": "in_place",
                "path": str(self.repo_root),
                "branch": "main",
            },
        }
        ledger_path.write_text(json.dumps(ledger, indent=2) + "\n")

    def test_checkpoint_collects_verified_git_boundary_evidence(self) -> None:
        start_commit = self._write_product_commit("app.txt", "before\n", "Seed first story boundary")
        end_commit = self._write_product_commit("app.txt", "after\n", "Advance first story boundary")
        self._set_story_start_commit(start_commit)

        checkpoint_story_boundary(
            repo_root=self.repo_root,
            stage_result_path=Path(".praxis/slices/S-001/results/verifying-and-adapting.json"),
            commit_meta=None,
            handoff_data={
                "summary": "S-001 completed.",
                "carry_forward_context": ["Use verified git evidence for S-002."],
                "changed_paths": ["placeholder.txt"],
            },
            dirty_paths=None,
            timestamp="2026-04-12T02:00:00Z",
        )

        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        handoff = load_json(self.repo_root / ".praxis" / "slices" / "S-001" / "handoff.json")

        self.assertEqual(ledger["stories"]["items"]["S-001"]["commit_meta"]["start_commit"], start_commit)
        self.assertEqual(ledger["stories"]["items"]["S-001"]["commit_meta"]["end_commit"], end_commit)
        self.assertEqual(ledger["stories"]["items"]["S-001"]["commit_meta"]["changed_paths"], ["app.txt"])
        self.assertEqual(handoff["commit_meta"]["end_commit"], end_commit)
        self.assertEqual(handoff["changed_paths"], ["app.txt"])

    def test_checkpoint_blocks_zero_delta_boundary_from_real_git_evidence(self) -> None:
        start_commit = self._write_product_commit("app.txt", "stable\n", "Seed zero-delta boundary")
        self._set_story_start_commit(start_commit)

        checkpoint_story_boundary(
            repo_root=self.repo_root,
            stage_result_path=Path(".praxis/slices/S-001/results/verifying-and-adapting.json"),
            commit_meta=None,
            handoff_data={
                "summary": "S-001 completed.",
                "carry_forward_context": [],
                "changed_paths": [],
            },
            dirty_paths=None,
            timestamp="2026-04-12T02:05:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")

        self.assertEqual(run["status"], "waiting_for_user")
        self.assertEqual(run["routing"]["stop_reason_code"], "zero_delta_checkpoint")
        self.assertEqual(ledger["stories"]["items"]["S-001"]["boundary_status"], "blocked")
        self.assertEqual(ledger["stories"]["items"]["S-001"]["boundary_reason_code"], "zero_delta_checkpoint")
        self.assertFalse((self.repo_root / ".praxis" / "slices" / "S-001" / "handoff.json").exists())

    def test_cli_checkpoint_auto_collects_git_boundary_evidence(self) -> None:
        start_commit = self._write_product_commit("service.py", "before = 1\n", "Seed CLI git boundary")
        end_commit = self._write_product_commit("service.py", "before = 2\n", "Advance CLI git boundary")
        self._set_story_start_commit(start_commit)

        handoff_data = {
            "summary": "S-001 completed.",
            "carry_forward_context": ["CLI should collect git evidence automatically."],
            "changed_paths": [],
        }
        handoff_data_path = self.repo_root / ".praxis" / "handoff-data.json"
        handoff_data_path.write_text(json.dumps(handoff_data, indent=2) + "\n")

        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "praxis.runtime.story_boundary",
                "checkpoint-story-boundary",
                "--repo-root",
                str(self.repo_root),
                "--stage-result-path",
                ".praxis/slices/S-001/results/verifying-and-adapting.json",
                "--handoff-data-path",
                str(handoff_data_path),
                "--timestamp",
                "2026-04-12T02:10:00Z",
            ],
            cwd=PROJECT_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        result = json.loads(completed.stdout)
        handoff = load_json(self.repo_root / ".praxis" / "slices" / "S-001" / "handoff.json")

        self.assertEqual(result["run_status"], "running")
        self.assertEqual(result["current_slice_id"], "S-002")
        self.assertEqual(handoff["commit_meta"]["start_commit"], start_commit)
        self.assertEqual(handoff["commit_meta"]["end_commit"], end_commit)
        self.assertEqual(handoff["changed_paths"], ["service.py"])


if __name__ == "__main__":
    unittest.main()
