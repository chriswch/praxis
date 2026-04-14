import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from praxis.runtime.orchestrator import initialize_run
from praxis.runtime.policy_records import policy_history_snapshot
from praxis.runtime.state.contract_validation import validate_contract_payload
from praxis.runtime.tool_broker import invoke_repo_read, invoke_repo_shell, tool_usage_snapshot
from praxis.runtime.workers.dispatch import dispatch_worker


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def load_json(path: Path):
    return json.loads(path.read_text())


class ToolBrokerContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / ".praxis" / "results").mkdir(parents=True, exist_ok=True)
        self._write_codex_harness()
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Broker bounded tools for a worker",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-14T07:00:00Z",
        )
        dispatch_worker(repo_root=self.repo_root, timestamp="2026-04-14T07:01:00Z")
        self.worker_id = load_json(self.repo_root / ".praxis" / "run.json")["current"]["worker_id"]
        self.dispatch_id = load_json(self.repo_root / ".praxis" / "runtime" / "workers" / f"{self.worker_id}.json")["dispatch_id"]

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

    def _run_cli(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, "-m", "praxis.cli.main", *args],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_broker_records_successful_reads_and_shell_usage(self) -> None:
        read_result = invoke_repo_read(
            repo_root=self.repo_root,
            worker_id=self.worker_id,
            path="AGENTS.md",
            timestamp="2026-04-14T07:02:00Z",
        )
        self.assertEqual(read_result["status"], "completed")
        self.assertIn("native codex instructions", read_result["content"])

        shell_result = invoke_repo_shell(
            repo_root=self.repo_root,
            worker_id=self.worker_id,
            argv=["pwd"],
            timestamp="2026-04-14T07:03:00Z",
        )
        self.assertEqual(shell_result["status"], "completed")

        usage = tool_usage_snapshot(repo_root=self.repo_root, dispatch_id=self.dispatch_id)
        self.assertEqual(usage["count"], 2)
        self.assertEqual(usage["denied_count"], 0)
        self.assertEqual(usage["failed_count"], 0)
        self.assertEqual(usage["latest"]["tool_id"], "repo_shell")

        for item in usage["items"]:
            validate_contract_payload("tool-record.schema.json", load_json(self.repo_root / item["record_path"]))

        status_completed = self._run_cli("status", "--repo-root", str(self.repo_root), "--json")
        self.assertEqual(status_completed.returncode, 0, status_completed.stderr)
        status_result = json.loads(status_completed.stdout)
        tool_usage = status_result["data"]["run"]["tool_usage"]["active_dispatch"]
        self.assertEqual(tool_usage["count"], 2)
        self.assertEqual(tool_usage["denied_count"], 0)

        doctor_completed = self._run_cli("doctor", "--repo-root", str(self.repo_root), "--json")
        self.assertEqual(doctor_completed.returncode, 0, doctor_completed.stderr)
        doctor_result = json.loads(doctor_completed.stdout)
        checks = {check["name"]: check for check in doctor_result["data"]["checks"]}
        self.assertEqual(checks["tool_usage"]["status"], "ok")

    def test_broker_denies_network_shell_commands_and_records_policy(self) -> None:
        result = invoke_repo_shell(
            repo_root=self.repo_root,
            worker_id=self.worker_id,
            argv=["curl", "https://example.com"],
            timestamp="2026-04-14T07:04:00Z",
        )
        self.assertEqual(result["status"], "denied")
        self.assertEqual(result["reason_code"], "network_denied")

        usage = tool_usage_snapshot(repo_root=self.repo_root, dispatch_id=self.dispatch_id)
        self.assertEqual(usage["denied_count"], 1)
        latest_record = load_json(self.repo_root / usage["latest"]["record_path"])
        validate_contract_payload("tool-record.schema.json", latest_record)
        self.assertEqual(latest_record["outcome"]["status"], "denied")
        self.assertEqual(latest_record["outcome"]["reason_code"], "network_denied")

        policies = policy_history_snapshot(repo_root=self.repo_root)
        self.assertEqual(policies["latest"]["gate_type"], "network")
        self.assertEqual(policies["latest"]["reason_code"], "network_denied")

        doctor_completed = self._run_cli("doctor", "--repo-root", str(self.repo_root), "--json")
        self.assertEqual(doctor_completed.returncode, 0, doctor_completed.stderr)
        doctor_result = json.loads(doctor_completed.stdout)
        checks = {check["name"]: check for check in doctor_result["data"]["checks"]}
        self.assertEqual(checks["tool_usage"]["status"], "warn")

    def test_broker_denies_control_plane_writes_and_records_policy(self) -> None:
        result = invoke_repo_shell(
            repo_root=self.repo_root,
            worker_id=self.worker_id,
            argv=["touch", ".praxis/run.json"],
            write_paths=[".praxis/run.json"],
            timestamp="2026-04-14T07:05:00Z",
        )
        self.assertEqual(result["status"], "denied")
        self.assertEqual(result["reason_code"], "control_plane_write_denied")

        usage = tool_usage_snapshot(repo_root=self.repo_root, dispatch_id=self.dispatch_id)
        latest_record = load_json(self.repo_root / usage["latest"]["record_path"])
        self.assertEqual(latest_record["outcome"]["reason_code"], "control_plane_write_denied")

        policies = policy_history_snapshot(repo_root=self.repo_root)
        self.assertEqual(policies["latest"]["gate_type"], "control_plane_write")
        self.assertEqual(policies["latest"]["reason_code"], "control_plane_write_denied")


if __name__ == "__main__":
    unittest.main()
