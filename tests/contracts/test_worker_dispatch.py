import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Optional
from unittest.mock import patch

from praxis.runtime.state.contract_validation import validate_contract_payload
from praxis.runtime.orchestrator import initialize_run, resume_run
from praxis.runtime.workers.dispatch import dispatch_worker


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def load_json(path: Path):
    return json.loads(path.read_text())


class WorkerDispatchContractTest(unittest.TestCase):
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

    def _set_stage_worker(self, *, stage: str, worker_id: str, session_id: Optional[str] = None) -> None:
        run_path = self.repo_root / ".praxis" / "run.json"
        run = load_json(run_path)
        run["current"]["stage"] = stage
        run["current"]["worker_id"] = worker_id
        run["routing"]["next_stage"] = stage
        run["routing"]["next_action"] = "run_stage"
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

    def test_dispatch_worker_launches_a_fresh_session_worker(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Launch a bounded codex worker",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T05:00:00Z",
        )

        action = dispatch_worker(
            repo_root=self.repo_root,
            timestamp="2026-04-12T05:01:00Z",
        )

        self.assertEqual(action, "launch_worker")

        run = load_json(self.repo_root / ".praxis" / "run.json")
        self.assertEqual(run["status"], "running")
        self.assertEqual(run["current"]["worker_id"], "wrk_root_clarify_01")
        self.assertEqual(run["routing"]["pending_worker_action"], "await_stage_result")
        self.assertEqual(
            run["routing"]["reason"],
            "Awaiting clarifying-intent stage results from wrk_root_clarify_01.",
        )
        self.assertTrue(run["current"]["session_id"].startswith("codex-session-20260412T050100Z-"))

        launch_records = sorted((self.repo_root / ".praxis" / "runtime" / "launches" / "codex").glob("*.json"))
        self.assertEqual(len(launch_records), 1)
        record = load_json(launch_records[0])
        validate_contract_payload("native-launch.schema.json", record)
        self.assertFalse(record["resume"]["attempted"])
        self.assertEqual(record["resume"]["outcome"], "resume_not_attempted")
        self.assertEqual(record["session"]["source"], "control_plane_launch")

        worker_records = sorted((self.repo_root / ".praxis" / "runtime" / "workers").glob("*.json"))
        session_records = sorted((self.repo_root / ".praxis" / "runtime" / "sessions" / "codex").glob("*.json"))
        self.assertEqual(len(worker_records), 1)
        self.assertEqual(len(session_records), 1)

        events = [
            json.loads(line)
            for line in (self.repo_root / ".praxis" / "events.jsonl").read_text().splitlines()
            if line.strip()
        ]
        self.assertEqual([event["type"] for event in events], ["native_launch_recorded"])

    def test_dispatch_worker_records_resume_fallback_before_relaunch(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Relaunch a resumable codex worker",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T05:10:00Z",
        )

        run_path = self.repo_root / ".praxis" / "run.json"
        self._set_stage_worker(
            stage="rapid-implementing",
            worker_id="wrk_root_impl_01",
            session_id="sess-prev-123",
        )

        action = dispatch_worker(
            repo_root=self.repo_root,
            timestamp="2026-04-12T05:11:00Z",
        )

        self.assertEqual(action, "resume_fallback_relaunch")

        run = load_json(run_path)
        self.assertNotEqual(run["current"]["session_id"], "sess-prev-123")
        self.assertEqual(run["routing"]["pending_worker_action"], "await_stage_result")

        launch_records = sorted((self.repo_root / ".praxis" / "runtime" / "launches" / "codex").glob("*.json"))
        self.assertEqual(len(launch_records), 1)
        record = load_json(launch_records[0])
        validate_contract_payload("native-launch.schema.json", record)
        self.assertTrue(record["resume"]["attempted"])
        self.assertEqual(record["resume"]["outcome"], "resume_fallback_to_relaunch")
        self.assertEqual(record["resume"]["previous_session_id"], "sess-prev-123")
        self.assertEqual(record["session"]["source"], "control_plane_resume_fallback")

        resume_records = sorted((self.repo_root / ".praxis" / "runtime" / "resumes" / "codex").glob("*.json"))
        self.assertEqual(len(resume_records), 1)
        resume_record = load_json(resume_records[0])
        self.assertEqual(resume_record["outcome"], "session_missing")
        self.assertEqual(resume_record["reason_code"], "session_missing")

        events = [
            json.loads(line)
            for line in (self.repo_root / ".praxis" / "events.jsonl").read_text().splitlines()
            if line.strip()
        ]
        self.assertEqual(
            [event["type"] for event in events],
            [
                "provider_resume_requested",
                "provider_resume_failed",
                "resume_fallback_used",
                "native_launch_recorded",
            ],
        )

        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "praxis.runtime.orchestrator",
                "show-run",
                "--repo-root",
                str(self.repo_root),
            ],
            cwd=PROJECT_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        trace = json.loads(completed.stdout)["trace"]
        self.assertEqual(trace["last_resume_event"]["type"], "resume_fallback_used")
        self.assertEqual(trace["last_launch_event"]["type"], "native_launch_recorded")

    def test_dispatch_worker_resumes_codex_headless_session_when_provider_succeeds(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Resume a codex worker headlessly",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T05:40:00Z",
        )
        self._set_stage_worker(
            stage="rapid-implementing",
            worker_id="wrk_root_impl_01",
        )

        dispatch_worker(
            repo_root=self.repo_root,
            timestamp="2026-04-12T05:41:00Z",
            session_id="sess-prev-123",
        )
        resume_run(
            repo_root=self.repo_root,
            timestamp="2026-04-12T05:42:00Z",
        )

        def fake_run_command(args: list[str], *, cwd: Path) -> dict:
            self._write_json(
                ".praxis/results/rapid-implementing.json",
                {
                    "version": 3,
                    "stage": "rapid-implementing",
                    "artifact_dir": ".praxis",
                    "route": {"kind": "proceed", "next_stage": None},
                },
            )
            return {
                "ok": True,
                "returncode": 0,
                "stdout": json.dumps({"session_id": "sess-prev-123"}) + "\n",
                "stderr": "",
                "error": None,
                "args": args,
            }

        with patch("praxis.runtime.adapters.provider_resume._run_command", side_effect=fake_run_command):
            action = dispatch_worker(
                repo_root=self.repo_root,
                timestamp="2026-04-12T05:43:00Z",
            )

        self.assertEqual(action, "worker_resumed")

        run = load_json(self.repo_root / ".praxis" / "run.json")
        self.assertEqual(run["current"]["session_id"], "sess-prev-123")
        self.assertEqual(run["routing"]["pending_worker_action"], "await_stage_result")
        self.assertEqual(
            run["routing"]["reason"],
            "Awaiting rapid-implementing stage results from resumed worker wrk_root_impl_01.",
        )

        resume_records = sorted((self.repo_root / ".praxis" / "runtime" / "resumes" / "codex").glob("*.json"))
        self.assertEqual(len(resume_records), 1)
        resume_record = load_json(resume_records[0])
        validate_contract_payload("native-resume.schema.json", resume_record)
        self.assertEqual(resume_record["outcome"], "resumed")
        self.assertEqual(resume_record["resume_mode"], "headless")

        session_record = load_json(
            sorted((self.repo_root / ".praxis" / "runtime" / "sessions" / "codex").glob("*.json"))[0]
        )
        self.assertEqual(session_record["last_resume_outcome"], "resumed")
        self.assertEqual(session_record["session_origin"], "headless_resume")

        events = [
            json.loads(line)
            for line in (self.repo_root / ".praxis" / "events.jsonl").read_text().splitlines()
            if line.strip()
        ]
        self.assertEqual(
            [event["type"] for event in events][-3:],
            ["provider_resume_requested", "provider_resume_succeeded", "worker_resumed"],
        )

        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "praxis.runtime.orchestrator",
                "show-run",
                "--repo-root",
                str(self.repo_root),
            ],
            cwd=PROJECT_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        trace = json.loads(completed.stdout)["trace"]
        self.assertEqual(trace["last_resume_event"]["type"], "worker_resumed")

    def test_resume_run_rehydrates_a_dispatched_worker_back_to_resume_or_launch(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Recover an in-flight worker",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T05:20:00Z",
        )
        run_path = self.repo_root / ".praxis" / "run.json"
        run = load_json(run_path)
        run["current"]["stage"] = "rapid-implementing"
        run["current"]["worker_id"] = "wrk_root_impl_01"
        run["routing"]["next_stage"] = "rapid-implementing"
        run_path.write_text(json.dumps(run, indent=2) + "\n")

        dispatch_worker(
            repo_root=self.repo_root,
            timestamp="2026-04-12T05:21:00Z",
        )

        action = resume_run(
            repo_root=self.repo_root,
            timestamp="2026-04-12T05:22:00Z",
        )

        self.assertEqual(action, "resume_active")
        run = load_json(self.repo_root / ".praxis" / "run.json")
        self.assertEqual(run["routing"]["pending_worker_action"], "resume_or_launch")
        self.assertIsNotNone(run["current"]["session_id"])

    def test_dispatch_worker_rejects_interactive_orchestrator_stages(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Keep interactive clarification in the native cockpit",
            adapter="codex",
            execution_mode="manual",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T05:30:00Z",
        )

        with self.assertRaisesRegex(ValueError, "worker_class='interactive_orchestrator'"):
            dispatch_worker(
                repo_root=self.repo_root,
                timestamp="2026-04-12T05:31:00Z",
            )


if __name__ == "__main__":
    unittest.main()
