import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from workflow.scripts.handoff_policy import build_handoff_payload
from workflow.scripts.harness_config import build_worker_launch_payload, load_adapter_harness
from workflow.scripts.orchestrator import initialize_run


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def load_json(path: Path):
    return json.loads(path.read_text())


class HarnessConfigContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)
        (self.repo_root / ".praxis" / "results").mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write_json(self, rel_path: str, payload: dict) -> None:
        path = self.repo_root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2) + "\n")

    def _write_adapter_harness(self, adapter: str) -> None:
        plugin_dir = ".claude-plugin" if adapter == "claude" else ".codex-plugin"
        self._write_json(
            f"{plugin_dir}/adapter.json",
            {
                "version": 1,
                "adapter": adapter,
                "settings_path": f"{plugin_dir}/settings.md",
                "hooks_path": f"{plugin_dir}/hooks",
                "subagents_path": f"{plugin_dir}/subagents",
                "worker_launch_command": "python3 -m workflow.scripts.harness_config build-worker-launch --repo-root .",
                "extension_points": {
                    "mcp_config_path": f"{plugin_dir}/extensions.md",
                    "resources_path": None,
                    "tool_overrides_path": None,
                    "notes_path": f"{plugin_dir}/extensions.md",
                },
            },
        )
        (self.repo_root / plugin_dir / "settings.md").write_text("settings\n")
        (self.repo_root / plugin_dir / "hooks").mkdir(parents=True, exist_ok=True)
        (self.repo_root / plugin_dir / "subagents").mkdir(parents=True, exist_ok=True)
        (self.repo_root / plugin_dir / "extensions.md").write_text("extensions\n")

    def test_loads_repo_scoped_adapter_harness(self) -> None:
        self._write_adapter_harness("codex")

        config_path, payload = load_adapter_harness(repo_root=self.repo_root, adapter="codex")

        self.assertEqual(config_path, ".codex-plugin/adapter.json")
        self.assertEqual(payload["settings_path"], ".codex-plugin/settings.md")
        self.assertEqual(payload["subagents_path"], ".codex-plugin/subagents")

    def test_build_worker_launch_payload_includes_dispatch_and_handoff(self) -> None:
        self._write_adapter_harness("codex")
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Launch a codex worker",
            adapter="codex",
            execution_mode="autopilot",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T03:00:00Z",
        )

        run = load_json(self.repo_root / ".praxis" / "run.json")
        run["mode"] = "multi_slice"
        run["current"]["scope"] = "slice"
        run["current"]["slice_id"] = "S-002"
        run["current"]["artifact_dir"] = ".praxis/slices/S-002"
        run["current"]["stage"] = "clarifying-intent"
        run["routing"]["boundary_handoff_path"] = ".praxis/slices/S-001/handoff.json"
        run["routing"]["next_action"] = "run_stage"
        run["routing"]["next_stage"] = "clarifying-intent"
        (self.repo_root / ".praxis" / "run.json").write_text(json.dumps(run, indent=2) + "\n")

        handoff = build_handoff_payload(
            story_id="S-001",
            next_story_id="S-002",
            summary="S-001 completed.",
            carry_forward_context=["Only the bounded handoff should cross the story boundary."],
            changed_paths=["workflow/scripts/harness_config.py"],
            commit_meta={"end_commit": "def2222"},
            generated_at="2026-04-12T03:01:00Z",
        )
        self._write_json(".praxis/slices/S-001/handoff.json", handoff)

        payload = build_worker_launch_payload(repo_root=self.repo_root)

        self.assertEqual(payload["adapter"], "codex")
        self.assertEqual(payload["workflow"], "forge")
        self.assertEqual(payload["dispatch"]["slice_id"], "S-002")
        self.assertEqual(payload["dispatch"]["boundary_handoff_path"], ".praxis/slices/S-001/handoff.json")
        self.assertEqual(payload["inputs"]["boundary_handoff"]["story_id"], "S-001")
        self.assertEqual(payload["harness"]["config_path"], ".codex-plugin/adapter.json")
        self.assertEqual(payload["harness"]["settings_path"], ".codex-plugin/settings.md")

    def test_cli_build_worker_launch_reports_repo_scoped_harness(self) -> None:
        self._write_adapter_harness("claude")
        initialize_run(
            repo_root=self.repo_root,
            workflow="craft",
            entry_task="Launch a claude worker",
            adapter="claude",
            execution_mode="manual",
            entrypoint="praxis:craft",
            timestamp="2026-04-12T03:05:00Z",
        )

        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "workflow.scripts.harness_config",
                "build-worker-launch",
                "--repo-root",
                str(self.repo_root),
            ],
            cwd=PROJECT_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        result = json.loads(completed.stdout)
        self.assertEqual(result["adapter"], "claude")
        self.assertEqual(result["dispatch"]["workflow"], "craft")
        self.assertEqual(result["harness"]["config_path"], ".claude-plugin/adapter.json")
        self.assertIsNone(result["inputs"]["boundary_handoff"])


if __name__ == "__main__":
    unittest.main()
