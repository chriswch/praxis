import json
import shutil
import tempfile
import unittest
from pathlib import Path

from workflow.scripts.handoff_policy import build_handoff_payload
from workflow.scripts.story_boundary import resume_story_run_from_disk


FIXTURES = Path(__file__).parent / "fixtures"


def load_json(path: Path):
    return json.loads(path.read_text())


class ResumeStoryBoundaryContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / ".praxis" / "slices" / "S-001").mkdir(parents=True)
        (self.repo_root / ".praxis" / "slices" / "S-002").mkdir(parents=True)
        shutil.copy(FIXTURES / "autopilot_run.json", self.repo_root / ".praxis" / "run.json")
        shutil.copy(
            FIXTURES / "autopilot_story_ledger.json",
            self.repo_root / ".praxis" / "story-ledger.json",
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write_handoff(self, *, summary: str, carry_forward_context: list[str], generated_at: str) -> None:
        handoff = build_handoff_payload(
            story_id="S-001",
            next_story_id="S-002",
            summary=summary,
            carry_forward_context=carry_forward_context,
            changed_paths=["workflow/scripts/story_boundary.py"],
            commit_meta={"end_commit": "def2222"},
            generated_at=generated_at,
        )
        (self.repo_root / ".praxis" / "slices" / "S-001" / "handoff.json").write_text(
            json.dumps(handoff, indent=2) + "\n"
        )

    def test_resumes_an_already_activated_story_without_replaying_boundary(self) -> None:
        run = load_json(self.repo_root / ".praxis" / "run.json")
        run["status"] = "failed"
        run["current"]["slice_id"] = "S-002"
        run["current"]["artifact_dir"] = ".praxis/slices/S-002"
        run["current"]["stage"] = "clarifying-intent"
        run["routing"]["next_action"] = "ask_user"
        run["routing"]["next_stage"] = None
        run["routing"]["next_slice_id"] = None
        run["routing"]["reason"] = "Process stopped unexpectedly."
        (self.repo_root / ".praxis" / "run.json").write_text(json.dumps(run, indent=2) + "\n")

        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        ledger["stories"]["active"] = "S-002"
        ledger["stories"]["last_completed"] = "S-001"
        ledger["stories"]["items"]["S-001"]["status"] = "completed"
        ledger["stories"]["items"]["S-001"]["boundary_status"] = "checkpointed"
        ledger["stories"]["items"]["S-001"]["handoff_path"] = ".praxis/slices/S-001/handoff.json"
        ledger["stories"]["items"]["S-002"]["status"] = "active"
        ledger["stories"]["items"]["S-002"]["boundary_status"] = "in_progress"
        ledger["stories"]["items"]["S-002"]["carry_forward_from"] = "S-001"
        (self.repo_root / ".praxis" / "story-ledger.json").write_text(json.dumps(ledger, indent=2) + "\n")

        self._write_handoff(
            summary="S-001 completed.",
            carry_forward_context=["Resume from durable state."],
            generated_at="2026-04-11T03:20:00Z",
        )

        events_path = self.repo_root / ".praxis" / "events.jsonl"
        events_path.write_text(
            "\n".join(
                [
                    json.dumps(
                        {
                            "ts": "2026-04-11T03:20:00Z",
                            "type": "boundary_checkpointed",
                            "slice_id": "S-001",
                            "next_slice_id": "S-002",
                            "handoff_path": ".praxis/slices/S-001/handoff.json",
                        }
                    ),
                    json.dumps(
                        {
                            "ts": "2026-04-11T03:21:00Z",
                            "type": "story_activated",
                            "slice_id": "S-002",
                            "from_slice_id": "S-001",
                        }
                    ),
                ]
            )
            + "\n"
        )

        action = resume_story_run_from_disk(
            repo_root=self.repo_root,
            timestamp="2026-04-11T03:22:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        lines = events_path.read_text().strip().splitlines()

        self.assertEqual(action, "resume_active")
        self.assertEqual(run["status"], "running")
        self.assertEqual(run["current"]["slice_id"], "S-002")
        self.assertEqual(run["current"]["stage"], "clarifying-intent")
        self.assertEqual(run["routing"]["next_action"], "run_stage")
        self.assertEqual(len(lines), 2)

    def test_resumes_checkpointed_autopilot_story_by_activating_once(self) -> None:
        run = load_json(self.repo_root / ".praxis" / "run.json")
        run["status"] = "failed"
        run["current"]["slice_id"] = "S-002"
        run["current"]["artifact_dir"] = ".praxis/slices/S-002"
        run["current"]["stage"] = "clarifying-intent"
        run["routing"]["next_action"] = "confirm_then_run"
        run["routing"]["next_stage"] = "clarifying-intent"
        run["routing"]["next_slice_id"] = "S-002"
        run["routing"]["reason"] = "Interrupted after checkpoint."
        (self.repo_root / ".praxis" / "run.json").write_text(json.dumps(run, indent=2) + "\n")

        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        ledger["stories"]["active"] = "S-002"
        ledger["stories"]["last_completed"] = "S-001"
        ledger["stories"]["items"]["S-001"]["status"] = "completed"
        ledger["stories"]["items"]["S-001"]["boundary_status"] = "checkpointed"
        ledger["stories"]["items"]["S-001"]["handoff_path"] = ".praxis/slices/S-001/handoff.json"
        ledger["stories"]["items"]["S-002"]["status"] = "active_next"
        ledger["stories"]["items"]["S-002"]["boundary_status"] = "pending"
        ledger["stories"]["items"]["S-002"]["carry_forward_from"] = "S-001"
        (self.repo_root / ".praxis" / "story-ledger.json").write_text(json.dumps(ledger, indent=2) + "\n")

        self._write_handoff(
            summary="S-001 completed.",
            carry_forward_context=["Resume from checkpointed state."],
            generated_at="2026-04-11T03:23:00Z",
        )

        action = resume_story_run_from_disk(
            repo_root=self.repo_root,
            timestamp="2026-04-11T03:24:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")

        self.assertEqual(action, "resume_autopilot_activation")
        self.assertEqual(run["status"], "running")
        self.assertEqual(run["current"]["slice_id"], "S-002")
        self.assertEqual(run["routing"]["next_action"], "run_stage")
        self.assertEqual(ledger["stories"]["items"]["S-002"]["status"], "active")
        self.assertEqual(ledger["stories"]["items"]["S-002"]["boundary_status"], "in_progress")

    def test_resumes_checkpointed_manual_story_by_waiting_for_confirmation(self) -> None:
        run = load_json(self.repo_root / ".praxis" / "run.json")
        run["execution"]["mode"] = "manual"
        run["status"] = "failed"
        run["current"]["slice_id"] = "S-002"
        run["current"]["artifact_dir"] = ".praxis/slices/S-002"
        run["current"]["stage"] = "clarifying-intent"
        run["routing"]["next_action"] = "confirm_then_run"
        run["routing"]["next_stage"] = "clarifying-intent"
        run["routing"]["next_slice_id"] = "S-002"
        run["routing"]["reason"] = "Interrupted after checkpoint."
        (self.repo_root / ".praxis" / "run.json").write_text(json.dumps(run, indent=2) + "\n")

        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        ledger["execution_mode"] = "manual"
        ledger["stories"]["active"] = "S-002"
        ledger["stories"]["last_completed"] = "S-001"
        ledger["stories"]["items"]["S-001"]["status"] = "completed"
        ledger["stories"]["items"]["S-001"]["boundary_status"] = "checkpointed"
        ledger["stories"]["items"]["S-001"]["handoff_path"] = ".praxis/slices/S-001/handoff.json"
        ledger["stories"]["items"]["S-002"]["status"] = "active_next"
        ledger["stories"]["items"]["S-002"]["boundary_status"] = "pending"
        ledger["stories"]["items"]["S-002"]["carry_forward_from"] = "S-001"
        (self.repo_root / ".praxis" / "story-ledger.json").write_text(json.dumps(ledger, indent=2) + "\n")

        self._write_handoff(
            summary="S-001 completed.",
            carry_forward_context=["Resume after manual checkpoint."],
            generated_at="2026-04-11T03:25:00Z",
        )

        action = resume_story_run_from_disk(
            repo_root=self.repo_root,
            timestamp="2026-04-11T03:26:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")

        self.assertEqual(action, "resume_manual_wait")
        self.assertEqual(run["status"], "waiting_for_user")
        self.assertEqual(run["routing"]["next_action"], "confirm_then_run")
        self.assertEqual(run["routing"]["next_stage"], "clarifying-intent")
        self.assertEqual(run["routing"]["next_slice_id"], "S-002")
        self.assertEqual(run["routing"]["boundary_handoff_path"], ".praxis/slices/S-001/handoff.json")
        self.assertEqual(ledger["stories"]["items"]["S-002"]["status"], "active_next")

    def test_preserves_a_stage_level_autopilot_pause_on_resume(self) -> None:
        run = load_json(self.repo_root / ".praxis" / "run.json")
        run["status"] = "waiting_for_user"
        run["current"]["slice_id"] = "S-001"
        run["current"]["artifact_dir"] = ".praxis/slices/S-001"
        run["current"]["stage"] = "clarifying-intent"
        run["routing"]["next_action"] = "ask_user"
        run["routing"]["next_stage"] = "clarifying-intent"
        run["routing"]["next_slice_id"] = None
        run["routing"]["stop_reason_code"] = "needs_user_input"
        run["routing"]["reason"] = "Autopilot paused because user input is required."
        (self.repo_root / ".praxis" / "run.json").write_text(json.dumps(run, indent=2) + "\n")

        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        ledger["stories"]["active"] = "S-001"
        ledger["stories"]["items"]["S-001"]["status"] = "active"
        ledger["stories"]["items"]["S-001"]["boundary_status"] = "in_progress"
        ledger["stories"]["items"]["S-001"]["stop_reason_code"] = "needs_user_input"
        ledger["stories"]["items"]["S-001"]["stop_reason"] = "Autopilot paused because user input is required."
        (self.repo_root / ".praxis" / "story-ledger.json").write_text(json.dumps(ledger, indent=2) + "\n")

        action = resume_story_run_from_disk(
            repo_root=self.repo_root,
            timestamp="2026-04-11T03:26:30Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")

        self.assertEqual(action, "resume_waiting")
        self.assertEqual(run["status"], "waiting_for_user")
        self.assertEqual(run["routing"]["next_action"], "ask_user")
        self.assertEqual(run["routing"]["next_stage"], "clarifying-intent")
        self.assertEqual(run["routing"]["stop_reason_code"], "needs_user_input")
        self.assertEqual(ledger["stories"]["items"]["S-001"]["status"], "active")
        self.assertEqual(ledger["stories"]["items"]["S-001"]["stop_reason_code"], "needs_user_input")

    def test_preserves_a_cancelled_autopilot_boundary_on_resume(self) -> None:
        run = load_json(self.repo_root / ".praxis" / "run.json")
        run["status"] = "cancelled"
        run["current"]["slice_id"] = "S-002"
        run["current"]["artifact_dir"] = ".praxis/slices/S-002"
        run["current"]["stage"] = "clarifying-intent"
        run["routing"]["next_action"] = "idle"
        run["routing"]["next_stage"] = None
        run["routing"]["next_slice_id"] = "S-002"
        run["routing"]["stop_reason_code"] = "cancelled"
        run["routing"]["reason"] = "Autopilot cancellation stopped story advancement before activation."
        run["routing"]["boundary_handoff_path"] = ".praxis/slices/S-001/handoff.json"
        (self.repo_root / ".praxis" / "run.json").write_text(json.dumps(run, indent=2) + "\n")

        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        ledger["stories"]["active"] = "S-002"
        ledger["stories"]["last_completed"] = "S-001"
        ledger["stories"]["items"]["S-001"]["status"] = "completed"
        ledger["stories"]["items"]["S-001"]["boundary_status"] = "checkpointed"
        ledger["stories"]["items"]["S-001"]["handoff_path"] = ".praxis/slices/S-001/handoff.json"
        ledger["stories"]["items"]["S-002"]["status"] = "active_next"
        ledger["stories"]["items"]["S-002"]["boundary_status"] = "pending"
        ledger["stories"]["items"]["S-002"]["carry_forward_from"] = "S-001"
        ledger["stories"]["items"]["S-002"]["stop_reason_code"] = "cancelled"
        ledger["stories"]["items"]["S-002"]["stop_reason"] = "Autopilot cancellation stopped story advancement before activation."
        ledger["stories"]["items"]["S-002"]["boundary_reason_code"] = "cancelled"
        ledger["stories"]["items"]["S-002"]["boundary_reason"] = "Autopilot cancellation stopped story advancement before activation."
        (self.repo_root / ".praxis" / "story-ledger.json").write_text(json.dumps(ledger, indent=2) + "\n")

        self._write_handoff(
            summary="S-001 completed.",
            carry_forward_context=["Resume should not reactivate cancelled autopilot progress."],
            generated_at="2026-04-11T03:26:40Z",
        )

        action = resume_story_run_from_disk(
            repo_root=self.repo_root,
            timestamp="2026-04-11T03:26:50Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")

        self.assertEqual(action, "resume_cancelled")
        self.assertEqual(run["status"], "cancelled")
        self.assertEqual(run["routing"]["next_action"], "idle")
        self.assertEqual(run["routing"]["next_stage"], None)
        self.assertEqual(run["routing"]["next_slice_id"], "S-002")
        self.assertEqual(run["routing"]["stop_reason_code"], "cancelled")
        self.assertEqual(run["routing"]["boundary_handoff_path"], ".praxis/slices/S-001/handoff.json")
        self.assertEqual(ledger["stories"]["items"]["S-002"]["status"], "active_next")
        self.assertEqual(ledger["stories"]["items"]["S-002"]["boundary_status"], "pending")

    def test_uses_activation_event_to_finish_replay_without_double_activation(self) -> None:
        run = load_json(self.repo_root / ".praxis" / "run.json")
        run["status"] = "failed"
        run["current"]["slice_id"] = "S-002"
        run["current"]["artifact_dir"] = ".praxis/slices/S-002"
        run["current"]["stage"] = "clarifying-intent"
        run["routing"]["next_action"] = "confirm_then_run"
        run["routing"]["next_stage"] = "clarifying-intent"
        run["routing"]["next_slice_id"] = "S-002"
        run["routing"]["reason"] = "Interrupted after activation write."
        (self.repo_root / ".praxis" / "run.json").write_text(json.dumps(run, indent=2) + "\n")

        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        ledger["stories"]["active"] = "S-002"
        ledger["stories"]["last_completed"] = "S-001"
        ledger["stories"]["items"]["S-001"]["status"] = "completed"
        ledger["stories"]["items"]["S-001"]["boundary_status"] = "checkpointed"
        ledger["stories"]["items"]["S-001"]["handoff_path"] = ".praxis/slices/S-001/handoff.json"
        ledger["stories"]["items"]["S-002"]["status"] = "active_next"
        ledger["stories"]["items"]["S-002"]["boundary_status"] = "pending"
        ledger["stories"]["items"]["S-002"]["carry_forward_from"] = "S-001"
        (self.repo_root / ".praxis" / "story-ledger.json").write_text(json.dumps(ledger, indent=2) + "\n")

        self._write_handoff(
            summary="S-001 completed.",
            carry_forward_context=["Activation already reached durable events."],
            generated_at="2026-04-11T03:27:00Z",
        )

        events_path = self.repo_root / ".praxis" / "events.jsonl"
        events_path.write_text(
            "\n".join(
                [
                    json.dumps(
                        {
                            "ts": "2026-04-11T03:27:00Z",
                            "type": "boundary_checkpointed",
                            "slice_id": "S-001",
                            "next_slice_id": "S-002",
                            "handoff_path": ".praxis/slices/S-001/handoff.json",
                        }
                    ),
                    json.dumps(
                        {
                            "ts": "2026-04-11T03:28:00Z",
                            "type": "story_activated",
                            "slice_id": "S-002",
                            "from_slice_id": "S-001",
                        }
                    ),
                ]
            )
            + "\n"
        )

        action = resume_story_run_from_disk(
            repo_root=self.repo_root,
            timestamp="2026-04-11T03:29:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        lines = events_path.read_text().strip().splitlines()

        self.assertEqual(action, "resume_replayed_activation")
        self.assertEqual(run["status"], "running")
        self.assertEqual(run["routing"]["next_action"], "run_stage")
        self.assertEqual(run["routing"]["next_slice_id"], None)
        self.assertEqual(ledger["stories"]["items"]["S-002"]["status"], "active")
        self.assertEqual(ledger["stories"]["items"]["S-002"]["boundary_status"], "in_progress")
        self.assertEqual(len(lines), 2)

    def test_stops_closed_when_boundary_block_reason_is_unresolved(self) -> None:
        run = load_json(self.repo_root / ".praxis" / "run.json")
        run["status"] = "failed"
        run["current"]["slice_id"] = "S-001"
        run["current"]["artifact_dir"] = ".praxis/slices/S-001"
        run["current"]["stage"] = "verifying-and-adapting"
        run["routing"]["next_action"] = "run_stage"
        run["routing"]["next_stage"] = "verifying-and-adapting"
        run["routing"]["reason"] = "Interrupted during a blocked boundary."
        (self.repo_root / ".praxis" / "run.json").write_text(json.dumps(run, indent=2) + "\n")

        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        ledger["stories"]["active"] = "S-001"
        ledger["stories"]["items"]["S-001"]["status"] = "active"
        ledger["stories"]["items"]["S-001"]["boundary_status"] = "blocked"
        ledger["stories"]["items"]["S-001"]["boundary_reason_code"] = "test_gate_failed"
        ledger["stories"]["items"]["S-001"]["boundary_reason"] = "A failed test gate blocks story boundary."
        (self.repo_root / ".praxis" / "story-ledger.json").write_text(json.dumps(ledger, indent=2) + "\n")

        action = resume_story_run_from_disk(
            repo_root=self.repo_root,
            timestamp="2026-04-11T03:30:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")

        self.assertEqual(action, "resume_blocked")
        self.assertEqual(run["status"], "waiting_for_user")
        self.assertEqual(run["routing"]["next_action"], "ask_user")
        self.assertEqual(run["routing"]["next_stage"], None)
        self.assertEqual(run["routing"]["stop_reason_code"], "test_gate_failed")
        self.assertIn("Resolve test_gate_failed", run["routing"]["reason"])
        self.assertEqual(ledger["stories"]["active"], "S-001")
        self.assertEqual(ledger["stories"]["items"]["S-001"]["status"], "active")
        self.assertEqual(ledger["stories"]["items"]["S-001"]["boundary_status"], "blocked")
        self.assertEqual(ledger["stories"]["items"]["S-002"]["status"], "queued")

    def test_fails_closed_when_cursor_and_ledger_disagree_about_active_story(self) -> None:
        run = load_json(self.repo_root / ".praxis" / "run.json")
        run["status"] = "failed"
        run["current"]["slice_id"] = "S-001"
        run["current"]["artifact_dir"] = ".praxis/slices/S-001"
        run["current"]["stage"] = "clarifying-intent"
        run["routing"]["next_action"] = "run_stage"
        run["routing"]["next_stage"] = "clarifying-intent"
        run["routing"]["reason"] = "Interrupted with mismatched cursor state."
        (self.repo_root / ".praxis" / "run.json").write_text(json.dumps(run, indent=2) + "\n")

        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        ledger["stories"]["active"] = "S-002"
        ledger["stories"]["last_completed"] = "S-001"
        ledger["stories"]["items"]["S-001"]["status"] = "completed"
        ledger["stories"]["items"]["S-001"]["boundary_status"] = "checkpointed"
        ledger["stories"]["items"]["S-001"]["handoff_path"] = ".praxis/slices/S-001/handoff.json"
        ledger["stories"]["items"]["S-002"]["status"] = "active"
        ledger["stories"]["items"]["S-002"]["boundary_status"] = "in_progress"
        ledger["stories"]["items"]["S-002"]["carry_forward_from"] = "S-001"
        (self.repo_root / ".praxis" / "story-ledger.json").write_text(json.dumps(ledger, indent=2) + "\n")

        self._write_handoff(
            summary="S-001 completed.",
            carry_forward_context=["Cursor and ledger disagree."],
            generated_at="2026-04-11T03:31:00Z",
        )

        action = resume_story_run_from_disk(
            repo_root=self.repo_root,
            timestamp="2026-04-11T03:32:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")

        self.assertEqual(action, "resume_inconsistent")
        self.assertEqual(run["status"], "failed")
        self.assertEqual(run["routing"]["next_action"], "ask_user")
        self.assertEqual(run["routing"]["next_stage"], None)
        self.assertEqual(run["routing"]["stop_reason_code"], "inconsistent_state")
        self.assertIn("run.current.slice_id", run["routing"]["reason"])
        self.assertEqual(run["current"]["slice_id"], "S-001")
        self.assertEqual(ledger["stories"]["active"], "S-002")

    def test_resumes_a_terminal_run_without_requiring_an_active_story(self) -> None:
        run = load_json(self.repo_root / ".praxis" / "run.json")
        run["status"] = "completed"
        run["current"]["slice_id"] = "S-001"
        run["current"]["artifact_dir"] = ".praxis/slices/S-001"
        run["current"]["stage"] = None
        run["routing"]["next_action"] = "finish"
        run["routing"]["next_stage"] = None
        run["routing"]["next_slice_id"] = None
        run["routing"]["reason"] = "Run already finished."
        run["routing"]["boundary_handoff_path"] = ".praxis/slices/S-001/handoff.json"
        (self.repo_root / ".praxis" / "run.json").write_text(json.dumps(run, indent=2) + "\n")

        ledger = load_json(self.repo_root / ".praxis" / "story-ledger.json")
        ledger["stories"]["active"] = None
        ledger["stories"]["last_completed"] = "S-001"
        ledger["stories"]["items"]["S-001"]["status"] = "completed"
        ledger["stories"]["items"]["S-001"]["boundary_status"] = "checkpointed"
        ledger["stories"]["items"]["S-001"]["handoff_path"] = ".praxis/slices/S-001/handoff.json"
        (self.repo_root / ".praxis" / "story-ledger.json").write_text(json.dumps(ledger, indent=2) + "\n")

        action = resume_story_run_from_disk(
            repo_root=self.repo_root,
            timestamp="2026-04-11T03:33:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        self.assertEqual(action, "resume_terminal")
        self.assertEqual(run["status"], "completed")
        self.assertEqual(run["routing"]["next_action"], "finish")
        self.assertEqual(run["routing"]["boundary_handoff_path"], ".praxis/slices/S-001/handoff.json")


if __name__ == "__main__":
    unittest.main()
