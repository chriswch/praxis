import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from praxis.runtime.adapters.runtime_contract import get_adapter_runtime


class AdapterRuntimeContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo_root = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_codex_runtime_builds_launch_command_from_payload_permissions(self) -> None:
        runtime = get_adapter_runtime("codex")
        args, surface = runtime.build_launch_command(
            payload={"permissions": {"filesystem_scope": "workspace-write"}},
            prompt="run bounded worker",
        )
        self.assertEqual(surface, "codex_exec")
        self.assertEqual(args[:3], ["codex", "exec", "--sandbox"])
        self.assertEqual(args[-1], "run bounded worker")

    def test_claude_runtime_builds_launch_command_from_adapter_contract(self) -> None:
        runtime = get_adapter_runtime("claude")
        args, surface = runtime.build_launch_command(
            payload={"permissions": {"filesystem_scope": "workspace-write"}},
            prompt="run bounded worker",
        )
        self.assertEqual(surface, "claude_print")
        self.assertEqual(args[:5], ["claude", "-p", "--permission-mode", "dontAsk", "--agent"])
        self.assertEqual(args[-1], "run bounded worker")

    def test_claude_headless_resume_capability_is_adapter_owned(self) -> None:
        runtime = get_adapter_runtime("claude")
        with patch(
            "praxis.runtime.adapters.claude.adapter_runtime._run_command",
            return_value={
                "ok": True,
                "returncode": 0,
                "stdout": "--resume --print --output-format\n",
                "stderr": "",
                "error": None,
                "args": ["claude", "--help"],
            },
        ):
            capability = runtime.probe_resume_capability(repo_root=self.repo_root, resume_mode="headless")
        self.assertTrue(capability["supported"])
        self.assertEqual(capability["mode"], "either")

    def test_unsupported_cancel_returns_a_durable_reason_shape(self) -> None:
        codex = get_adapter_runtime("codex")
        result = codex.cancel(
            repo_root=self.repo_root,
            session_record=None,
            worker_record=None,
            reason="operator cancelled the run",
        )
        self.assertEqual(result["status"], "unsupported")
        self.assertEqual(result["reason_code"], "native_cancel_unsupported")


if __name__ == "__main__":
    unittest.main()
