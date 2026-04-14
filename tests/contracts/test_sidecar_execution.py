import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from praxis.runtime.orchestrator import initialize_run
from praxis.runtime.state.contract_validation import validate_contract_payload
from praxis.runtime.state.durable_state import load_json


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class SidecarExecutionContractTest(unittest.TestCase):
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
            check=False,
            capture_output=True,
            text=True,
        )

    def _init_git_repo(self) -> None:
        subprocess.run(["git", "init"], cwd=self.repo_root, check=True, capture_output=True, text=True)
        subprocess.run(["git", "config", "user.email", "sidecar@example.com"], cwd=self.repo_root, check=True)
        subprocess.run(["git", "config", "user.name", "Sidecar Test"], cwd=self.repo_root, check=True)
        subprocess.run(["git", "add", "."], cwd=self.repo_root, check=True)
        subprocess.run(
            ["git", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "init"],
            cwd=self.repo_root,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_dispatch_sidecar_records_a_real_non_owning_worker_without_mutating_run_cursor(self) -> None:
        self._init_git_repo()
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Launch a sidecar helper",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-14T06:00:00Z",
        )
        run_before = load_json(self.repo_root / ".praxis" / "run.json")
        owner_worker_id = run_before["current"]["worker_id"]

        completed = self._run_cli(
            "dispatch-sidecar",
            "--repo-root",
            str(self.repo_root),
            "--timestamp",
            "2026-04-14T06:01:00Z",
            "--worker-id",
            "wrk_sidecar_01",
            "--reason",
            "Summarize the bounded implementation diff without owning the run.",
            "--json",
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        sidecar = result["data"]["sidecar"]
        self.assertEqual(sidecar["worker_id"], "wrk_sidecar_01")
        self.assertTrue(sidecar["request_path"].endswith("/sidecar-request.json"))

        run_after = load_json(self.repo_root / ".praxis" / "run.json")
        self.assertEqual(run_after["current"]["worker_id"], owner_worker_id)
        self.assertEqual(run_after["routing"]["pending_worker_action"], "resume_or_launch")
        self.assertEqual(run_after["current"]["stage"], "clarifying-intent")

        request_path = self.repo_root / sidecar["request_path"]
        request = load_json(request_path)
        validate_contract_payload("sidecar-request.schema.json", request)
        self.assertEqual(request["worker"]["worker_class"], "subagent_worker")
        self.assertEqual(request["ownership"]["kind"], "sidecar")
        self.assertFalse(request["ownership"]["run_routing_owned"])
        self.assertFalse(request["ownership"]["stage_result_expected"])
        self.assertEqual(request["parent"]["worker_id"], owner_worker_id)

        worker_record_path = self.repo_root / ".praxis" / "runtime" / "workers" / "sidecars" / "wrk_sidecar_01.json"
        self.assertTrue(worker_record_path.exists())
        worker_record = load_json(worker_record_path)
        validate_contract_payload("worker-record.schema.json", worker_record)
        self.assertEqual(worker_record["worker_class"], "subagent_worker")
        self.assertEqual(worker_record["ownership"]["kind"], "sidecar")
        self.assertFalse(worker_record["ownership"]["run_routing_owned"])

        launch_record_path = self.repo_root / worker_record["launch_record_path"]
        launch_record = load_json(launch_record_path)
        validate_contract_payload("native-launch.schema.json", launch_record)
        self.assertEqual(launch_record["session"]["source"], "control_plane_sidecar")
        self.assertEqual(launch_record["ownership"]["kind"], "sidecar")

        dispatch_record = load_json(self.repo_root / worker_record["dispatch_record_path"])
        validate_contract_payload("dispatch-record.schema.json", dispatch_record)
        self.assertEqual(dispatch_record["ownership"]["kind"], "sidecar")
        self.assertFalse(dispatch_record["ownership"]["run_routing_owned"])
        self.assertFalse(dispatch_record["ownership"]["stage_result_expected"])

        status_completed = self._run_cli("status", "--repo-root", str(self.repo_root), "--json")
        self.assertEqual(status_completed.returncode, 0, status_completed.stderr)
        status_result = json.loads(status_completed.stdout)
        sidecars = status_result["data"]["run"]["sidecars"]
        self.assertEqual(sidecars["count"], 1)
        self.assertEqual(sidecars["items"][0]["worker_id"], "wrk_sidecar_01")
        self.assertEqual(sidecars["items"][0]["artifact_namespace"], "sidecar")

        doctor_completed = self._run_cli("doctor", "--repo-root", str(self.repo_root), "--json")
        self.assertEqual(doctor_completed.returncode, 0, doctor_completed.stderr)
        doctor_result = json.loads(doctor_completed.stdout)
        checks = {check["name"]: check for check in doctor_result["data"]["checks"]}
        self.assertEqual(checks["sidecar_workers"]["status"], "ok")
        self.assertEqual(checks["sidecar_workers"]["details"]["count"], 1)

    def test_submit_stage_result_rejects_non_owner_sidecar_results(self) -> None:
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Reject sidecar stage advancement",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-14T06:10:00Z",
        )

        self._write_json(
            ".praxis/runtime/sidecars/wrk_sidecar_02/results/clarifying-intent.json",
            {
                "version": 3,
                "stage": "clarifying-intent",
                "artifact_dir": ".praxis/runtime/sidecars/wrk_sidecar_02",
                "status": "completed",
                "summary_path": ".praxis/runtime/sidecars/wrk_sidecar_02/notes.md",
                "artifacts_written": [
                    ".praxis/runtime/sidecars/wrk_sidecar_02/results/clarifying-intent.json",
                    ".praxis/runtime/sidecars/wrk_sidecar_02/notes.md",
                ],
                "route": {"kind": "done", "next_stage": None, "next_slice_id": None},
                "data": {"outcome_code": "sidecar_complete"},
                "needs_user_input": False,
                "needs_confirmation": False,
                "run_id": "run_20260414061000",
                "worker": {
                    "worker_id": "wrk_sidecar_02",
                    "adapter": "codex",
                    "session_id": "sess-sidecar-02",
                    "worker_class": "subagent_worker",
                },
                "execution": {
                    "permission_profile": "planning",
                    "worktree_mode": "isolated",
                    "fresh_context": True,
                    "resumed": False,
                },
                "input_artifacts": [".praxis/run.json"],
                "output_artifacts": [
                    ".praxis/runtime/sidecars/wrk_sidecar_02/results/clarifying-intent.json",
                    ".praxis/runtime/sidecars/wrk_sidecar_02/notes.md",
                ],
                "verification": {"tests_run": False, "diff_reviewed": False},
                "handoff": None,
            },
        )

        completed = self._run_cli(
            "submit-stage-result",
            "--repo-root",
            str(self.repo_root),
            "--timestamp",
            "2026-04-14T06:11:00Z",
            "--stage-result-path",
            ".praxis/runtime/sidecars/wrk_sidecar_02/results/clarifying-intent.json",
            "--json",
        )
        self.assertEqual(completed.returncode, 2)
        result = json.loads(completed.stdout)
        self.assertEqual(result["error"]["code"], "stage_result_non_owner")


if __name__ == "__main__":
    unittest.main()
