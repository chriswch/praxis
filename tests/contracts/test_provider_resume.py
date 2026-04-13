import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from praxis.runtime.adapters.harness import build_worker_launch_payload
from praxis.runtime.adapters.native_resume import update_session_record_after_launch
from praxis.runtime.orchestrator import initialize_run, resume_run
from praxis.runtime.adapters.provider_resume import attempt_provider_resume
from praxis.runtime.state.contract_validation import validate_contract_payload
from praxis.runtime.workers.dispatch import dispatch_worker


class ProviderResumeContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / ".praxis" / "results").mkdir(parents=True, exist_ok=True)
        self._write_claude_harness()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write_text(self, rel_path: str, text: str) -> None:
        path = self.repo_root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def _write_json(self, rel_path: str, payload: dict) -> None:
        self._write_text(rel_path, json.dumps(payload, indent=2) + "\n")

    def _write_claude_harness(self) -> None:
        self._write_text("CLAUDE.md", "native claude instructions\n")
        self._write_text(".claude/settings.json", "{}\n")
        (self.repo_root / ".claude" / "hooks").mkdir(parents=True, exist_ok=True)
        (self.repo_root / ".claude" / "agents").mkdir(parents=True, exist_ok=True)
        self._write_text(".claude-plugin/settings.md", "compat settings\n")
        (self.repo_root / ".claude-plugin" / "hooks").mkdir(parents=True, exist_ok=True)
        (self.repo_root / ".claude-plugin" / "subagents").mkdir(parents=True, exist_ok=True)
        self._write_text(".claude/extensions.md", "extensions\n")
        self._write_json(
            ".claude/adapter.json",
            {
                "version": 1,
                "adapter": "claude",
                "instructions_path": "CLAUDE.md",
                "project_config_path": ".claude/settings.json",
                "hooks_path": ".claude/hooks",
                "agents_path": ".claude/agents",
                "worker_launch_command": 'python3 -c "import sys; sys.exit(0)"',
                "extension_points": {
                    "mcp_config_path": ".claude/extensions.md",
                    "resources_path": None,
                    "tool_overrides_path": None,
                    "notes_path": ".claude/extensions.md",
                },
                "compatibility": {
                    "settings_path": ".claude-plugin/settings.md",
                    "hooks_path": ".claude-plugin/hooks",
                    "subagents_path": ".claude-plugin/subagents",
                },
            },
        )

    def test_attempt_provider_resume_falls_back_when_claude_headless_resume_is_not_supported(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Resume a claude worker headlessly",
            adapter="claude",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T06:00:00Z",
        )
        run_path = self.repo_root / ".praxis" / "run.json"
        run = json.loads(run_path.read_text())
        run["current"]["stage"] = "rapid-implementing"
        run["current"]["worker_id"] = "wrk_root_impl_01"
        run["routing"]["next_stage"] = "rapid-implementing"
        run_path.write_text(json.dumps(run, indent=2) + "\n")

        dispatch_worker(
            repo_root=self.repo_root,
            timestamp="2026-04-12T06:01:00Z",
            session_id="claude-prev-123",
        )
        update_session_record_after_launch(
            repo_root=self.repo_root,
            adapter="claude",
            worker_id="wrk_root_impl_01",
            recorded_at="2026-04-12T06:01:30Z",
            provider_locator="claude-prev-123",
        )
        resume_run(
            repo_root=self.repo_root,
            timestamp="2026-04-12T06:02:00Z",
        )

        with patch(
            "praxis.runtime.adapters.provider_resume._run_command",
            return_value={
                "ok": True,
                "returncode": 0,
                "stdout": "Claude help with --resume only\n",
                "stderr": "",
                "error": None,
                "args": ["claude", "--help"],
            },
        ):
            payload = build_worker_launch_payload(repo_root=self.repo_root)
            result = attempt_provider_resume(
                repo_root=self.repo_root,
                payload=payload,
                timestamp="2026-04-12T06:03:00Z",
            )

        self.assertEqual(result["status"], "fallback")
        self.assertEqual(result["reason_code"], "headless_resume_unsupported")

        resume_records = sorted((self.repo_root / ".praxis" / "runtime" / "resumes" / "claude").glob("*.json"))
        self.assertEqual(len(resume_records), 1)
        resume_record = json.loads(resume_records[0].read_text())
        self.assertEqual(resume_record["resume_mode"], "headless")
        self.assertEqual(resume_record["reason_code"], "headless_resume_unsupported")

        events = [
            json.loads(line)
            for line in (self.repo_root / ".praxis" / "events.jsonl").read_text().splitlines()
            if line.strip()
        ]
        self.assertEqual(
            [event["type"] for event in events][-2:],
            ["provider_resume_requested", "provider_resume_failed"],
        )

        trace_events = [
            json.loads(line)
            for line in (self.repo_root / payload["resume"]["trace_path"]).read_text().splitlines()
            if line.strip()
        ]
        self.assertEqual(
            [event["type"] for event in trace_events][-2:],
            ["provider_resume_requested", "provider_resume_failed"],
        )
        for trace_event in trace_events[-2:]:
            validate_contract_payload("trace-event.schema.json", trace_event)


if __name__ == "__main__":
    unittest.main()
