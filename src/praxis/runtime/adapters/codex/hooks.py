from __future__ import annotations

import argparse
from pathlib import Path

from ...state.durable_state import dump_json
from ..harness import build_worker_launch_payload, inspect_worker_launch_context
from ..native_launch import (
    build_session_start_additional_context,
    derive_native_launch_failure_code,
    failure_response,
    load_hook_request,
    success_response,
    utc_now,
    write_native_launch_failure,
    write_native_launch_record,
)
from ..provider_resume import reconcile_manual_resume


def session_start_hook(*, repo_root: Path, recorded_at: str | None = None) -> int:
    ts = recorded_at or utc_now()

    if not (repo_root / ".praxis" / "run.json").exists():
        response = success_response(additional_context="No active Praxis run.")
        print(dump_json(response), end="")
        return 0

    hook_request: dict[str, object] = {}
    launch_context: dict[str, object] | None = None

    try:
        hook_request = load_hook_request()
        launch_context = inspect_worker_launch_context(repo_root=repo_root)
        if launch_context.get("worker_plan") is None or launch_context.get("dispatch", {}).get("stage") is None:
            response = success_response(additional_context="No active Praxis stage.")
            print(dump_json(response), end="")
            return 0
        payload = build_worker_launch_payload(repo_root=repo_root)
        if payload["adapter"] != "codex":
            raise ValueError(f"Codex session-start hook received non-codex adapter {payload['adapter']!r}.")
        if str(hook_request.get("source") or "") == "resume":
            result = reconcile_manual_resume(
                repo_root=repo_root,
                payload=payload,
                hook_request=hook_request,
                recorded_at=ts,
            )
            if not result["allowed"]:
                response = failure_response(f"Praxis blocked the native Codex resume: {result['reason']}")
            else:
                response = success_response(
                    additional_context=build_session_start_additional_context(
                        payload=payload,
                        record_rel=result["resume_record_path"],
                        label="Praxis Codex resume context",
                        record_field_label="resume_record",
                        extra_lines=[
                            f"- resumed_session_id: {result['session_id']}",
                            "- resume_mode: interactive",
                        ],
                    )
                )
        else:
            record_rel, _ = write_native_launch_record(
                repo_root=repo_root,
                payload=payload,
                hook_request=hook_request,
                recorded_at=ts,
                handoff_status=launch_context.get("handoff_status") if launch_context else None,
            )
            response = success_response(
                additional_context=build_session_start_additional_context(
                    payload=payload,
                    record_rel=record_rel,
                    label="Praxis Codex launch context",
                )
            )
    except Exception as exc:
        if launch_context is None:
            try:
                launch_context = inspect_worker_launch_context(repo_root=repo_root)
            except Exception:
                launch_context = None
        if launch_context is not None:
            try:
                write_native_launch_failure(
                    repo_root=repo_root,
                    launch_context=launch_context,
                    hook_request=hook_request,
                    recorded_at=ts,
                    reason_code=derive_native_launch_failure_code(
                        handoff_status=launch_context.get("handoff_status"),
                        exc=exc,
                    ),
                    reason=str(exc),
                )
            except Exception:
                pass
        response = failure_response(f"Praxis could not prepare the native Codex launch: {exc}")

    print(dump_json(response), end="")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bridge native Codex hooks to shared Praxis runtime helpers.")
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
