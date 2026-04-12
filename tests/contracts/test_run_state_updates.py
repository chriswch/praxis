import json
import tempfile
import unittest
from pathlib import Path

from praxis.runtime.run_state import update_run_from_stage_result


def load_json(path: Path):
    return json.loads(path.read_text())


class RunStateUpdateContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / ".praxis" / "results").mkdir(parents=True)
        (self.repo_root / ".praxis" / "slices" / "S-001" / "results").mkdir(parents=True)
        (self.repo_root / ".praxis" / "slices" / "S-002" / "results").mkdir(parents=True)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write_run(self, payload: dict) -> None:
        (self.repo_root / ".praxis" / "run.json").write_text(json.dumps(payload, indent=2) + "\n")

    def _write_stage_result(self, rel_path: str, payload: dict) -> Path:
        path = self.repo_root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2) + "\n")
        return Path(rel_path)

    def test_updates_forge_run_with_shared_next_stage_and_confirmation_pause(self) -> None:
        self._write_run(
            {
                "version": 3,
                "workflow": "forge",
                "status": "running",
                "entry_task": "Clarify before implementation",
                "mode": "single_story",
                "runtime": {
                    "adapter": "codex",
                    "entrypoint": "praxis:forge",
                },
                "execution": {
                    "mode": "autopilot",
                },
                "current": {
                    "scope": "root",
                    "slice_id": None,
                    "artifact_dir": ".praxis",
                    "stage": "clarifying-intent",
                },
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
        )
        stage_result_path = self._write_stage_result(
            ".praxis/results/clarifying-intent.json",
            {
                "version": 2,
                "stage": "clarifying-intent",
                "artifact_dir": ".praxis",
                "status": "completed",
                "summary_path": ".praxis/spec.md",
                "artifacts_written": [".praxis/spec.md"],
                "route": {
                    "kind": "proceed",
                    "next_stage": None,
                    "next_slice_id": None,
                    "reason": "Story spec is ready for design.",
                },
                "data": {
                    "outcome_code": "story_spec_ready",
                },
                "needs_user_input": False,
                "needs_confirmation": True,
            },
        )

        action = update_run_from_stage_result(
            repo_root=self.repo_root,
            stage_result_path=stage_result_path,
            timestamp="2026-04-12T00:05:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")

        self.assertEqual(action, "confirm_then_run")
        self.assertEqual(run["status"], "waiting_for_user")
        self.assertEqual(run["current"]["stage"], "sketching-design")
        self.assertEqual(run["routing"]["next_action"], "confirm_then_run")
        self.assertEqual(run["routing"]["next_stage"], "sketching-design")
        self.assertIsNone(run["routing"]["stop_reason_code"])

    def test_updates_craft_run_stage_in_autopilot_from_shared_routing(self) -> None:
        self._write_run(
            {
                "version": 3,
                "workflow": "craft",
                "status": "running",
                "entry_task": "Continue craft",
                "mode": "single_story",
                "runtime": {
                    "adapter": "codex",
                    "entrypoint": "praxis:craft",
                },
                "execution": {
                    "mode": "autopilot",
                },
                "current": {
                    "scope": "root",
                    "slice_id": None,
                    "artifact_dir": ".praxis",
                    "stage": "sketching-design",
                },
                "routing": {
                    "next_action": "run_stage",
                    "next_stage": "sketching-design",
                    "next_slice_id": None,
                    "reason": "Sketch in progress.",
                    "stop_reason_code": None,
                    "boundary_handoff_path": None,
                },
                "timestamps": {
                    "created_at": "2026-04-12T00:00:00Z",
                    "updated_at": "2026-04-12T00:00:00Z",
                },
            }
        )
        stage_result_path = self._write_stage_result(
            ".praxis/results/sketching-design.json",
            {
                "version": 2,
                "stage": "sketching-design",
                "artifact_dir": ".praxis",
                "status": "completed",
                "summary_path": ".praxis/sketch.md",
                "artifacts_written": [".praxis/sketch.md"],
                "route": {
                    "kind": "proceed",
                    "next_stage": None,
                    "next_slice_id": None,
                    "reason": "Sketch is ready.",
                },
                "data": {
                    "outcome_code": "sketch_ready",
                },
                "needs_user_input": False,
                "needs_confirmation": False,
            },
        )

        action = update_run_from_stage_result(
            repo_root=self.repo_root,
            stage_result_path=stage_result_path,
            timestamp="2026-04-12T00:10:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")

        self.assertEqual(action, "run_stage")
        self.assertEqual(run["status"], "running")
        self.assertEqual(run["current"]["stage"], "driving-tdd")
        self.assertEqual(run["routing"]["next_action"], "run_stage")
        self.assertEqual(run["routing"]["next_stage"], "driving-tdd")

    def test_clears_story_boundary_handoff_after_next_story_clarification_advances(self) -> None:
        self._write_run(
            {
                "version": 3,
                "workflow": "forge",
                "status": "running",
                "entry_task": "Clarify next slice from handoff",
                "mode": "multi_slice",
                "runtime": {
                    "adapter": "codex",
                    "entrypoint": "praxis:forge",
                },
                "execution": {
                    "mode": "autopilot",
                },
                "current": {
                    "scope": "slice",
                    "slice_id": "S-002",
                    "artifact_dir": ".praxis/slices/S-002",
                    "stage": "clarifying-intent",
                },
                "routing": {
                    "next_action": "run_stage",
                    "next_stage": "clarifying-intent",
                    "next_slice_id": None,
                    "reason": "S-002 is active from the last boundary.",
                    "stop_reason_code": None,
                    "boundary_handoff_path": ".praxis/slices/S-001/handoff.json",
                },
                "timestamps": {
                    "created_at": "2026-04-12T00:00:00Z",
                    "updated_at": "2026-04-12T00:00:00Z",
                },
            }
        )
        stage_result_path = self._write_stage_result(
            ".praxis/slices/S-002/results/clarifying-intent.json",
            {
                "version": 2,
                "stage": "clarifying-intent",
                "artifact_dir": ".praxis/slices/S-002",
                "status": "completed",
                "summary_path": ".praxis/slices/S-002/spec.md",
                "artifacts_written": [".praxis/slices/S-002/spec.md"],
                "route": {
                    "kind": "proceed",
                    "next_stage": None,
                    "next_slice_id": None,
                    "reason": "S-002 is clarified and ready for design.",
                },
                "data": {
                    "outcome_code": "story_spec_ready",
                },
                "needs_user_input": False,
                "needs_confirmation": False,
            },
        )

        action = update_run_from_stage_result(
            repo_root=self.repo_root,
            stage_result_path=stage_result_path,
            timestamp="2026-04-12T00:12:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")

        self.assertEqual(action, "confirm_then_run")
        self.assertEqual(run["current"]["stage"], "sketching-design")
        self.assertEqual(run["routing"]["next_stage"], "sketching-design")
        self.assertIsNone(run["routing"]["boundary_handoff_path"])

    def test_preserves_story_boundary_handoff_while_clarification_reasks_user(self) -> None:
        self._write_run(
            {
                "version": 3,
                "workflow": "forge",
                "status": "running",
                "entry_task": "Clarify next slice from handoff",
                "mode": "multi_slice",
                "runtime": {
                    "adapter": "codex",
                    "entrypoint": "praxis:forge",
                },
                "execution": {
                    "mode": "autopilot",
                },
                "current": {
                    "scope": "slice",
                    "slice_id": "S-002",
                    "artifact_dir": ".praxis/slices/S-002",
                    "stage": "clarifying-intent",
                },
                "routing": {
                    "next_action": "run_stage",
                    "next_stage": "clarifying-intent",
                    "next_slice_id": None,
                    "reason": "S-002 is active from the last boundary.",
                    "stop_reason_code": None,
                    "boundary_handoff_path": ".praxis/slices/S-001/handoff.json",
                },
                "timestamps": {
                    "created_at": "2026-04-12T00:00:00Z",
                    "updated_at": "2026-04-12T00:00:00Z",
                },
            }
        )
        stage_result_path = self._write_stage_result(
            ".praxis/slices/S-002/results/clarifying-intent.json",
            {
                "version": 2,
                "stage": "clarifying-intent",
                "artifact_dir": ".praxis/slices/S-002",
                "status": "blocked",
                "summary_path": ".praxis/slices/S-002/spec.md",
                "artifacts_written": [".praxis/slices/S-002/spec.md"],
                "route": {
                    "kind": "ask_user",
                    "next_stage": None,
                    "next_slice_id": None,
                    "reason": "Need one more clarification before finalizing S-002.",
                },
                "data": {
                    "outcome_code": "clarification_needed",
                },
                "needs_user_input": True,
                "needs_confirmation": False,
            },
        )

        action = update_run_from_stage_result(
            repo_root=self.repo_root,
            stage_result_path=stage_result_path,
            timestamp="2026-04-12T00:13:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")

        self.assertEqual(action, "ask_user")
        self.assertEqual(run["current"]["stage"], "clarifying-intent")
        self.assertEqual(run["routing"]["next_stage"], "clarifying-intent")
        self.assertEqual(
            run["routing"]["boundary_handoff_path"],
            ".praxis/slices/S-001/handoff.json",
        )

    def test_finishes_single_story_run_when_stage_result_is_terminal(self) -> None:
        self._write_run(
            {
                "version": 3,
                "workflow": "forge",
                "status": "running",
                "entry_task": "Trivial fix",
                "mode": "single_story",
                "runtime": {
                    "adapter": "codex",
                    "entrypoint": "praxis:forge",
                },
                "execution": {
                    "mode": "manual",
                },
                "current": {
                    "scope": "root",
                    "slice_id": None,
                    "artifact_dir": ".praxis",
                    "stage": "clarifying-intent",
                },
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
        )
        stage_result_path = self._write_stage_result(
            ".praxis/results/clarifying-intent.json",
            {
                "version": 2,
                "stage": "clarifying-intent",
                "artifact_dir": ".praxis",
                "status": "skipped",
                "summary_path": None,
                "artifacts_written": [],
                "route": {
                    "kind": "done",
                    "next_stage": None,
                    "next_slice_id": None,
                    "reason": "Trivial change is ready to finish.",
                },
                "data": {
                    "outcome_code": "trivial_change",
                },
                "needs_user_input": False,
                "needs_confirmation": False,
            },
        )

        action = update_run_from_stage_result(
            repo_root=self.repo_root,
            stage_result_path=stage_result_path,
            timestamp="2026-04-12T00:15:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")

        self.assertEqual(action, "finish")
        self.assertEqual(run["status"], "completed")
        self.assertIsNone(run["current"]["stage"])
        self.assertEqual(run["routing"]["next_action"], "finish")
        self.assertIsNone(run["routing"]["next_stage"])

    def test_rejects_multi_slice_story_completion_that_requires_boundary_helper(self) -> None:
        self._write_run(
            {
                "version": 3,
                "workflow": "forge",
                "status": "running",
                "entry_task": "Complete story",
                "mode": "multi_slice",
                "runtime": {
                    "adapter": "codex",
                    "entrypoint": "praxis:forge",
                },
                "execution": {
                    "mode": "autopilot",
                },
                "current": {
                    "scope": "slice",
                    "slice_id": "S-001",
                    "artifact_dir": ".praxis/slices/S-001",
                    "stage": "code-improving",
                },
                "routing": {
                    "next_action": "run_stage",
                    "next_stage": "code-improving",
                    "next_slice_id": None,
                    "reason": "Finish improvements.",
                    "stop_reason_code": None,
                    "boundary_handoff_path": None,
                },
                "timestamps": {
                    "created_at": "2026-04-12T00:00:00Z",
                    "updated_at": "2026-04-12T00:00:00Z",
                },
            }
        )
        stage_result_path = self._write_stage_result(
            ".praxis/slices/S-001/results/code-improving.json",
            {
                "version": 2,
                "stage": "code-improving",
                "artifact_dir": ".praxis/slices/S-001",
                "status": "completed",
                "summary_path": ".praxis/slices/S-001/improvement.md",
                "artifacts_written": [".praxis/slices/S-001/improvement.md"],
                "route": {
                    "kind": "proceed",
                    "next_stage": None,
                    "next_slice_id": None,
                    "reason": "Story is complete after improvements.",
                },
                "data": {
                    "outcome_code": "improvement_ready",
                },
                "needs_user_input": False,
                "needs_confirmation": False,
            },
        )

        with self.assertRaisesRegex(ValueError, "story_boundary"):
            update_run_from_stage_result(
                repo_root=self.repo_root,
                stage_result_path=stage_result_path,
                timestamp="2026-04-12T00:20:00Z",
            )


if __name__ == "__main__":
    unittest.main()
