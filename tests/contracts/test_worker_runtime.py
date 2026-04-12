import json
import tempfile
import unittest
from pathlib import Path

from workflow.scripts.orchestrator import initialize_run
from workflow.scripts.worker_runtime import build_worker_plan, ensure_run_vnext_defaults


def load_json(path: Path):
    return json.loads(path.read_text())


class WorkerRuntimeContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / ".praxis" / "results").mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_manual_root_clarification_uses_interactive_orchestrator(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Clarify in manual mode",
            adapter="codex",
            execution_mode="manual",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T00:00:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        plan = build_worker_plan(run)

        self.assertIsNotNone(plan)
        self.assertEqual(plan["worker_class"], "interactive_orchestrator")
        self.assertEqual(plan["worktree_mode"], "shared")
        self.assertIsNone(plan["resume_strategy"])

    def test_story_and_review_stages_use_session_worker(self) -> None:
        run = {
            "version": 4,
            "workflow": "forge",
            "status": "running",
            "entry_task": "Implement a slice",
            "mode": "multi_slice",
            "runtime": {"adapter": "codex", "entrypoint": "praxis:forge"},
            "execution": {"mode": "autopilot", "fresh_context_per_story": True},
            "current": {
                "scope": "slice",
                "slice_id": "S-003",
                "artifact_dir": ".praxis/slices/S-003",
                "stage": "rapid-implementing",
            },
            "routing": {
                "next_action": "run_stage",
                "next_stage": "rapid-implementing",
                "next_slice_id": None,
                "reason": "Continue the story worker.",
                "stop_reason_code": None,
                "boundary_handoff_path": None,
                "pending_worker_action": None,
                "resume_strategy": None,
            },
            "timestamps": {
                "created_at": "2026-04-12T00:00:00Z",
                "updated_at": "2026-04-12T00:00:00Z",
            },
        }
        ensure_run_vnext_defaults(run)

        implementing_plan = build_worker_plan(run)
        self.assertIsNotNone(implementing_plan)
        self.assertEqual(implementing_plan["worker_class"], "session_worker")
        self.assertEqual(implementing_plan["reuse_policy"], "reuse_story_worker")

        review_plan = build_worker_plan(run, stage="code-reviewing")
        self.assertIsNotNone(review_plan)
        self.assertEqual(review_plan["worker_class"], "session_worker")
        self.assertTrue(review_plan["review_independence"])
        self.assertEqual(review_plan["reuse_policy"], "none")

    def test_vnext_defaults_do_not_restore_removed_worktree_policy(self) -> None:
        run = {
            "version": 4,
            "workflow": "forge",
            "status": "running",
            "entry_task": "Check defaults",
            "mode": "single_story",
            "runtime": {"adapter": "codex"},
            "execution": {"mode": "autopilot"},
            "current": {"scope": "root", "artifact_dir": ".praxis", "stage": "clarifying-intent"},
            "routing": {
                "next_action": "run_stage",
                "next_stage": "clarifying-intent",
                "next_slice_id": None,
                "reason": "Start clarification.",
                "stop_reason_code": None,
                "boundary_handoff_path": None,
            },
            "timestamps": {
                "created_at": "2026-04-12T00:00:00Z",
                "updated_at": "2026-04-12T00:00:00Z",
            },
        }

        ensure_run_vnext_defaults(run)

        self.assertIn("policy", run)
        self.assertEqual(run["policy"]["default_permission_profile"], "planning")
        self.assertTrue(run["policy"]["require_fresh_review_worker"])
        self.assertNotIn("require_worktree_for_parallel_writes", run["policy"])


if __name__ == "__main__":
    unittest.main()
