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
class CodexRuntime:
    binary_name: str = "codex"

    def build_launch_command(self, *, payload: dict[str, Any], prompt: str) -> tuple[list[str], str]:
        args = [self.binary_name, "exec"]
        sandbox = payload["permissions"]["filesystem_scope"]
        if sandbox != "inherit":
            args.extend(["--sandbox", sandbox])
        args.append(prompt)
        return args, "codex_exec"

    def probe_resume_capability(self, *, repo_root: Path, resume_mode: str) -> dict[str, Any]:
        del repo_root, resume_mode
        return {
            "supported": True,
            "mode": "either",
            "reason_code": "provider_resume_available",
            "reason": "Codex exposes provider-native resume for interactive and headless flows.",
        }

    def run_resume_command(
        self,
        *,
        repo_root: Path,
        session_id: str,
        prompt: str,
        resume_mode: str,
    ) -> dict[str, Any]:
        del resume_mode
        return _run_command(
            [self.binary_name, "exec", "resume", session_id, prompt, "--json"],
            cwd=repo_root,
        )

    def status_check(self, *, repo_root: Path, run: dict[str, Any] | None) -> dict[str, Any]:
        del run
        resolved = shutil.which(self.binary_name)
        if resolved is None:
            return {
                "status": "error",
                "reason_code": "provider_cli_missing",
                "message": f"Praxis could not find the `{self.binary_name}` CLI in PATH.",
                "details": {"binary": self.binary_name},
            }
        return {
            "status": "ok",
            "reason_code": "provider_cli_available",
            "message": f"Praxis found the `{self.binary_name}` CLI.",
            "details": {"binary": self.binary_name, "resolved_path": resolved},
        }

    cancel = UnsupportedCancel("codex")


RUNTIME = CodexRuntime()
