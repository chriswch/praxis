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

    def _write_adapter_harness(
        self,
        adapter: str,
        *,
        omit_native_doc: bool = False,
        include_compatibility: bool = True,
    ) -> None:
        if adapter == "codex":
            payload = {
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
            }
            if include_compatibility:
                payload["compatibility"] = {
                    "settings_path": ".codex-plugin/settings.md",
                    "hooks_path": ".codex-plugin/hooks",
                    "subagents_path": ".codex-plugin/subagents",
                }
            self._write_json(".codex/adapter.json", payload)
            if not omit_native_doc:
                self._write_text("AGENTS.md", "native codex instructions\n")
            self._write_text(".codex/config.toml", "[features]\ncodex_hooks = true\n")
            self._write_text(".codex/hooks.json", "{}\n")
            self._ensure_path(".codex/agents")
            self._write_text(".codex-plugin/extensions.md", "extensions\n")
            if include_compatibility:
                self._write_text(".codex-plugin/settings.md", "compat settings\n")
                self._ensure_path(".codex-plugin/hooks")
                self._ensure_path(".codex-plugin/subagents")
            return

        payload = {
            "version": 1,
            "adapter": "claude",
            "instructions_path": "CLAUDE.md",
            "project_config_path": ".claude/settings.json",
            "hooks_path": ".claude/hooks",
            "agents_path": ".claude/agents",
            "worker_launch_command": "python3 -m workflow.scripts.harness_config build-worker-launch --repo-root .",
            "extension_points": {
                "mcp_config_path": ".claude-plugin/extensions.md",
                "resources_path": None,
                "tool_overrides_path": None,
                "notes_path": ".claude-plugin/extensions.md",
            },
        }
        if include_compatibility:
            payload["compatibility"] = {
                "settings_path": ".claude-plugin/settings.md",
                "hooks_path": ".claude-plugin/hooks",
                "subagents_path": ".claude-plugin/subagents",
            }
        self._write_json(".claude/adapter.json", payload)
        if not omit_native_doc:
            self._write_text("CLAUDE.md", "native claude instructions\n")
        self._write_text(".claude/settings.json", "{}\n")
        self._ensure_path(".claude/hooks")
        self._ensure_path(".claude/agents")
        self._write_text(".claude-plugin/extensions.md", "extensions\n")
        if include_compatibility:
            self._write_text(".claude-plugin/settings.md", "compat settings\n")
            self._ensure_path(".claude-plugin/hooks")
            self._ensure_path(".claude-plugin/subagents")

    def test_loads_repo_scoped_adapter_harness(self) -> None:
        self._write_adapter_harness("codex")

        config_path, payload = load_adapter_harness(repo_root=self.repo_root, adapter="codex")

        self.assertEqual(config_path, ".codex/adapter.json")
        self.assertEqual(payload["instructions_path"], "AGENTS.md")
        self.assertEqual(payload["project_config_path"], ".codex/config.toml")
        self.assertEqual(payload["agents_path"], ".codex/agents")
        self.assertEqual(payload["compatibility"]["settings_path"], ".codex-plugin/settings.md")

    def test_codex_harness_fails_closed_when_native_artifact_is_missing(self) -> None:
        self._write_adapter_harness("codex", omit_native_doc=True)

        with self.assertRaisesRegex(FileNotFoundError, "AGENTS.md"):
            load_adapter_harness(repo_root=self.repo_root, adapter="codex")

    def test_claude_harness_fails_closed_when_native_artifact_is_missing(self) -> None:
        self._write_adapter_harness("claude", omit_native_doc=True)

        with self.assertRaisesRegex(FileNotFoundError, "CLAUDE.md"):
            load_adapter_harness(repo_root=self.repo_root, adapter="claude")

    def test_loads_native_harness_without_compatibility_mirrors(self) -> None:
        self._write_adapter_harness("codex", include_compatibility=False)

        config_path, payload = load_adapter_harness(repo_root=self.repo_root, adapter="codex")

        self.assertEqual(config_path, ".codex/adapter.json")
        self.assertNotIn("compatibility", payload)

    def test_build_worker_launch_payload_includes_dispatch_handoff_and_bounded_context_policy(self) -> None:
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
        self.assertTrue(payload["context_policy"]["fresh_context"])
        self.assertEqual(payload["context_policy"]["carry_forward_mode"], "boundary_handoff_only")
        self.assertEqual(
            payload["context_policy"]["allowed_context_sources"],
            ["dispatch", "run_metadata", "boundary_handoff"],
        )
        self.assertTrue(payload["context_policy"]["handoff_injected"])
        self.assertEqual(payload["harness"]["config_path"], ".codex/adapter.json")
        self.assertEqual(payload["harness"]["instructions_path"], "AGENTS.md")
        self.assertEqual(payload["harness"]["project_config_path"], ".codex/config.toml")
        self.assertEqual(payload["harness"]["hooks_path"], ".codex/hooks.json")
        self.assertEqual(payload["harness"]["agents_path"], ".codex/agents")
        self.assertEqual(payload["harness"]["compatibility"]["settings_path"], ".codex-plugin/settings.md")

    def test_build_worker_launch_payload_sets_null_compatibility_when_native_run_does_not_declare_it(self) -> None:
        self._write_adapter_harness("claude", include_compatibility=False)
        initialize_run(
            repo_root=self.repo_root,
            workflow="forge",
            entry_task="Launch a native-only claude worker",
            adapter="claude",
            execution_mode="manual",
            entrypoint="praxis:forge",
            timestamp="2026-04-12T03:05:00Z",
        )

        result = build_worker_launch_payload(repo_root=self.repo_root)

        self.assertEqual(result["harness"]["config_path"], ".claude/adapter.json")
        self.assertIsNone(result["harness"]["compatibility"])

    def test_cli_build_worker_launch_reports_repo_scoped_claude_harness(self) -> None:
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
        self.assertEqual(result["harness"]["config_path"], ".claude/adapter.json")
        self.assertEqual(result["harness"]["instructions_path"], "CLAUDE.md")
        self.assertEqual(result["harness"]["project_config_path"], ".claude/settings.json")
        self.assertEqual(result["harness"]["hooks_path"], ".claude/hooks")
        self.assertEqual(result["harness"]["agents_path"], ".claude/agents")
        self.assertEqual(result["harness"]["compatibility"]["settings_path"], ".claude-plugin/settings.md")
        self.assertIsNone(result["inputs"]["boundary_handoff"])


if __name__ == "__main__":
    unittest.main()
