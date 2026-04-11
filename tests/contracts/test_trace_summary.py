import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class TraceSummaryContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / ".praxis").mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_show_run_reports_dispatch_and_latest_trace_signals(self) -> None:
        run = {
            "version": 3,
            "workflow": "forge",
            "status": "waiting_for_user",
            "entry_task": "Inspect traces",
            "mode": "multi_slice",
            "runtime": {
                "adapter": "codex",
                "entrypoint": "praxis:forge"
            },
            "execution": {
                "mode": "autopilot",
                "fresh_context_per_story": True
            },
            "current": {
                "scope": "slice",
                "slice_id": "S-002",
                "artifact_dir": ".praxis/slices/S-002",
                "stage": "clarifying-intent"
            },
            "routing": {
                "next_action": "ask_user",
                "next_stage": "clarifying-intent",
                "next_slice_id": None,
                "reason": "Autopilot paused for user input.",
                "stop_reason_code": "needs_user_input",
                "boundary_handoff_path": ".praxis/slices/S-001/handoff.json"
            },
            "timestamps": {
                "created_at": "2026-04-12T00:00:00Z",
                "updated_at": "2026-04-12T00:00:00Z"
            }
        }
        events = [
            {
                "ts": "2026-04-12T00:10:00Z",
                "type": "boundary_checkpointed",
                "slice_id": "S-001",
                "next_slice_id": "S-002",
                "handoff_path": ".praxis/slices/S-001/handoff.json"
            },
            {
                "ts": "2026-04-12T00:11:00Z",
                "type": "autopilot_stopped",
                "slice_id": "S-002",
                "stage": "clarifying-intent",
                "reason_code": "needs_user_input",
                "reason": "Autopilot paused for user input.",
                "next_stage": "clarifying-intent"
            }
        ]

        (self.repo_root / ".praxis" / "run.json").write_text(json.dumps(run, indent=2) + "\n")
        (self.repo_root / ".praxis" / "events.jsonl").write_text("\n".join(json.dumps(event) for event in events) + "\n")

        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "workflow.scripts.orchestrator",
                "show-run",
                "--repo-root",
                str(self.repo_root),
            ],
            cwd=PROJECT_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        result = json.loads(completed.stdout)
        self.assertEqual(result["trace"]["dispatch"]["stage"], "clarifying-intent")
        self.assertEqual(result["trace"]["last_boundary_event"]["type"], "boundary_checkpointed")
        self.assertEqual(result["trace"]["last_stop_event"]["reason_code"], "needs_user_input")
        self.assertEqual(result["trace"]["stop_reason_code"], "needs_user_input")


if __name__ == "__main__":
    unittest.main()
