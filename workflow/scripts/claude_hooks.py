from __future__ import annotations

import argparse
from pathlib import Path

from .durable_state import dump_json
from .harness_config import build_worker_launch_payload
from .native_launch import (
    build_session_start_additional_context,
    failure_response,
    load_hook_request,
    success_response,
    utc_now,
    write_native_launch_record,
)


def session_start_hook(*, repo_root: Path, recorded_at: str | None = None) -> int:
    hook_request = load_hook_request()
    ts = recorded_at or utc_now()

    try:
        payload = build_worker_launch_payload(repo_root=repo_root)
        if payload["adapter"] != "claude":
            raise ValueError(f"Claude session-start hook received non-claude adapter {payload['adapter']!r}.")
        record_rel, _ = write_native_launch_record(
            repo_root=repo_root,
            payload=payload,
            hook_request=hook_request,
            recorded_at=ts,
        )
        response = success_response(
            additional_context=build_session_start_additional_context(
                payload=payload,
                record_rel=record_rel,
                label="Praxis Claude launch context",
            )
        )
    except Exception as exc:
        response = failure_response(f"Praxis could not prepare the native Claude launch: {exc}")

    print(dump_json(response), end="")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bridge native Claude hooks to shared Praxis runtime helpers.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    session_start_parser = subparsers.add_parser("session-start")
    session_start_parser.add_argument("--repo-root", default=".")
    session_start_parser.add_argument("--timestamp")

    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve()

    if args.command == "session-start":
        return session_start_hook(repo_root=repo_root, recorded_at=args.timestamp)

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
