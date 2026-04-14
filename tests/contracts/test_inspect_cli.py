from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from praxis.runtime.orchestrator import initialize_run


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CLI = [sys.executable, "-m", "praxis.cli.main"]


def load_json(path: Path):
    return json.loads(path.read_text())


class InspectCliContractTest(unittest.TestCase):
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
                    "worker_launch_command": 'python3 -c "import sys; sys.exit(0)"',
                    "extension_points": {
                        "mcp_config_path": ".codex/extensions.md",
                        "resources_path": None,
                        "tool_overrides_path": None,
                        "notes_path": ".codex/extensions.md",
                    },
                },
            )
            self._write_text("AGENTS.md", "codex instructions\n")
            self._write_text(".codex/config.toml", "[features]\ncli = true\n")
            self._write_text(".codex/hooks.json", "{}\n")
            self._ensure_path(".codex/agents")
            self._write_text(".codex/extensions.md", "extensions\n")
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
            },
        )
        self._write_text("CLAUDE.md", "claude instructions\n")
        self._write_text(".claude/settings.json", "{}\n")
        self._ensure_path(".claude/hooks")
        self._ensure_path(".claude/agents")
        self._write_text(".claude/extensions.md", "extensions\n")

    def _initialize_running_dispatch(self) -> dict:
        self._write_adapter_harness("codex")
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Inspect the current run",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-14T01:00:00Z",
        )
        completed = self._run_cli(
            "dispatch",
            "--repo-root",
            str(self.repo_root),
            "--timestamp",
            "2026-04-14T01:01:00Z",
            "--json",
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        return json.loads(completed.stdout)["data"]["run"]

    def test_inspect_defaults_to_active_run_snapshot(self) -> None:
        run = self._initialize_running_dispatch()

        completed = self._run_cli("inspect", "--repo-root", str(self.repo_root), "--json")

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertTrue(result["ok"])
        self.assertEqual(result["command"], "inspect")
        self.assertEqual(result["data"]["run"]["run_id"], run["run_id"])
        inspect = result["data"]["inspect"]
        self.assertEqual(inspect["worker_id"], run["current"]["worker_id"])
        self.assertTrue(inspect["stdout_path"].endswith(".stdout.log"))
        self.assertTrue(inspect["trace_path"].endswith(".jsonl"))
        self.assertIn("praxis inspect watch", inspect["suggested_commands"])

    def test_inspect_run_rejects_non_active_run_id(self) -> None:
        self._initialize_running_dispatch()

        completed = self._run_cli(
            "inspect",
            "run",
            "run-old-123",
            "--repo-root",
            str(self.repo_root),
            "--json",
        )

        self.assertEqual(completed.returncode, 2)
        result = json.loads(completed.stdout)
        self.assertFalse(result["ok"])
        self.assertEqual(result["command"], "inspect run")
        self.assertEqual(result["error"]["code"], "unsupported_argument")

    def test_inspect_worker_returns_linked_runtime_records(self) -> None:
        run = self._initialize_running_dispatch()
        worker_id = run["current"]["worker_id"]

        completed = self._run_cli(
            "inspect",
            "worker",
            worker_id,
            "--repo-root",
            str(self.repo_root),
            "--json",
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        worker = result["data"]["worker"]["record"]
        self.assertEqual(worker["worker_id"], worker_id)
        self.assertEqual(result["data"]["session"]["record"]["worker_id"], worker_id)
        self.assertEqual(result["data"]["launch"]["record"]["worker"]["worker_id"], worker_id)
        self.assertEqual(result["data"]["trace"]["worker_id"], worker_id)
        self.assertTrue(result["data"]["logs"]["stdout_path"].endswith(".stdout.log"))

    def test_inspect_session_returns_resumability_and_linked_records(self) -> None:
        run = self._initialize_running_dispatch()
        session_id = run["current"]["session_id"]

        completed = self._run_cli(
            "inspect",
            "session",
            session_id,
            "--repo-root",
            str(self.repo_root),
            "--json",
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        session = result["data"]["session"]["record"]
        self.assertEqual(session["session_id"], session_id)
        self.assertEqual(result["data"]["linked_worker"]["worker"]["record"]["session_id"], session_id)
        self.assertEqual(result["data"]["linked_launch"]["record"]["session"]["id"], session_id)

    def test_inspect_logs_returns_recent_lines_in_json(self) -> None:
        run = self._initialize_running_dispatch()
        worker_id = run["current"]["worker_id"]
        self._write_text(f".praxis/runtime/logs/{worker_id}.stdout.log", "line 1\nline 2\nline 3\n")
        self._write_text(f".praxis/runtime/logs/{worker_id}.stderr.log", "err 1\n")

        completed = self._run_cli(
            "inspect",
            "logs",
            worker_id,
            "--tail",
            "2",
            "--repo-root",
            str(self.repo_root),
            "--json",
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        streams = {stream["stream"]: stream for stream in result["data"]["streams"]}
        self.assertEqual(streams["stdout"]["lines"], ["line 2", "line 3"])
        self.assertEqual(streams["stderr"]["lines"], ["err 1"])

    def test_inspect_logs_follow_streams_new_output(self) -> None:
        run = self._initialize_running_dispatch()
        worker_id = run["current"]["worker_id"]
        stdout_path = self.repo_root / ".praxis" / "runtime" / "logs" / f"{worker_id}.stdout.log"
        stdout_path.parent.mkdir(parents=True, exist_ok=True)
        stdout_path.write_text("seed\n")
        (self.repo_root / ".praxis" / "runtime" / "logs" / f"{worker_id}.stderr.log").write_text("")

        process = subprocess.Popen(
            [
                *CLI,
                "inspect",
                "logs",
                worker_id,
                "--follow",
                "--stream",
                "stdout",
                "--repo-root",
                str(self.repo_root),
            ],
            cwd=PROJECT_ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            time.sleep(0.3)
            with stdout_path.open("a", encoding="utf-8") as handle:
                handle.write("followed\n")
            time.sleep(0.5)
            process.terminate()
            stdout, stderr = process.communicate(timeout=5)
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate(timeout=5)

        self.assertEqual(stderr, "")
        self.assertIn("[stdout] seed", stdout)
        self.assertIn("[stdout] followed", stdout)

    def test_inspect_trace_filters_events(self) -> None:
        run = self._initialize_running_dispatch()
        worker_id = run["current"]["worker_id"]
        trace_path = self.repo_root / run["active_runtime"]["trace_stream"]["path"]
        with trace_path.open("a", encoding="utf-8") as handle:
            handle.write(
                json.dumps(
                    {
                        "version": 1,
                        "ts": "2026-04-14T01:02:00Z",
                        "type": "worker_process_started",
                        "adapter": "codex",
                        "dispatch_id": run["dispatch_bundle"]["dispatch_id"],
                        "worker_id": worker_id,
                        "worker_class": "session_worker",
                        "scope": "root",
                        "slice_id": None,
                        "artifact_dir": ".praxis",
                        "stage": "clarifying-intent",
                        "boundary_handoff_path": None,
                        "dispatch_record_path": run["dispatch_bundle"]["dispatch_record_path"],
                        "context_manifest_path": run["dispatch_bundle"]["context_manifest_path"],
                        "worker_record_path": run["active_runtime"]["worker_record"]["path"],
                        "reason_code": "worker_process_started",
                        "reason": "started",
                        "launch_surface": "codex_exec",
                    }
                )
                + "\n"
            )

        completed = self._run_cli(
            "inspect",
            "trace",
            worker_id,
            "--type",
            "worker_process_started",
            "--repo-root",
            str(self.repo_root),
            "--json",
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertEqual(result["data"]["event_count"], 1)
        self.assertEqual(result["data"]["events"][0]["type"], "worker_process_started")

    def test_inspect_events_filters_by_stage(self) -> None:
        self._initialize_running_dispatch()
        self._write_text(
            ".praxis/events.jsonl",
            "\n".join(
                [
                    json.dumps(
                        {
                            "ts": "2026-04-14T01:01:00Z",
                            "type": "native_launch_recorded",
                            "adapter": "codex",
                            "scope": "root",
                            "slice_id": None,
                            "artifact_dir": ".praxis",
                            "stage": "clarifying-intent",
                            "boundary_handoff_path": None,
                            "worker_id": "wrk_root_clarify_01",
                            "reason_code": "native_launch_recorded",
                            "reason": "Launch recorded.",
                        }
                    ),
                    json.dumps(
                        {
                            "ts": "2026-04-14T01:02:00Z",
                            "type": "boundary_started",
                            "adapter": "codex",
                            "scope": "root",
                            "slice_id": None,
                            "artifact_dir": ".praxis",
                            "stage": "code-reviewing",
                            "boundary_handoff_path": None,
                            "reason_code": "boundary_started",
                            "reason": "Boundary started.",
                        }
                    ),
                ]
            )
            + "\n",
        )

        completed = self._run_cli(
            "inspect",
            "events",
            "--stage",
            "code-reviewing",
            "--repo-root",
            str(self.repo_root),
            "--json",
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertEqual(result["data"]["event_count"], 1)
        self.assertEqual(result["data"]["events"][0]["stage"], "code-reviewing")

    def test_inspect_watch_once_prints_progress_snapshot(self) -> None:
        self._initialize_running_dispatch()

        completed = self._run_cli(
            "inspect",
            "watch",
            "--once",
            "--repo-root",
            str(self.repo_root),
        )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("Run        ", completed.stdout)
        self.assertIn("Ctrl-C to stop.", completed.stdout)

    def test_inspect_streaming_commands_reject_json_follow_pairs(self) -> None:
        run = self._initialize_running_dispatch()
        worker_id = run["current"]["worker_id"]

        cases = [
            ("logs", worker_id),
            ("trace", worker_id),
            ("events", None),
            ("watch", None),
        ]
        for subcommand, worker_or_none in cases:
            argv = ["inspect", subcommand]
            if worker_or_none is not None:
                argv.append(worker_or_none)
            if subcommand != "watch":
                argv.append("--follow")
            argv.extend(["--repo-root", str(self.repo_root), "--json"])
            completed = self._run_cli(*argv)
            self.assertEqual(completed.returncode, 2, completed.stderr)
            result = json.loads(completed.stdout)
            self.assertEqual(result["error"]["code"], "invalid_argument")


if __name__ == "__main__":
    unittest.main()
