from __future__ import annotations

import sys
from pathlib import Path

from praxis.cli.envelopes import emit_error, emit_success
from praxis.cli.exit_codes import OUTPUT_VERSION, CliContractError
from praxis.cli.parser import CliArgumentError, build_parser, command_name, guess_command
from praxis.commands import (
    approve,
    build_worker_launch,
    cancel,
    continue_run,
    dispatch,
    doctor,
    harness,
    init,
    resume,
    run,
    status,
    submit_stage_result,
)
from praxis.commands._support import classify_unexpected_exception, command_timestamp, ensure_output_version, resolve_repo_root, utc_now


def execute_command(args, repo_root: Path, timestamp: str):
    if args.command == "init":
        return init.handle(args, repo_root, timestamp)
    if args.command == "run":
        return run.handle(args, repo_root, timestamp)
    if args.command == "status":
        return status.handle(args, repo_root, timestamp)
    if args.command == "continue":
        return continue_run.handle(args, repo_root, timestamp)
    if args.command == "approve":
        return approve.handle(args, repo_root, timestamp)
    if args.command == "resume":
        return resume.handle(args, repo_root, timestamp)
    if args.command == "cancel":
        return cancel.handle(args, repo_root, timestamp)
    if args.command == "dispatch":
        return dispatch.handle(args, repo_root, timestamp)
    if args.command == "submit-stage-result":
        return submit_stage_result.handle(args, repo_root, timestamp)
    if args.command == "build-worker-launch":
        return build_worker_launch.handle(args, repo_root, timestamp)
    if args.command == "harness":
        return harness.handle(args, repo_root, timestamp)
    if args.command == "doctor":
        return doctor.handle(args, repo_root, timestamp)
    raise CliContractError(
        code="invalid_argument",
        message=f"Unsupported Praxis command: {command_name(args)}.",
        exit_code=2,
    )


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    parser = build_parser()
    json_mode_requested = "--json" in argv
    timestamp = utc_now()
    command = guess_command(argv)
    repo_root = Path(".").resolve()

    try:
        args = parser.parse_args(argv)
        command = command_name(args)
        repo_root = resolve_repo_root(getattr(args, "repo_root", "."))
        timestamp = command_timestamp(getattr(args, "timestamp", None))
        ensure_output_version(getattr(args, "output_version", OUTPUT_VERSION))
        data = execute_command(args, repo_root, timestamp)
        emit_success(
            json_mode=bool(getattr(args, "json", False)),
            command=command,
            timestamp=timestamp,
            repo_root=repo_root,
            data=data,
        )
        return 0
    except CliArgumentError as exc:
        error = CliContractError(
            code="invalid_argument",
            message=str(exc),
            exit_code=2,
        )
        emit_error(
            json_mode=json_mode_requested,
            command=command,
            timestamp=timestamp,
            repo_root=repo_root,
            error=error,
            parser=parser,
        )
        return error.exit_code
    except Exception as exc:  # pragma: no cover - exercised through focused contract tests
        error = classify_unexpected_exception(command, exc)
        emit_error(
            json_mode=json_mode_requested,
            command=command,
            timestamp=timestamp,
            repo_root=repo_root,
            error=error,
            parser=parser,
        )
        return error.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
