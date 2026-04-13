import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from praxis.runtime.orchestrator import initialize_run


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CLI = [sys.executable, "-m", "praxis.cli.main"]


def load_json(path: Path):
    return json.loads(path.read_text())


class PraxisCliContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / ".praxis" / "results").mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _run_cli(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [*CLI, *args],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
        )

    def _write_json(self, rel_path: str, payload: dict) -> None:
        path = self.repo_root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2) + "\n")

    def _write_text(self, rel_path: str, text: str) -> None:
        path = self.repo_root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def _ensure_path(self, rel_path: str) -> None:
        path = self.repo_root / rel_path
        if path.suffix:
            self._write_text(rel_path, "placeholder\n")
            return
        path.mkdir(parents=True, exist_ok=True)

    def _write_adapter_harness(self, adapter: str) -> None:
        if adapter == "codex":
            self._write_json(
                ".codex/adapter.json",
                {
                    "version": 1,
                    "adapter": "codex",
                    "instructions_path": "AGENTS.md",
                    "project_config_path": ".codex/config.toml",
                    "hooks_path": ".codex/hooks.json",
                    "agents_path": ".codex/agents",
                    "worker_launch_command": "praxis dispatch --json",
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
            self._write_text("AGENTS.md", "codex instructions\n")
            self._write_text(".codex/config.toml", "[features]\ncli = true\n")
            self._write_text(".codex/hooks.json", "{}\n")
            self._ensure_path(".codex/agents")
            self._write_text(".codex-plugin/extensions.md", "extensions\n")
            self._write_text(".codex-plugin/settings.md", "compat settings\n")
            self._ensure_path(".codex-plugin/hooks")
            self._ensure_path(".codex-plugin/subagents")
            return

        self._write_json(
            ".claude/adapter.json",
            {
                "version": 1,
                "adapter": "claude",
                "instructions_path": "CLAUDE.md",
                "project_config_path": ".claude/settings.json",
                "hooks_path": ".claude/hooks",
                "agents_path": ".claude/agents",
                "worker_launch_command": "praxis dispatch --json",
                "extension_points": {
                    "mcp_config_path": ".claude-plugin/extensions.md",
                    "resources_path": None,
                    "tool_overrides_path": None,
                    "notes_path": ".claude-plugin/extensions.md",
                },
                "compatibility": {
                    "settings_path": ".claude-plugin/settings.md",
                    "hooks_path": ".claude-plugin/hooks",
                    "subagents_path": ".claude-plugin/subagents",
                },
            },
        )
        self._write_text("CLAUDE.md", "claude instructions\n")
        self._write_text(".claude/settings.json", "{}\n")
        self._ensure_path(".claude/hooks")
        self._ensure_path(".claude/agents")
        self._write_text(".claude-plugin/extensions.md", "extensions\n")
        self._write_text(".claude-plugin/settings.md", "compat settings\n")
        self._ensure_path(".claude-plugin/hooks")
        self._ensure_path(".claude-plugin/subagents")

    def test_run_returns_phase1_success_envelope(self) -> None:
        completed = self._run_cli(
            "run",
            "--repo-root",
            str(self.repo_root),
            "--workflow",
            "forge",
            "--entry-task",
            "Implement the public CLI",
            "--adapter",
            "codex",
            "--execution-mode",
            "autopilot",
            "--timestamp",
            "2026-04-12T04:30:00Z",
            "--json",
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)

        self.assertTrue(result["ok"])
        self.assertEqual(result["output_version"], 1)
        self.assertEqual(result["command"], "run")
        self.assertEqual(result["timestamp"], "2026-04-12T04:30:00Z")
        self.assertEqual(result["repo_root"], str(self.repo_root.resolve()))
        self.assertEqual(result["data"]["transition_action"], "run_stage")
        run = result["data"]["run"]
        self.assertEqual(run["workflow"], "forge")
        self.assertEqual(run["run_status"], "running")
        self.assertEqual(run["execution_mode"], "autopilot")
        self.assertEqual(run["current"]["stage"], "clarifying-intent")
        self.assertEqual(run["routing"]["next_action"], "run_stage")
        self.assertEqual(run["dispatch"]["stage"], "clarifying-intent")

    def test_run_restarts_cleanly_after_a_completed_run(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Finish the first run",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T04:30:00Z",
        )
        run = load_json(self.repo_root / ".praxis" / "run.json")
        run["status"] = "completed"
        run["current"]["stage"] = None
        run["routing"]["next_action"] = "finish"
        run["routing"]["next_stage"] = None
        run["routing"]["pending_worker_action"] = None
        run["routing"]["resume_strategy"] = None
        run["timestamps"]["updated_at"] = "2026-04-12T04:31:00Z"
        self._write_json(".praxis/run.json", run)
        self._write_text(".praxis/events.jsonl", "{\"ts\":\"2026-04-12T04:31:00Z\",\"type\":\"native_launch_recorded\"}\n")

        completed = self._run_cli(
            "run",
            "--repo-root",
            str(self.repo_root),
            "--workflow",
            "craft",
            "--entry-task",
            "Start another run",
            "--adapter",
            "claude",
            "--execution-mode",
            "manual",
            "--timestamp",
            "2026-04-12T04:32:00Z",
            "--json",
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertTrue(result["ok"])
        run_snapshot = result["data"]["run"]
        self.assertEqual(run_snapshot["workflow"], "craft")
        self.assertEqual(run_snapshot["run_status"], "running")
        self.assertEqual(run_snapshot["execution_mode"], "manual")
        self.assertEqual(run_snapshot["current"]["stage"], "clarifying-intent")
        self.assertEqual(run_snapshot["trace"]["event_count"], 0)

    def test_status_returns_nested_snapshot(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Inspect the current run",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T04:31:00Z",
        )

        completed = self._run_cli("status", "--repo-root", str(self.repo_root), "--json")

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        run = result["data"]["run"]
        self.assertEqual(run["current"]["artifact_dir"], ".praxis")
        self.assertEqual(run["routing"]["pending_worker_action"], "resume_or_launch")
        self.assertEqual(run["dispatch"]["action"], "run_stage")
        self.assertIn("trace", run)
        self.assertIn("event_count", run["trace"])

    def test_continue_returns_blocked_error_when_confirmation_is_not_pending(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Continue the wrong state",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T04:32:00Z",
        )

        completed = self._run_cli(
            "continue",
            "--repo-root",
            str(self.repo_root),
            "--timestamp",
            "2026-04-12T04:33:00Z",
            "--json",
        )

        self.assertEqual(completed.returncode, 3)
        result = json.loads(completed.stdout)
        self.assertFalse(result["ok"])
        self.assertEqual(result["command"], "continue")
        self.assertEqual(result["error"]["code"], "blocked")
        self.assertEqual(result["error"]["details"]["next_action"], "run_stage")

    def test_dispatch_returns_launch_worker_envelope_and_updates_run_snapshot(self) -> None:
        self._write_adapter_harness("codex")
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Dispatch the next worker",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T04:34:00Z",
        )

        completed = self._run_cli(
            "dispatch",
            "--repo-root",
            str(self.repo_root),
            "--timestamp",
            "2026-04-12T04:35:00Z",
            "--json",
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertTrue(result["ok"])
        self.assertEqual(result["data"]["transition_action"], "launch_worker")
        run = result["data"]["run"]
        self.assertEqual(run["routing"]["pending_worker_action"], "await_stage_result")
        self.assertIsNotNone(run["current"]["session_id"])
        self.assertEqual(run["trace"]["last_launch_event"]["type"], "native_launch_recorded")

    def test_build_worker_launch_returns_public_payload(self) -> None:
        self._write_adapter_harness("claude")
        initialize_run(
            repo_root=self.repo_root,
            workflow="craft",
            entry_task="Build the worker launch payload",
            adapter="claude",
            execution_mode="manual",
            entrypoint="praxis:craft",
            timestamp="2026-04-12T04:36:00Z",
        )

        completed = self._run_cli("build-worker-launch", "--repo-root", str(self.repo_root), "--json")

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        launch = result["data"]["launch"]
        self.assertEqual(launch["workflow"], "craft")
        self.assertEqual(launch["adapter"], "claude")
        self.assertEqual(launch["dispatch"]["stage"], "clarifying-intent")
        self.assertEqual(launch["harness"]["config_path"], ".claude/adapter.json")
        self.assertEqual(launch["harness"]["worker_launch_command"], "praxis dispatch --json")

    def test_harness_show_adapter_returns_native_harness_shape(self) -> None:
        self._write_adapter_harness("codex")

        completed = self._run_cli(
            "harness",
            "show-adapter",
            "--repo-root",
            str(self.repo_root),
            "--adapter",
            "codex",
            "--json",
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        harness = result["data"]["harness"]
        self.assertEqual(harness["config_path"], ".codex/adapter.json")
        self.assertEqual(harness["adapter"], "codex")
        self.assertEqual(harness["worker_launch_command"], "praxis dispatch --json")

    def test_submit_stage_result_reports_stage_result_mismatch(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Reject an out-of-order result",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T04:37:00Z",
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

        completed = self._run_cli(
            "submit-stage-result",
            "--repo-root",
            str(self.repo_root),
            "--stage-result-path",
            ".praxis/results/sketching-design.json",
            "--timestamp",
            "2026-04-12T04:38:00Z",
            "--json",
        )

        self.assertEqual(completed.returncode, 2)
        result = json.loads(completed.stdout)
        self.assertFalse(result["ok"])
        self.assertEqual(result["command"], "submit-stage-result")
        self.assertEqual(result["error"]["code"], "stage_result_mismatch")


if __name__ == "__main__":
    unittest.main()
