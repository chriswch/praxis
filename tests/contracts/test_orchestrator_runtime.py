import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from workflow.scripts.orchestrator import (
    advance_run,
    continue_run,
    initialize_run,
    resume_run,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def load_json(path: Path):
    return json.loads(path.read_text())


class OrchestratorRuntimeContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / ".praxis" / "results").mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write_json(self, rel_path: str, payload: dict) -> None:
        path = self.repo_root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2) + "\n")

    def test_initialize_run_starts_at_root_clarification(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Build the orchestrator entrypoint",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T00:00:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")

        self.assertEqual(run["workflow"], "forge")
        self.assertEqual(run["status"], "running")
        self.assertEqual(run["mode"], "single_story")
        self.assertEqual(run["execution"]["mode"], "autopilot")
        self.assertEqual(run["current"]["scope"], "root")
        self.assertEqual(run["current"]["artifact_dir"], ".praxis")
        self.assertEqual(run["current"]["stage"], "clarifying-intent")
        self.assertEqual(run["routing"]["next_action"], "run_stage")
        self.assertEqual(run["routing"]["next_stage"], "clarifying-intent")
        self.assertTrue((self.repo_root / ".praxis" / "results").exists())

    def test_advance_run_updates_a_single_story_stage_result(self) -> None:
        self._write_json(
            ".praxis/run.json",
            {
                "version": 3,
                "workflow": "forge",
                "status": "running",
                "entry_task": "Advance one stage",
                "mode": "single_story",
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
            },
        )
        self._write_json(
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

        action = advance_run(
            repo_root=self.repo_root,
            stage_result_path=Path(".praxis/results/sketching-design.json"),
            slice_map_path=Path(".praxis/slice-map.json"),
            commit_meta=None,
            handoff_data=None,
            dirty_paths=None,
            gate_failures=None,
            cancel_requested=False,
            timestamp="2026-04-12T00:05:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")

        self.assertEqual(action, "run_stage")
        self.assertEqual(run["status"], "running")
        self.assertEqual(run["current"]["stage"], "rapid-implementing")
        self.assertEqual(run["routing"]["next_action"], "run_stage")
        self.assertEqual(run["routing"]["next_stage"], "rapid-implementing")

    def test_advance_run_initializes_the_story_queue_after_slicing(self) -> None:
        self._write_json(
            ".praxis/run.json",
            {
                "version": 3,
                "workflow": "forge",
                "status": "running",
                "entry_task": "Queue the feature slices",
                "mode": "single_story",
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
                    "reason": "Slice map is ready to route.",
                    "stop_reason_code": None,
                    "boundary_handoff_path": None,
                },
                "timestamps": {
                    "created_at": "2026-04-12T00:00:00Z",
                    "updated_at": "2026-04-12T00:00:00Z",
                },
            },
        )
        self._write_json(
            ".praxis/slice-map.json",
            {
                "meta": {
                    "project": "Praxis",
                    "source": "Feature Brief",
                    "generated_at": "2026-04-12T00:00:00Z",
                    "feature_summary": "Queue the next slice automatically.",
                    "assumptions": [],
                    "open_questions": [],
                },
                "slices": [
                    {
                        "id": "S-001",
                        "title": "First slice",
                        "story": "As a user, I want the first slice.",
                        "scope_in": ["Start the queue."],
                        "scope_out": [],
                        "sequence_rationale": "Bootstraps the queue.",
                    },
                    {
                        "id": "S-002",
                        "title": "Second slice",
                        "story": "As a user, I want the second slice.",
                        "scope_in": ["Continue after S-001."],
                        "scope_out": [],
                        "sequence_rationale": "Follows the first slice.",
                    },
                ],
            },
        )
        self._write_json(
            ".praxis/results/slicing-stories.json",
            {
                "version": 2,
                "stage": "slicing-stories",
                "artifact_dir": ".praxis",
                "status": "completed",
                "summary_path": ".praxis/slice-map.md",
                "artifacts_written": [
                    ".praxis/slice-map.json",
                    ".praxis/slice-map.md",
                ],
                "route": {
                    "kind": "proceed",
                    "next_stage": None,
                    "next_slice_id": None,
                    "reason": "The slice map is ready.",
                },
                "data": {
                    "outcome_code": "slice_map_ready",
                },
                "needs_user_input": False,
                "needs_confirmation": False,
            },
        )

        action = advance_run(
            repo_root=self.repo_root,
            stage_result_path=Path(".praxis/results/slicing-stories.json"),
            slice_map_path=Path(".praxis/slice-map.json"),
            commit_meta=None,
            handoff_data=None,
            dirty_paths=None,
            gate_failures=None,
            cancel_requested=False,
            timestamp="2026-04-12T00:10:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")

        self.assertEqual(action, "initialize_story_queue")
        self.assertEqual(run["mode"], "multi_slice")
        self.assertEqual(run["current"]["slice_id"], "S-001")
        self.assertEqual(run["current"]["stage"], "clarifying-intent")
        self.assertEqual(run["routing"]["next_action"], "run_stage")
        self.assertEqual(ledger["stories"]["active"], "S-001")
        self.assertEqual(ledger["stories"]["order"], ["S-001", "S-002"])

    def test_advance_run_checkpoints_a_terminal_forge_story(self) -> None:
        self._write_json(
            ".praxis/run.json",
            {
                "version": 3,
                "workflow": "forge",
                "status": "running",
                "entry_task": "Finish the first story",
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
                    "scope": "slice",
                    "slice_id": "S-001",
                    "artifact_dir": ".praxis/slices/S-001",
                    "stage": "code-improving",
                },
                "routing": {
                    "next_action": "run_stage",
                    "next_stage": "code-improving",
                    "next_slice_id": None,
                    "reason": "S-001 is wrapping up.",
                    "stop_reason_code": None,
                    "boundary_handoff_path": None,
                },
                "timestamps": {
                    "created_at": "2026-04-12T00:00:00Z",
                    "updated_at": "2026-04-12T00:00:00Z",
                },
            },
        )
        self._write_json(
            ".praxis/story-ledger.json",
            {
                "version": 2,
                "execution_mode": "autopilot",
                "stories": {
                    "order": ["S-001", "S-002"],
                    "active": "S-001",
                    "last_completed": None,
                    "items": {
                        "S-001": {
                            "artifact_dir": ".praxis/slices/S-001",
                            "status": "active",
                            "boundary_status": "in_progress",
                            "handoff_path": None,
                            "handoff_markdown_path": None,
                            "carry_forward_from": None,
                            "commit_meta": None,
                            "boundary_reason_code": None,
                            "boundary_reason": None,
                            "stop_reason_code": None,
                            "stop_reason": None,
                        },
                        "S-002": {
                            "artifact_dir": ".praxis/slices/S-002",
                            "status": "queued",
                            "boundary_status": "pending",
                            "handoff_path": None,
                            "handoff_markdown_path": None,
                            "carry_forward_from": None,
                            "commit_meta": None,
                            "boundary_reason_code": None,
                            "boundary_reason": None,
                            "stop_reason_code": None,
                            "stop_reason": None,
                        },
                    },
                },
                "timestamps": {
                    "created_at": "2026-04-12T00:00:00Z",
                    "updated_at": "2026-04-12T00:00:00Z",
                },
            },
        )
        self._write_json(
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
                    "reason": "S-001 is ready to finish.",
                },
                "data": {
                    "outcome_code": "improvement_ready",
                },
                "needs_user_input": False,
                "needs_confirmation": False,
            },
        )

        action = advance_run(
            repo_root=self.repo_root,
            stage_result_path=Path(".praxis/slices/S-001/results/code-improving.json"),
            slice_map_path=Path(".praxis/slice-map.json"),
            commit_meta={
                "start_commit": "abc1111",
                "end_commit": "def2222",
                "commits": ["abc1111", "def2222"],
            },
            handoff_data={
                "summary": "S-001 is complete.",
                "carry_forward_context": ["S-002 should start from durable state."],
                "changed_paths": ["workflow/scripts/orchestrator.py"],
            },
            dirty_paths=[],
            gate_failures=None,
            cancel_requested=False,
            timestamp="2026-04-12T00:15:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")

        self.assertEqual(action, "checkpoint_story_boundary")
        self.assertEqual(run["status"], "running")
        self.assertEqual(run["current"]["slice_id"], "S-002")
        self.assertEqual(run["current"]["stage"], "clarifying-intent")
        self.assertEqual(run["routing"]["next_action"], "run_stage")
        self.assertEqual(run["routing"]["boundary_handoff_path"], ".praxis/slices/S-001/handoff.json")
        self.assertEqual(ledger["stories"]["last_completed"], "S-001")
        self.assertEqual(ledger["stories"]["items"]["S-002"]["status"], "active")

    def test_continue_run_unpauses_a_confirmed_stage(self) -> None:
        self._write_json(
            ".praxis/run.json",
            {
                "version": 3,
                "workflow": "craft",
                "status": "waiting_for_user",
                "entry_task": "Confirm the next stage",
                "mode": "single_story",
                "runtime": {
                    "adapter": "codex",
                    "entrypoint": "praxis:craft",
                },
                "execution": {
                    "mode": "manual",
                    "fresh_context_per_story": True,
                },
                "current": {
                    "scope": "root",
                    "slice_id": None,
                    "artifact_dir": ".praxis",
                    "stage": "sketching-design",
                },
                "routing": {
                    "next_action": "confirm_then_run",
                    "next_stage": "sketching-design",
                    "next_slice_id": None,
                    "reason": "Awaiting confirmation to continue.",
                    "stop_reason_code": None,
                    "boundary_handoff_path": None,
                },
                "timestamps": {
                    "created_at": "2026-04-12T00:00:00Z",
                    "updated_at": "2026-04-12T00:00:00Z",
                },
            },
        )

        action = continue_run(
            repo_root=self.repo_root,
            timestamp="2026-04-12T00:20:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")

        self.assertEqual(action, "run_stage")
        self.assertEqual(run["status"], "running")
        self.assertEqual(run["routing"]["next_action"], "run_stage")
        self.assertEqual(run["routing"]["next_stage"], "sketching-design")
        self.assertEqual(run["current"]["stage"], "sketching-design")
        events = [
            json.loads(line)
            for line in (self.repo_root / ".praxis" / "events.jsonl").read_text().splitlines()
            if line.strip()
        ]
        self.assertEqual([event["type"] for event in events], ["run_resumed"])
        self.assertEqual(events[0]["source"], "continue-run")
        self.assertEqual(events[0]["resume_action"], "run_stage")
        self.assertEqual(events[0]["stage"], "sketching-design")

    def test_resume_run_recovers_a_failed_single_story_cursor(self) -> None:
        self._write_json(
            ".praxis/run.json",
            {
                "version": 3,
                "workflow": "forge",
                "status": "failed",
                "entry_task": "Resume the interrupted story",
                "mode": "single_story",
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
                    "stage": "rapid-implementing",
                },
                "routing": {
                    "next_action": "run_stage",
                    "next_stage": "rapid-implementing",
                    "next_slice_id": None,
                    "reason": "The process stopped unexpectedly.",
                    "stop_reason_code": None,
                    "boundary_handoff_path": None,
                },
                "timestamps": {
                    "created_at": "2026-04-12T00:00:00Z",
                    "updated_at": "2026-04-12T00:00:00Z",
                },
            },
        )

        action = resume_run(
            repo_root=self.repo_root,
            timestamp="2026-04-12T00:25:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")

        self.assertEqual(action, "resume_active")
        self.assertEqual(run["status"], "running")
        self.assertEqual(run["routing"]["next_action"], "run_stage")
        self.assertEqual(run["routing"]["next_stage"], "rapid-implementing")
        self.assertEqual(run["current"]["stage"], "rapid-implementing")
        events = [
            json.loads(line)
            for line in (self.repo_root / ".praxis" / "events.jsonl").read_text().splitlines()
            if line.strip()
        ]
        self.assertEqual([event["type"] for event in events], ["run_resumed"])
        self.assertEqual(events[0]["source"], "resume-run")
        self.assertEqual(events[0]["resume_action"], "resume_active")
        self.assertEqual(events[0]["stage"], "rapid-implementing")


class OrchestratorCliContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_cli_initializes_a_run_and_reports_dispatch(self) -> None:
        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "workflow.scripts.orchestrator",
                "initialize-run",
                "--repo-root",
                str(self.repo_root),
                "--workflow",
                "forge",
                "--entry-task",
                "Build the orchestrator entrypoint",
                "--adapter",
                "codex",
                "--execution-mode",
                "autopilot",
                "--timestamp",
                "2026-04-12T00:30:00Z",
            ],
            cwd=PROJECT_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        result = json.loads(completed.stdout)
        run = load_json(self.repo_root / ".praxis" / "run.json")

        self.assertEqual(result["command"], "initialize-run")
        self.assertEqual(result["transition_action"], "run_stage")
        self.assertEqual(result["dispatch"]["action"], "run_stage")
        self.assertEqual(result["dispatch"]["stage"], "clarifying-intent")
        self.assertEqual(run["current"]["stage"], "clarifying-intent")


if __name__ == "__main__":
    unittest.main()
