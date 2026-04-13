from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from praxis.runtime.orchestrator import initialize_run
from praxis.runtime.state.contract_validation import validate_contract_payload


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

    def _run_cli(self, *args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [*CLI, *args],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            env=env,
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

    def _init_git_repo(self) -> None:
        subprocess.run(["git", "init"], cwd=self.repo_root, check=True, capture_output=True, text=True)
        subprocess.run(
            ["git", "config", "user.email", "praxis@example.com"],
            cwd=self.repo_root,
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            ["git", "config", "user.name", "Praxis Tests"],
            cwd=self.repo_root,
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            ["git", "config", "commit.gpgsign", "false"],
            cwd=self.repo_root,
            check=True,
            capture_output=True,
            text=True,
        )
        self._write_text("README.md", "fixture repo\n")
        subprocess.run(["git", "add", "README.md"], cwd=self.repo_root, check=True, capture_output=True, text=True)
        subprocess.run(
            ["git", "commit", "-m", "init"],
            cwd=self.repo_root,
            check=True,
            capture_output=True,
            text=True,
        )

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
            self._write_text("AGENTS.md", "codex instructions\n")
            self._write_text(".codex/config.toml", "[features]\ncli = true\n")
            self._write_text(".codex/hooks.json", "{}\n")
            self._ensure_path(".codex/agents")
            self._write_text(".codex/extensions.md", "extensions\n")
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
        self._write_text("CLAUDE.md", "claude instructions\n")
        self._write_text(".claude/settings.json", "{}\n")
        self._ensure_path(".claude/hooks")
        self._ensure_path(".claude/agents")
        self._write_text(".claude/extensions.md", "extensions\n")
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

    def test_init_bootstraps_native_codex_surfaces(self) -> None:
        completed = self._run_cli(
            "init",
            "--repo-root",
            str(self.repo_root),
            "--adapter",
            "codex",
            "--json",
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertTrue(result["ok"])
        self.assertEqual(result["command"], "init")
        self.assertEqual(result["data"]["adapters"], ["codex"])
        self.assertIn(".codex/adapter.json", result["data"]["created"])
        self.assertIn(".codex/extensions.md", result["data"]["created"])

        payload = load_json(self.repo_root / ".codex" / "adapter.json")
        self.assertEqual(payload["extension_points"]["mcp_config_path"], ".codex/extensions.md")
        self.assertNotIn("compatibility", payload)

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
        self.assertEqual(run["approvals"]["count"], 0)
        self.assertEqual(run["policies"]["count"], 0)
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

    def test_approve_aliases_confirmation_flow(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Approve the next stage",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T04:33:00Z",
        )
        run = load_json(self.repo_root / ".praxis" / "run.json")
        run["status"] = "waiting_for_user"
        run["current"]["stage"] = "rapid-implementing"
        run["routing"]["next_action"] = "confirm_then_run"
        run["routing"]["next_stage"] = "rapid-implementing"
        self._write_json(".praxis/run.json", run)

        completed = self._run_cli(
            "approve",
            "--repo-root",
            str(self.repo_root),
            "--timestamp",
            "2026-04-12T04:34:00Z",
            "--json",
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertTrue(result["ok"])
        self.assertEqual(result["data"]["transition_action"], "run_stage")
        self.assertEqual(result["data"]["run"]["routing"]["next_action"], "run_stage")
        approvals = result["data"]["run"]["approvals"]
        self.assertEqual(approvals["count"], 1)
        self.assertEqual(approvals["latest"]["decision"], "approved")
        self.assertEqual(approvals["latest"]["source"], "approve")
        approval_record = load_json(self.repo_root / approvals["latest"]["record_path"])
        validate_contract_payload("approval-record.schema.json", approval_record)

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
        self.assertEqual(run["policies"]["count"], 3)
        self.assertEqual(run["trace"]["last_launch_event"]["type"], "native_launch_recorded")
        self.assertTrue(run["dispatch_bundle"]["available"])
        self.assertTrue(run["dispatch_bundle"]["worker_launch_path"].endswith("/worker-launch.json"))

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
        self.assertEqual(launch["harness"]["worker_launch_command"], 'python3 -c "import sys; sys.exit(0)"')
        self.assertTrue(launch["bundle"]["worker_launch_path"].endswith("/worker-launch.json"))
        self.assertTrue(launch["bundle"]["tool_manifest_path"].endswith("/tool-manifest.json"))
        bundle = result["data"]["dispatch_bundle"]
        self.assertTrue(bundle["available"])
        self.assertTrue(bundle["context_manifest_path"].endswith("/context-manifest.json"))
        self.assertTrue(bundle["context_within_budget"])
        self.assertGreaterEqual(bundle["default_item_count"], 1)
        self.assertTrue(bundle["tool_manifest_exists"])
        self.assertEqual(bundle["tool_count"], 4)

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
        self.assertEqual(harness["worker_launch_command"], 'python3 -c "import sys; sys.exit(0)"')

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

    def test_cancel_marks_the_run_cancelled(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Cancel the current run",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T04:40:00Z",
        )

        completed = self._run_cli(
            "cancel",
            "--repo-root",
            str(self.repo_root),
            "--timestamp",
            "2026-04-12T04:41:00Z",
            "--json",
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertTrue(result["ok"])
        self.assertEqual(result["data"]["transition_action"], "finish")
        self.assertEqual(result["data"]["run"]["run_status"], "cancelled")
        self.assertEqual(result["data"]["run"]["routing"]["next_action"], "finish")
        self.assertEqual(result["data"]["run"]["trace"]["last_stop_event"]["type"], "run_cancelled")
        approvals = result["data"]["run"]["approvals"]
        self.assertEqual(approvals["count"], 1)
        self.assertEqual(approvals["latest"]["decision"], "denied")
        self.assertEqual(approvals["latest"]["source"], "cancel")
        approval_record = load_json(self.repo_root / approvals["latest"]["record_path"])
        validate_contract_payload("approval-record.schema.json", approval_record)

    def test_cancel_cleans_an_isolated_worktree_and_marks_the_worker_cancelled(self) -> None:
        self._init_git_repo()
        self._write_adapter_harness("codex")
        adapter_path = self.repo_root / ".codex" / "adapter.json"
        adapter_payload = load_json(adapter_path)
        adapter_payload["worker_launch_command"] = 'python3 -c "import time; time.sleep(30)"'
        adapter_path.write_text(json.dumps(adapter_payload, indent=2) + "\n")
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Cancel an isolated review worker",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T04:41:00Z",
        )

        run_path = self.repo_root / ".praxis" / "run.json"
        run = load_json(run_path)
        run["current"]["stage"] = "code-reviewing"
        run["routing"]["next_action"] = "run_stage"
        run["routing"]["next_stage"] = "code-reviewing"
        run_path.write_text(json.dumps(run, indent=2) + "\n")

        dispatch = subprocess.run(
            [
                sys.executable,
                "-m",
                "praxis.cli.main",
                "dispatch",
                "--repo-root",
                str(self.repo_root),
                "--timestamp",
                "2026-04-12T04:41:30Z",
                "--json",
            ],
            cwd=PROJECT_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertEqual(dispatch.returncode, 0, dispatch.stderr)
        time.sleep(0.2)

        completed = self._run_cli(
            "cancel",
            "--repo-root",
            str(self.repo_root),
            "--timestamp",
            "2026-04-12T04:42:00Z",
            "--json",
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertTrue(result["ok"])
        self.assertEqual(result["data"]["run"]["run_status"], "cancelled")

        worker_record = load_json(self.repo_root / ".praxis" / "runtime" / "workers" / "wrk_root_review_01.json")
        self.assertEqual(worker_record["status"], "cancelled")
        self.assertFalse((self.repo_root / ".praxis" / "runtime" / "worktrees" / "wrk_root_review_01").exists())

        events = [
            json.loads(line)
            for line in (self.repo_root / ".praxis" / "events.jsonl").read_text().splitlines()
            if line.strip()
        ]
        self.assertIn("run_cancelled", [event["type"] for event in events])
        self.assertIn("worktree_cleaned", [event["type"] for event in events])

    def test_doctor_reports_harness_and_launch_health(self) -> None:
        self._write_adapter_harness("codex")
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Inspect doctor health",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T04:42:00Z",
        )

        completed = self._run_cli(
            "doctor",
            "--repo-root",
            str(self.repo_root),
            "--json",
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertTrue(result["ok"])
        self.assertTrue(result["data"]["healthy"])
        check_names = {check["name"] for check in result["data"]["checks"]}
        self.assertIn("active_dispatch_bundle", check_names)
        self.assertIn("codex_harness", check_names)
        self.assertIn("codex_launch_payload", check_names)

    def test_doctor_warns_about_stale_worktrees_and_failed_worker_logs(self) -> None:
        self._write_adapter_harness("codex")
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Inspect stale runtime artifacts",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T04:43:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        self._ensure_path(".praxis/runtime/worktrees/wrk_root_review_01")
        self._ensure_path(".praxis/runtime/logs")
        self._write_text(".praxis/runtime/logs/wrk_root_review_01.stderr.log", "simulated failure\n")
        self._write_json(
            ".praxis/runtime/workers/wrk_root_review_01.json",
            {
                "version": 1,
                "worker_id": "wrk_root_review_01",
                "run_id": run["run_id"],
                "adapter": "codex",
                "worker_class": "worktree_worker",
                "launch_surface": "codex_exec",
                "launch_reason": "Use an isolated reviewer worker.",
                "permission_profile": "review",
                "worktree_mode": "isolated",
                "worktree_path": ".praxis/runtime/worktrees/wrk_root_review_01",
                "session_id": "review-session-123",
                "launch_record_path": ".praxis/runtime/launches/codex/20260412T044300Z-wrk_root_review_01.json",
                "trace_path": ".praxis/runtime/traces/wrk_root_review_01.jsonl",
                "launcher_pid": None,
                "status": "failed",
            },
        )

        completed = self._run_cli(
            "doctor",
            "--repo-root",
            str(self.repo_root),
            "--json",
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        checks = {check["name"]: check for check in result["data"]["checks"]}
        self.assertEqual(checks["isolated_worktrees"]["status"], "warn")
        self.assertEqual(checks["isolated_worktrees"]["reason_code"], "stale_worktrees_present")
        self.assertEqual(checks["worker_logs"]["status"], "warn")
        self.assertEqual(checks["worker_logs"]["reason_code"], "failed_worker_logs_present")

    def test_doctor_reports_missing_provider_cli_and_missing_worker_launch_binary(self) -> None:
        self._write_adapter_harness("codex")
        adapter_path = self.repo_root / ".codex" / "adapter.json"
        adapter_payload = load_json(adapter_path)
        adapter_payload["worker_launch_command"] = "missing-launcher --flag"
        adapter_path.write_text(json.dumps(adapter_payload, indent=2) + "\n")
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Inspect missing binaries",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T04:44:00Z",
        )

        empty_path = self.repo_root / "empty-bin"
        empty_path.mkdir(parents=True, exist_ok=True)
        env = dict(os.environ)
        env["PATH"] = str(empty_path)

        completed = self._run_cli(
            "doctor",
            "--repo-root",
            str(self.repo_root),
            "--json",
            env=env,
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertFalse(result["data"]["healthy"])
        checks = {check["name"]: check for check in result["data"]["checks"]}
        self.assertEqual(checks["codex_provider_cli"]["status"], "error")
        self.assertEqual(checks["codex_provider_cli"]["reason_code"], "provider_cli_missing")
        self.assertEqual(checks["codex_worker_launch_command"]["status"], "error")
        self.assertEqual(
            checks["codex_worker_launch_command"]["reason_code"],
            "worker_launch_command_missing",
        )


if __name__ == "__main__":
    unittest.main()
