from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from praxis.runtime.orchestrator import initialize_run
from praxis.runtime.workers.dispatch import dispatch_worker


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def load_json(path: Path):
    return json.loads(path.read_text())


class WorkerLauncherContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / ".praxis" / "results").mkdir(parents=True, exist_ok=True)
        self.fake_bin = self.repo_root / "bin"
        self.fake_bin.mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write_text(self, rel_path: str, text: str) -> None:
        path = self.repo_root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def _write_json(self, rel_path: str, payload: dict) -> None:
        self._write_text(rel_path, json.dumps(payload, indent=2) + "\n")

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

    def _launcher_command(self) -> str:
        return (
            f"env PYTHONPATH={PROJECT_ROOT / 'src'} "
            f"{sys.executable} -m praxis.runtime.workers.launcher --repo-root {self.repo_root}"
        )

    def _write_codex_harness(self) -> None:
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
                "worker_launch_command": self._launcher_command(),
                "extension_points": {
                    "mcp_config_path": ".codex/extensions.md",
                    "resources_path": None,
                    "tool_overrides_path": None,
                    "notes_path": ".codex/extensions.md",
                },
            },
        )

    def _write_fake_codex(self, *, provider_session_id: str | None = None, exit_code: int = 0) -> None:
        script = self.fake_bin / "codex"
        script.write_text(
            textwrap.dedent(
                f"""\
                #!/usr/bin/env python3
                import json
                import os
                import sys
                from pathlib import Path

                payload_path = Path(os.environ["PRAXIS_WORKER_PAYLOAD_PATH"])
                provider_session_id = {provider_session_id!r}
                payload = json.loads(payload_path.read_text())
                stage = payload["dispatch"]["stage"]
                artifact_dir = payload["dispatch"]["artifact_dir"]
                stage_result_path = Path(payload["dispatch"]["stage_result_path"])
                outcome_codes = {{
                    "clarifying-intent": "story_spec_ready",
                    "sketching-design": "sketch_ready",
                    "rapid-implementing": "implementation_complete",
                    "code-reviewing": "review_ready",
                    "code-improving": "improvement_ready",
                }}
                if {exit_code} == 0:
                    stage_result_path.parent.mkdir(parents=True, exist_ok=True)
                    stage_result_path.write_text(
                        json.dumps(
                            {{
                                "version": 3,
                                "stage": stage,
                                "artifact_dir": artifact_dir,
                                "route": {{"kind": "proceed", "next_stage": None}},
                                "data": {{"outcome_code": outcome_codes.get(stage, "implementation_complete")}},
                                "needs_user_input": False,
                                "needs_confirmation": False,
                            }},
                            indent=2,
                        )
                        + "\\n"
                    )
                if provider_session_id is not None:
                    print(json.dumps({{"session_id": provider_session_id}}))
                raise SystemExit({exit_code})
                """
            )
        )
        script.chmod(0o755)

    def _set_stage(self, *, stage: str) -> None:
        run_path = self.repo_root / ".praxis" / "run.json"
        run = load_json(run_path)
        run["current"]["stage"] = stage
        run["routing"]["next_action"] = "run_stage"
        run["routing"]["next_stage"] = stage
        run_path.write_text(json.dumps(run, indent=2) + "\n")

    def _wait_for_worker_status(self, worker_id: str, *expected_statuses: str) -> dict:
        worker_path = self.repo_root / ".praxis" / "runtime" / "workers" / f"{worker_id}.json"
        deadline = time.time() + 5.0
        while time.time() < deadline:
            if worker_path.exists():
                worker_record = load_json(worker_path)
                if worker_record["status"] in expected_statuses:
                    return worker_record
            time.sleep(0.05)
        self.fail(f"Timed out waiting for {worker_id} to reach one of {expected_statuses}.")

    def _wait_for_worktree_cleanup(self, worker_id: str) -> None:
        worktree_path = self.repo_root / ".praxis" / "runtime" / "worktrees" / worker_id
        deadline = time.time() + 5.0
        while time.time() < deadline:
            if not worktree_path.exists():
                return
            time.sleep(0.05)
        self.fail(f"Timed out waiting for isolated worktree cleanup: {worktree_path}")

    def _events(self) -> list[dict]:
        return [
            json.loads(line)
            for line in (self.repo_root / ".praxis" / "events.jsonl").read_text().splitlines()
            if line.strip()
        ]

    def test_real_launcher_persists_provider_locator_and_one_terminal_completion_event(self) -> None:
        self._write_codex_harness()
        self._write_fake_codex(provider_session_id="provider-session-456", exit_code=0)
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Launch a real bounded worker",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T07:00:00Z",
        )

        env = {"PATH": f"{self.fake_bin}:{os.environ['PATH']}"}
        with patch.dict(os.environ, env, clear=False):
            action = dispatch_worker(
                repo_root=self.repo_root,
                timestamp="2026-04-12T07:01:00Z",
                session_id="ctrl-session-123",
            )

        self.assertEqual(action, "launch_worker")
        worker_record = self._wait_for_worker_status("wrk_root_clarify_01", "completed")
        self.assertEqual(worker_record["status"], "completed")

        launch_record = load_json(
            sorted((self.repo_root / ".praxis" / "runtime" / "launches" / "codex").glob("*.json"))[0]
        )
        session_record = load_json(
            sorted((self.repo_root / ".praxis" / "runtime" / "sessions" / "codex").glob("*.json"))[0]
        )
        self.assertEqual(session_record["session_id"], "ctrl-session-123")
        self.assertEqual(session_record["provider_locator"], "provider-session-456")
        self.assertTrue(session_record["resumable"])
        self.assertEqual(session_record["resumable_reason_code"], "provider_locator_recorded")
        self.assertEqual(launch_record["session"]["provider_locator"], "provider-session-456")
        self.assertTrue(launch_record["session"]["resumable"])

        events = self._events()
        terminal_events = [event for event in events if event["type"] in {"worker_process_completed", "worker_process_failed"}]
        self.assertEqual([event["type"] for event in events][-2:], ["worker_process_started", "worker_process_completed"])
        self.assertEqual(len(terminal_events), 1)
        self.assertEqual(terminal_events[0]["type"], "worker_process_completed")

    def test_real_launcher_cleans_isolated_worktree_after_success(self) -> None:
        self._init_git_repo()
        self._write_codex_harness()
        self._write_fake_codex(provider_session_id="review-session-456", exit_code=0)
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Review in an isolated worktree",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T07:10:00Z",
        )
        self._set_stage(stage="code-reviewing")

        env = {"PATH": f"{self.fake_bin}:{os.environ['PATH']}"}
        with patch.dict(os.environ, env, clear=False):
            action = dispatch_worker(
                repo_root=self.repo_root,
                timestamp="2026-04-12T07:11:00Z",
            )

        self.assertEqual(action, "launch_worker")
        worker_record = self._wait_for_worker_status("wrk_root_review_01", "completed")
        self.assertEqual(worker_record["status"], "completed")
        self._wait_for_worktree_cleanup("wrk_root_review_01")

        events = self._events()
        terminal_events = [event for event in events if event["type"] in {"worker_process_completed", "worker_process_failed"}]
        self.assertEqual(len(terminal_events), 1)
        self.assertEqual(terminal_events[0]["type"], "worker_process_completed")
        self.assertIn("worktree_cleaned", [event["type"] for event in events])

    def test_real_launcher_cleans_isolated_worktree_after_failure(self) -> None:
        self._init_git_repo()
        self._write_codex_harness()
        self._write_fake_codex(exit_code=7)
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Fail a review worker in an isolated worktree",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T07:20:00Z",
        )
        self._set_stage(stage="code-reviewing")

        env = {"PATH": f"{self.fake_bin}:{os.environ['PATH']}"}
        with patch.dict(os.environ, env, clear=False):
            action = dispatch_worker(
                repo_root=self.repo_root,
                timestamp="2026-04-12T07:21:00Z",
            )

        self.assertEqual(action, "launch_worker")
        worker_record = self._wait_for_worker_status("wrk_root_review_01", "failed")
        self.assertEqual(worker_record["status"], "failed")
        self._wait_for_worktree_cleanup("wrk_root_review_01")

        events = self._events()
        terminal_events = [event for event in events if event["type"] in {"worker_process_completed", "worker_process_failed"}]
        self.assertEqual(len(terminal_events), 1)
        self.assertEqual(terminal_events[0]["type"], "worker_process_failed")
        self.assertIn("worktree_cleaned", [event["type"] for event in events])


if __name__ == "__main__":
    unittest.main()
