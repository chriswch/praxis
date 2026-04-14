from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol


class AdapterRuntime(Protocol):
    binary_name: str

    def build_launch_command(self, *, payload: dict[str, Any], prompt: str) -> tuple[list[str], str]:
        ...

    def probe_resume_capability(self, *, repo_root: Path, resume_mode: str) -> dict[str, Any]:
        ...

    def run_resume_command(
        self,
        *,
        repo_root: Path,
        session_id: str,
        prompt: str,
        resume_mode: str,
    ) -> dict[str, Any]:
        ...

    def status_check(self, *, repo_root: Path, run: dict[str, Any] | None) -> dict[str, Any]:
        ...

    def cancel(
        self,
        *,
        repo_root: Path,
        session_record: dict[str, Any] | None,
        worker_record: dict[str, Any] | None,
        reason: str,
    ) -> dict[str, Any]:
        ...


@dataclass(frozen=True)
class UnsupportedCancel:
    adapter: str

    def __call__(
        self,
        *,
        repo_root: Path,
        session_record: dict[str, Any] | None,
        worker_record: dict[str, Any] | None,
        reason: str,
    ) -> dict[str, Any]:
        del repo_root, session_record, worker_record, reason
        return {
            "status": "unsupported",
            "reason_code": "native_cancel_unsupported",
            "reason": f"The {self.adapter} adapter does not expose a native cancel path for bounded worker sessions.",
        }


def get_adapter_runtime(adapter: str) -> AdapterRuntime:
    if adapter == "codex":
        from .codex.adapter_runtime import RUNTIME

        return RUNTIME
    if adapter == "claude":
        from .claude.adapter_runtime import RUNTIME

        return RUNTIME
    raise ValueError(f"Unsupported adapter: {adapter!r}.")
