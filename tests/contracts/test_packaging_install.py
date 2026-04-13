import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from typing import Optional


PROJECT_ROOT = Path(__file__).resolve().parents[2]
PYPROJECT_PATH = PROJECT_ROOT / "pyproject.toml"


def load_json(path: Path):
    return json.loads(path.read_text())


class PackagingInstallContractTest(unittest.TestCase):
    """Keep the public uv-tool path healthy while preserving packaging compatibility."""
    @classmethod
    def setUpClass(cls) -> None:
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.temp_path = Path(cls.temp_dir.name)
        cls.wheel_dir = cls.temp_path / "wheelhouse"
        cls.wheel_dir.mkdir(parents=True, exist_ok=True)

        uv_bin = shutil.which("uv")
        if uv_bin is not None:
            cls._run(
                [
                    uv_bin,
                    "build",
                    "--wheel",
                    "--out-dir",
                    str(cls.wheel_dir),
                    str(PROJECT_ROOT),
                ],
                cwd=PROJECT_ROOT,
            )
        else:
            cls._run(
                [
                    sys.executable,
                    "-m",
                    "pip",
                    "wheel",
                    "--no-deps",
                    "--wheel-dir",
                    str(cls.wheel_dir),
                    str(PROJECT_ROOT),
                ],
                cwd=PROJECT_ROOT,
            )
        wheel_files = sorted(cls.wheel_dir.glob("praxis-*.whl"))
        if not wheel_files:
            raise AssertionError("Expected a built Praxis wheel in the smoke test wheelhouse.")
        cls.wheel_path = wheel_files[0]

    @classmethod
    def tearDownClass(cls) -> None:
        cls.temp_dir.cleanup()

    @staticmethod
    def _run(command: list[str], *, cwd: Optional[Path] = None) -> subprocess.CompletedProcess[str]:
        completed = subprocess.run(
            command,
            cwd=cwd or PROJECT_ROOT,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            rendered = " ".join(command)
            raise AssertionError(
                f"Command failed: {rendered}\n"
                f"exit: {completed.returncode}\n"
                f"stdout:\n{completed.stdout}\n"
                f"stderr:\n{completed.stderr}"
            )
        return completed

    @staticmethod
    def _run_with_env(
        command: list[str],
        *,
        cwd: Optional[Path] = None,
        env: Optional[dict[str, str]] = None,
    ) -> subprocess.CompletedProcess[str]:
        completed = subprocess.run(
            command,
            cwd=cwd or PROJECT_ROOT,
            env=env,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            rendered = " ".join(command)
            raise AssertionError(
                f"Command failed: {rendered}\n"
                f"exit: {completed.returncode}\n"
                f"stdout:\n{completed.stdout}\n"
                f"stderr:\n{completed.stderr}"
            )
        return completed

    def _write_codex_harness(self, repo_root: Path) -> None:
        (repo_root / ".praxis" / "results").mkdir(parents=True, exist_ok=True)
        (repo_root / ".codex" / "agents").mkdir(parents=True, exist_ok=True)
        (repo_root / ".codex-plugin" / "hooks").mkdir(parents=True, exist_ok=True)
        (repo_root / ".codex-plugin" / "subagents").mkdir(parents=True, exist_ok=True)

        (repo_root / ".codex" / "adapter.json").write_text(
            json.dumps(
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
                indent=2,
            )
            + "\n"
        )
        (repo_root / "AGENTS.md").write_text("codex instructions\n")
        (repo_root / ".codex" / "config.toml").write_text("[features]\ncli = true\n")
        (repo_root / ".codex" / "hooks.json").write_text("{}\n")
        (repo_root / ".codex-plugin" / "extensions.md").write_text("extensions\n")
        (repo_root / ".codex-plugin" / "settings.md").write_text("settings\n")

    def _scripts_dir(self, python_bin: Path) -> Path:
        completed = self._run(
            [
                str(python_bin),
                "-c",
                "import sysconfig; print(sysconfig.get_path('scripts'))",
            ]
        )
        return Path(completed.stdout.strip())

    def _assert_working_praxis_cli(self, praxis_bin: Path, *, repo_name: str) -> None:
        self.assertTrue(praxis_bin.exists())

        repo_root = self.temp_path / repo_name
        self._write_codex_harness(repo_root)

        run_completed = self._run(
            [
                str(praxis_bin),
                "run",
                "--repo-root",
                str(repo_root),
                "--workflow",
                "forge",
                "--entry-task",
                "Packaging smoke test",
                "--adapter",
                "codex",
                "--execution-mode",
                "autopilot",
                "--timestamp",
                "2026-04-13T00:00:00Z",
                "--json",
            ]
        )
        run_result = json.loads(run_completed.stdout)
        self.assertTrue(run_result["ok"])
        self.assertEqual(run_result["command"], "run")
        self.assertEqual(run_result["data"]["run"]["current"]["stage"], "clarifying-intent")

        status_completed = self._run(
            [
                str(praxis_bin),
                "status",
                "--repo-root",
                str(repo_root),
                "--json",
            ]
        )
        status_result = json.loads(status_completed.stdout)
        self.assertTrue(status_result["ok"])
        self.assertEqual(status_result["command"], "status")

        launch_completed = self._run(
            [
                str(praxis_bin),
                "build-worker-launch",
                "--repo-root",
                str(repo_root),
                "--json",
            ]
        )
        launch_result = json.loads(launch_completed.stdout)
        self.assertTrue(launch_result["ok"])
        self.assertEqual(launch_result["command"], "build-worker-launch")
        self.assertEqual(launch_result["data"]["launch"]["harness"]["config_path"], ".codex/adapter.json")
        self.assertEqual(launch_result["data"]["launch"]["dispatch"]["stage"], "clarifying-intent")
        self.assertEqual(
            launch_result["data"]["launch"]["inputs"]["run_path"],
            ".praxis/run.json",
        )

        run_path = repo_root / ".praxis" / "run.json"
        run_snapshot = load_json(run_path)
        self.assertEqual(run_snapshot["current"]["stage"], "clarifying-intent")

    def test_pyproject_declares_wheel_build_requirement(self) -> None:
        text = PYPROJECT_PATH.read_text()
        match = re.search(r"(?ms)^\[build-system\]\n(?P<body>.*?)(?:^\[|\Z)", text)

        self.assertIsNotNone(match)
        self.assertIn('"wheel"', match.group("body"))

    def test_built_wheel_includes_runtime_assets(self) -> None:
        with zipfile.ZipFile(self.wheel_path) as archive:
            names = set(archive.namelist())

        self.assertIn("praxis/contracts/run.schema.json", names)
        self.assertIn("praxis/workflows/forge.md", names)
        self.assertIn("praxis/workflows/reference/runtime-reference.md", names)

    def test_wheel_install_remains_compatible_with_the_praxis_cli(self) -> None:
        venv_dir = self.temp_path / "venv"
        self._run([sys.executable, "-m", "venv", str(venv_dir)])

        python_bin = venv_dir / "bin" / "python"
        self._run(
            [
                str(python_bin),
                "-m",
                "pip",
                "install",
                "--force-reinstall",
                "--no-index",
                str(self.wheel_path),
            ]
        )

        praxis_bin = self._scripts_dir(python_bin) / "praxis"
        self._assert_working_praxis_cli(praxis_bin, repo_name="repo-wheel")

    def test_uv_tool_install_is_the_supported_cli_install_path(self) -> None:
        uv_bin = shutil.which("uv")
        if uv_bin is None:
            raise unittest.SkipTest("uv is not installed.")

        tool_dir = self.temp_path / "uv-tool-dir"
        cache_dir = self.temp_path / "uv-cache"
        env = {
            **os.environ,
            "UV_TOOL_DIR": str(tool_dir),
            "UV_CACHE_DIR": str(cache_dir),
            "UV_NO_PROGRESS": "1",
        }
        self._run_with_env(
            [
                uv_bin,
                "tool",
                "install",
                "--force",
                "--python",
                sys.executable,
                str(PROJECT_ROOT),
            ],
            cwd=PROJECT_ROOT,
            env=env,
        )

        praxis_bin = tool_dir / "praxis" / "bin" / "praxis"
        self._assert_working_praxis_cli(praxis_bin, repo_name="repo-uv-tool")


if __name__ == "__main__":
    unittest.main()
