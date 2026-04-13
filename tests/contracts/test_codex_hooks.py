import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Optional

from praxis.runtime.adapters.native_resume import update_session_record_after_launch
from praxis.runtime.state.contract_validation import validate_contract_payload
from praxis.runtime.handoff_policy import build_handoff_payload
from praxis.runtime.orchestrator import initialize_run
from praxis.runtime.workers.dispatch import dispatch_worker


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class CodexHooksContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / ".praxis" / "results").mkdir(parents=True, exist_ok=True)
        self._write_codex_harness()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write_text(self, rel_path: str, text: str) -> None:
        path = self.repo_root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def _write_json(self, rel_path: str, payload: dict) -> None:
        self._write_text(rel_path, json.dumps(payload, indent=2) + "\n")

    def _trace_events(self, rel_path: str) -> list[dict]:
        return [
            json.loads(line)
            for line in (self.repo_root / rel_path).read_text().splitlines()
            if line.strip()
        ]

    def _set_stage_worker(self, *, stage: str, worker_id: str, session_id: Optional[str] = None) -> None:
        run_path = self.repo_root / ".praxis" / "run.json"
        run = json.loads(run_path.read_text())
        run["current"]["stage"] = stage
        run["current"]["worker_id"] = worker_id
        run["routing"]["next_action"] = "run_stage"
        run["routing"]["next_stage"] = stage
        if session_id is not None:
            run["current"]["session_id"] = session_id
        run_path.write_text(json.dumps(run, indent=2) + "\n")

    def _write_codex_harness(self) -> None:
        self._write_text("AGENTS.md", "native codex instructions\n")
        self._write_text(".codex/config.toml", "[features]\ncodex_hooks = true\n")
        self._write_text(".codex/hooks.json", "{}\n")
        (self.repo_root / ".codex" / "agents").mkdir(parents=True, exist_ok=True)
        self._write_text(".codex-plugin/settings.md", "compat settings\n")
        (self.repo_root / ".codex-plugin" / "hooks").mkdir(parents=True, exist_ok=True)
        (self.repo_root / ".codex-plugin" / "subagents").mkdir(parents=True, exist_ok=True)
        self._write_text(".codex/extensions.md", "extensions\n")
        self._write_json(
            ".codex/adapter.json",
            {
                "version": 1,
                "adapter": "codex",
                "instructions_path": "AGENTS.md",
                "project_config_path": ".codex/config.toml",
                "hooks_path": ".codex/hooks.json",
                "agents_path": ".codex/agents",
                "worker_launch_command": 'python3 -c "import sys; sys.exit(0)"',
                "extension_points": {
                    "mcp_config_path": ".codex/extensions.md",
                    "resources_path": None,
                    "tool_overrides_path": None,
                    "notes_path": ".codex/extensions.md",
                },
                "compatibility": {
                    "settings_path": ".codex-plugin/settings.md",
                    "hooks_path": ".codex-plugin/hooks",
                    "subagents_path": ".codex-plugin/subagents",
                },
            },
        )

    def _write_native_only_codex_harness(self) -> None:
        self._write_text("AGENTS.md", "native codex instructions\n")
        self._write_text(".codex/config.toml", "[features]\ncodex_hooks = true\n")
        self._write_text(".codex/hooks.json", "{}\n")
        (self.repo_root / ".codex" / "agents").mkdir(parents=True, exist_ok=True)
        self._write_text(".codex/extensions.md", "extensions\n")
        self._write_json(
            ".codex/adapter.json",
            {
                "version": 1,
                "adapter": "codex",
                "instructions_path": "AGENTS.md",
                "project_config_path": ".codex/config.toml",
                "hooks_path": ".codex/hooks.json",
                "agents_path": ".codex/agents",
                "worker_launch_command": 'python3 -c "import sys; sys.exit(0)"',
                "extension_points": {
                    "mcp_config_path": ".codex/extensions.md",
                    "resources_path": None,
                    "tool_overrides_path": None,
                    "notes_path": ".codex/extensions.md",
                },
            },
        )

    def test_session_start_hook_writes_launch_record_and_injects_bounded_context(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Launch a codex worker",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T03:00:00Z",
        )
        run_path = self.repo_root / ".praxis" / "run.json"
        run = json.loads(run_path.read_text())
        run["mode"] = "multi_slice"
        run["current"]["scope"] = "slice"
        run["current"]["slice_id"] = "S-002"
        run["current"]["artifact_dir"] = ".praxis/slices/S-002"
        run["current"]["stage"] = "clarifying-intent"
        run["routing"]["next_action"] = "run_stage"
        run["routing"]["next_stage"] = "clarifying-intent"
        run["routing"]["boundary_handoff_path"] = ".praxis/slices/S-001/handoff.json"
        run_path.write_text(json.dumps(run, indent=2) + "\n")

        handoff = build_handoff_payload(
            story_id="S-001",
            next_story_id="S-002",
            summary="S-001 completed.",
            carry_forward_context=["Carry only the clarified summary and changed paths."],
            changed_paths=["src/praxis/runtime/adapters/codex/hooks.py"],
            commit_meta={"end_commit": "abc1234"},
            generated_at="2026-04-12T03:01:00Z",
        )
        self._write_json(".praxis/slices/S-001/handoff.json", handoff)

        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "praxis.runtime.adapters.codex.hooks",
                "session-start",
                "--repo-root",
                str(self.repo_root),
                "--timestamp",
                "2026-04-12T03:02:00Z",
            ],
            cwd=PROJECT_ROOT,
            input=json.dumps(
                {
                    "session_id": "sess-123",
                    "source": "startup",
                    "cwd": str(self.repo_root),
                }
            ),
            check=True,
            capture_output=True,
            text=True,
        )

        response = json.loads(completed.stdout)
        self.assertTrue(response["continue"])
        self.assertEqual(response["hookSpecificOutput"]["hookEventName"], "SessionStart")
        self.assertIn("boundary_handoff_path: .praxis/slices/S-001/handoff.json", response["hookSpecificOutput"]["additionalContext"])
        self.assertIn("carry-forward rule: use only this dispatch plus the active boundary handoff", response["hookSpecificOutput"]["additionalContext"])

        launch_records = sorted((self.repo_root / ".praxis" / "runtime" / "launches" / "codex").glob("*.json"))
        self.assertEqual(len(launch_records), 1)
        worker_records = sorted((self.repo_root / ".praxis" / "runtime" / "workers").glob("*.json"))
        session_records = sorted((self.repo_root / ".praxis" / "runtime" / "sessions" / "codex").glob("*.json"))
        self.assertEqual(len(worker_records), 1)
        self.assertEqual(len(session_records), 1)

        record = json.loads(launch_records[0].read_text())
        validate_contract_payload("native-launch.schema.json", record)
        self.assertEqual(record["version"], 4)
        self.assertEqual(record["session"]["id"], "sess-123")
        self.assertEqual(record["session"]["origin"], "interactive_start")
        self.assertEqual(record["session"]["provider_locator"], "sess-123")
        self.assertTrue(record["session"]["resumable"])
        self.assertEqual(record["session"]["resumable_reason_code"], "provider_locator_recorded")
        self.assertEqual(record["dispatch"]["slice_id"], "S-002")
        self.assertEqual(record["dispatch"]["stage"], "clarifying-intent")
        self.assertTrue(record["context"]["fresh_context"])
        self.assertTrue(record["context"]["handoff_injected"])
        self.assertIsNotNone(record["context"]["context_fingerprint"])
        self.assertEqual(record["context"]["boundary_handoff_story_id"], "S-001")
        self.assertEqual(record["worker"]["worker_class"], "session_worker")
        self.assertIsNotNone(record["worker"]["worker_signature"])
        self.assertEqual(record["harness"]["instructions_path"], "AGENTS.md")
        self.assertEqual(record["harness"]["project_config_path"], ".codex/config.toml")
        self.assertEqual(record["harness"]["trace_path"], ".praxis/runtime/traces/wrk_S002_clarify_01.jsonl")

        events = [
            json.loads(line)
            for line in (self.repo_root / ".praxis" / "events.jsonl").read_text().splitlines()
            if line.strip()
        ]
        self.assertEqual([event["type"] for event in events], ["handoff_validated", "native_launch_recorded"])
        self.assertTrue(events[0]["schema_valid"])
        self.assertTrue(events[0]["within_budget"])
        self.assertTrue(events[0]["handoff_injected"])
        self.assertEqual(events[0]["handoff_story_id"], "S-001")
        self.assertEqual(events[1]["adapter"], "codex")
        self.assertEqual(events[1]["scope"], "slice")
        self.assertEqual(events[1]["slice_id"], "S-002")
        self.assertEqual(events[1]["stage"], "clarifying-intent")
        self.assertTrue(events[1]["handoff_present"])
        self.assertTrue(events[1]["handoff_injected"])
        self.assertEqual(events[1]["reason_code"], "native_launch_recorded")

        trace_events = self._trace_events(record["harness"]["trace_path"])
        self.assertEqual([event["type"] for event in trace_events], ["native_launch_recorded"])
        validate_contract_payload("trace-event.schema.json", trace_events[0])
        self.assertEqual(trace_events[0]["launch_record_path"], str(launch_records[0].relative_to(self.repo_root)))
        self.assertEqual(trace_events[0]["dispatch_record_path"], record["bundle"]["dispatch_record_path"])
        self.assertEqual(trace_events[0]["worker_record_path"], ".praxis/runtime/workers/wrk_S002_clarify_01.json")

    def test_session_start_hook_passes_through_when_no_run_exists(self) -> None:
        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "praxis.runtime.adapters.codex.hooks",
                "session-start",
                "--repo-root",
                str(self.repo_root),
                "--timestamp",
                "2026-04-12T04:00:00Z",
            ],
            cwd=PROJECT_ROOT,
            input="{}",
            check=True,
            capture_output=True,
            text=True,
        )

        response = json.loads(completed.stdout)
        self.assertTrue(response["continue"])
        self.assertEqual(response["hookSpecificOutput"]["hookEventName"], "SessionStart")
        self.assertIn("No active Praxis run", response["hookSpecificOutput"]["additionalContext"])

    def test_session_start_hook_passes_through_when_run_has_no_active_stage(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Open an idle codex session",
            adapter="codex",
            execution_mode="manual",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T04:05:00Z",
        )
        run_path = self.repo_root / ".praxis" / "run.json"
        run = json.loads(run_path.read_text())
        run["current"]["stage"] = None
        run["routing"]["next_action"] = "idle"
        run["routing"]["next_stage"] = None
        run_path.write_text(json.dumps(run, indent=2) + "\n")

        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "praxis.runtime.adapters.codex.hooks",
                "session-start",
                "--repo-root",
                str(self.repo_root),
                "--timestamp",
                "2026-04-12T04:06:00Z",
            ],
            cwd=PROJECT_ROOT,
            input=json.dumps({"session_id": "sess-idle", "source": "startup", "cwd": str(self.repo_root)}),
            check=True,
            capture_output=True,
            text=True,
        )

        response = json.loads(completed.stdout)
        self.assertTrue(response["continue"])
        self.assertEqual(response["hookSpecificOutput"]["hookEventName"], "SessionStart")
        self.assertIn("No active Praxis stage", response["hookSpecificOutput"]["additionalContext"])
        self.assertFalse((self.repo_root / ".praxis" / "runtime" / "launches" / "codex").exists())

    def test_session_start_hook_records_failure_telemetry_for_an_invalid_handoff(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Launch a codex worker",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T03:10:00Z",
        )
        run_path = self.repo_root / ".praxis" / "run.json"
        run = json.loads(run_path.read_text())
        run["mode"] = "multi_slice"
        run["current"]["scope"] = "slice"
        run["current"]["slice_id"] = "S-002"
        run["current"]["artifact_dir"] = ".praxis/slices/S-002"
        run["current"]["stage"] = "clarifying-intent"
        run["routing"]["next_action"] = "run_stage"
        run["routing"]["next_stage"] = "clarifying-intent"
        run["routing"]["boundary_handoff_path"] = ".praxis/slices/S-001/handoff.json"
        run_path.write_text(json.dumps(run, indent=2) + "\n")

        handoff = build_handoff_payload(
            story_id="S-001",
            next_story_id="S-002",
            summary="S-001 completed.",
            carry_forward_context=["Carry only the bounded handoff should cross the story boundary."],
            changed_paths=["src/praxis/runtime/adapters/codex/hooks.py"],
            commit_meta={"end_commit": "abc1234"},
            generated_at="2026-04-12T03:11:00Z",
        )
        handoff.pop("summary")
        self._write_json(".praxis/slices/S-001/handoff.json", handoff)

        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "praxis.runtime.adapters.codex.hooks",
                "session-start",
                "--repo-root",
                str(self.repo_root),
                "--timestamp",
                "2026-04-12T03:12:00Z",
            ],
            cwd=PROJECT_ROOT,
            input=json.dumps(
                {
                    "session_id": "sess-invalid",
                    "source": "startup",
                    "cwd": str(self.repo_root),
                }
            ),
            check=True,
            capture_output=True,
            text=True,
        )

        response = json.loads(completed.stdout)
        self.assertFalse(response["continue"])
        self.assertFalse((self.repo_root / ".praxis" / "runtime" / "launches" / "codex").exists())

        events = [
            json.loads(line)
            for line in (self.repo_root / ".praxis" / "events.jsonl").read_text().splitlines()
            if line.strip()
        ]
        self.assertEqual([event["type"] for event in events], ["handoff_validated", "native_launch_failed"])
        self.assertFalse(events[0]["schema_valid"])

        trace_events = self._trace_events(".praxis/runtime/traces/wrk_S002_clarify_01.jsonl")
        self.assertEqual([event["type"] for event in trace_events], ["native_launch_failed"])
        validate_contract_payload("trace-event.schema.json", trace_events[0])
        self.assertEqual(trace_events[0]["reason_code"], "handoff_schema_invalid")

    def test_session_start_hook_allows_native_harness_without_compatibility_block(self) -> None:
        self.temp_dir.cleanup()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / ".praxis" / "results").mkdir(parents=True, exist_ok=True)
        self._write_native_only_codex_harness()

        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Launch a native-only codex worker",
            adapter="codex",
            execution_mode="manual",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T04:10:00Z",
        )

        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "praxis.runtime.adapters.codex.hooks",
                "session-start",
                "--repo-root",
                str(self.repo_root),
                "--timestamp",
                "2026-04-12T04:11:00Z",
            ],
            cwd=PROJECT_ROOT,
            input=json.dumps(
                {
                    "session_id": "sess-native-only",
                    "source": "startup",
                    "cwd": str(self.repo_root),
                }
            ),
            check=True,
            capture_output=True,
            text=True,
        )

        response = json.loads(completed.stdout)
        self.assertTrue(response["continue"])

        launch_records = sorted((self.repo_root / ".praxis" / "runtime" / "launches" / "codex").glob("*.json"))
        self.assertEqual(len(launch_records), 1)

        record = json.loads(launch_records[0].read_text())
        validate_contract_payload("native-launch.schema.json", record)
        self.assertIsNone(record["harness"]["compatibility"])

    def test_session_start_hook_reconciles_manual_resume_and_rotated_session_id(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Resume a codex worker manually",
            adapter="codex",
            execution_mode="manual",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T04:20:00Z",
        )
        self._set_stage_worker(stage="rapid-implementing", worker_id="wrk_root_impl_01")

        dispatch_worker(
            repo_root=self.repo_root,
            timestamp="2026-04-12T04:21:00Z",
            session_id="sess-prev-123",
        )
        update_session_record_after_launch(
            repo_root=self.repo_root,
            adapter="codex",
            worker_id="wrk_root_impl_01",
            recorded_at="2026-04-12T04:21:30Z",
            provider_locator="sess-prev-123",
        )

        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "praxis.runtime.adapters.codex.hooks",
                "session-start",
                "--repo-root",
                str(self.repo_root),
                "--timestamp",
                "2026-04-12T04:22:00Z",
            ],
            cwd=PROJECT_ROOT,
            input=json.dumps(
                {
                    "session_id": "sess-rotated-456",
                    "source": "resume",
                    "cwd": str(self.repo_root),
                }
            ),
            check=True,
            capture_output=True,
            text=True,
        )

        response = json.loads(completed.stdout)
        self.assertTrue(response["continue"])
        self.assertIn("Praxis Codex resume context", response["hookSpecificOutput"]["additionalContext"])
        self.assertIn("resume_record:", response["hookSpecificOutput"]["additionalContext"])
        self.assertIn("resumed_session_id: sess-rotated-456", response["hookSpecificOutput"]["additionalContext"])

        resume_records = sorted((self.repo_root / ".praxis" / "runtime" / "resumes" / "codex").glob("*.json"))
        self.assertEqual(len(resume_records), 1)
        resume_record = json.loads(resume_records[0].read_text())
        validate_contract_payload("native-resume.schema.json", resume_record)
        self.assertEqual(resume_record["outcome"], "resumed")
        self.assertEqual(resume_record["resolved_session_id"], "sess-rotated-456")

        session_path = self.repo_root / ".praxis" / "runtime" / "sessions" / "codex" / "sess-prev-123.json"
        self.assertTrue(session_path.exists())
        session_record = json.loads(session_path.read_text())
        self.assertEqual(session_record["session_id"], "sess-prev-123")
        self.assertEqual(session_record["provider_locator"], "sess-rotated-456")
        self.assertEqual(session_record["session_origin"], "interactive_resume")
        self.assertEqual(session_record["last_resume_outcome"], "resumed")

        run = json.loads((self.repo_root / ".praxis" / "run.json").read_text())
        self.assertEqual(run["current"]["session_id"], "sess-prev-123")
        self.assertEqual(
            run["routing"]["reason"],
            "Awaiting rapid-implementing stage results from resumed worker wrk_root_impl_01.",
        )

        events = [
            json.loads(line)
            for line in (self.repo_root / ".praxis" / "events.jsonl").read_text().splitlines()
            if line.strip()
        ]
        self.assertEqual(
            [event["type"] for event in events][-3:],
            ["provider_resume_requested", "provider_resume_succeeded", "worker_resumed"],
        )

        trace_events = self._trace_events(".praxis/runtime/traces/wrk_root_impl_01.jsonl")
        self.assertEqual(
            [event["type"] for event in trace_events][-3:],
            ["provider_resume_requested", "provider_resume_succeeded", "worker_resumed"],
        )
        for trace_event in trace_events[-3:]:
            validate_contract_payload("trace-event.schema.json", trace_event)
        self.assertEqual(trace_events[-1]["resume_record_path"], str(resume_records[0].relative_to(self.repo_root)))


if __name__ == "__main__":
    unittest.main()
