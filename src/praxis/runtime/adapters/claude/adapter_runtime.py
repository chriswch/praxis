from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..runtime_contract import UnsupportedCancel


def _run_command(args: list[str], *, cwd: Path) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            args,
            cwd=cwd,
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError as exc:
        return {
            "ok": False,
            "returncode": 127,
            "stdout": "",
            "stderr": str(exc),
            "error": str(exc),
            "args": list(args),
        }
    return {
        "ok": completed.returncode == 0,
        "returncode": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "error": None,
        "args": list(args),
    }


@dataclass(frozen=True)
class ClaudeRuntime:
    binary_name: str = "claude"

    def build_launch_command(self, *, payload: dict[str, Any], prompt: str) -> tuple[list[str], str]:
        args = [
            self.binary_name,
            "-p",
            "--permission-mode",
            "dontAsk",
            "--agent",
            "praxis-story-worker",
            prompt,
        ]
        return args, "claude_print"

    def probe_resume_capability(self, *, repo_root: Path, resume_mode: str) -> dict[str, Any]:
        if resume_mode == "interactive":
            return {
                "supported": True,
                "mode": "interactive",
                "reason_code": "provider_resume_available",
                "reason": "Claude interactive resume is available through SessionStart hooks.",
            }

        help_result = _run_command([self.binary_name, "--help"], cwd=repo_root)
        help_text = f"{help_result['stdout']}\n{help_result['stderr']}"
        has_headless_resume = all(token in help_text for token in ("--resume", "--print", "--output-format"))
        return {
            "supported": has_headless_resume,
            "mode": "either" if has_headless_resume else "interactive",
            "reason_code": "provider_resume_available" if has_headless_resume else "headless_resume_unsupported",
            "reason": (
                "Claude headless resume is available in the installed CLI."
                if has_headless_resume
                else "Claude headless resume is not available in the installed CLI, so Praxis must relaunch fresh."
            ),
            "probe": help_result,
        }

    def run_resume_command(
        self,
        *,
        repo_root: Path,
        session_id: str,
        prompt: str,
        resume_mode: str,
    ) -> dict[str, Any]:
        if resume_mode != "headless":
            raise ValueError(f"Unsupported provider resume path for adapter='claude' mode={resume_mode!r}.")
        return _run_command(
            [self.binary_name, "--print", "--resume", session_id, prompt, "--output-format", "stream-json"],
            cwd=repo_root,
        )

    def status_check(self, *, repo_root: Path, run: dict[str, Any] | None) -> dict[str, Any]:
        resolved = shutil.which(self.binary_name)
        if resolved is None:
            return {
                "status": "error",
                "reason_code": "provider_cli_missing",
                "message": f"Praxis could not find the `{self.binary_name}` CLI in PATH.",
                "details": {"binary": self.binary_name},
            }

        if run is not None and run.get("execution", {}).get("mode") == "autopilot":
            capability = self.probe_resume_capability(repo_root=repo_root, resume_mode="headless")
            if not capability["supported"]:
                return {
                    "status": "warn",
                    "reason_code": str(capability["reason_code"]),
                    "message": str(capability["reason"]),
                    "details": {"binary": self.binary_name, "resolved_path": resolved},
                }

        return {
            "status": "ok",
            "reason_code": "provider_cli_available",
            "message": f"Praxis found the `{self.binary_name}` CLI.",
            "details": {"binary": self.binary_name, "resolved_path": resolved},
        }

    cancel = UnsupportedCancel("claude")


RUNTIME = ClaudeRuntime()
