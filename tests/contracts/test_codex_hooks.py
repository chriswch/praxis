import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from workflow.scripts.contract_validation import validate_contract_payload
from workflow.scripts.handoff_policy import build_handoff_payload
from workflow.scripts.orchestrator import initialize_run


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

    def _write_codex_harness(self) -> None:
        self._write_text("AGENTS.md", "native codex instructions\n")
        self._write_text(".codex/config.toml", "[features]\ncodex_hooks = true\n")
        self._write_text(".codex/hooks.json", "{}\n")
        (self.repo_root / ".codex" / "agents").mkdir(parents=True, exist_ok=True)
        self._write_text(".codex-plugin/settings.md", "compat settings\n")
        (self.repo_root / ".codex-plugin" / "hooks").mkdir(parents=True, exist_ok=True)
        (self.repo_root / ".codex-plugin" / "subagents").mkdir(parents=True, exist_ok=True)
        self._write_text(".codex-plugin/extensions.md", "extensions\n")
        self._write_json(
            ".codex-plugin/adapter.json",
            {
                "version": 1,
                "adapter": "codex",
                "instructions_path": "AGENTS.md",
                "project_config_path": ".codex/config.toml",
                "hooks_path": ".codex/hooks.json",
                "agents_path": ".codex/agents",
                "worker_launch_command": "python3 -m workflow.scripts.harness_config build-worker-launch --repo-root .",
                "extension_points": {
                    "mcp_config_path": ".codex-plugin/extensions.md",
                    "resources_path": None,
                    "tool_overrides_path": None,
                    "notes_path": ".codex-plugin/extensions.md",
                },
                "compatibility": {
                    "settings_path": ".codex-plugin/settings.md",
                    "hooks_path": ".codex-plugin/hooks",
                    "subagents_path": ".codex-plugin/subagents",
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
            changed_paths=["workflow/scripts/codex_hooks.py"],
            commit_meta={"end_commit": "abc1234"},
            generated_at="2026-04-12T03:01:00Z",
        )
        self._write_json(".praxis/slices/S-001/handoff.json", handoff)

        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "workflow.scripts.codex_hooks",
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

        launch_records = sorted((self.repo_root / ".praxis" / "runtime" / "codex-launches").glob("*.json"))
        self.assertEqual(len(launch_records), 1)

        record = json.loads(launch_records[0].read_text())
        validate_contract_payload("native-launch.schema.json", record)
        self.assertEqual(record["session"]["id"], "sess-123")
        self.assertEqual(record["dispatch"]["slice_id"], "S-002")
        self.assertEqual(record["dispatch"]["stage"], "clarifying-intent")
        self.assertTrue(record["context"]["fresh_context"])
        self.assertTrue(record["context"]["handoff_injected"])
        self.assertEqual(record["context"]["boundary_handoff_story_id"], "S-001")
        self.assertEqual(record["harness"]["instructions_path"], "AGENTS.md")
        self.assertEqual(record["harness"]["project_config_path"], ".codex/config.toml")


if __name__ == "__main__":
    unittest.main()
