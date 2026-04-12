from __future__ import annotations

from typing import Any


OUTPUT_VERSION = 1
NO_ACTIVE_RUN_EXIT = 3
BLOCKED_EXIT = 3
INVALID_INPUT_EXIT = 2
ENVIRONMENT_EXIT = 4
GENERIC_FAILURE_EXIT = 1


class CliContractError(RuntimeError):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        exit_code: int,
        details: dict[str, Any] | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.exit_code = exit_code
        self.details = details or {}
        self.retryable = retryable
