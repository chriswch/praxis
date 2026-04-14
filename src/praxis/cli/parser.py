from __future__ import annotations

import argparse

from praxis.cli.exit_codes import OUTPUT_VERSION


class CliArgumentError(ValueError):
    """Raised when CLI parsing should stop with a contract error."""


class PraxisArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise CliArgumentError(message)


def _add_global_options(parser: argparse.ArgumentParser, *, suppress_defaults: bool) -> None:
    parser.add_argument(
        "--repo-root",
        default=argparse.SUPPRESS if suppress_defaults else ".",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        default=argparse.SUPPRESS if suppress_defaults else False,
    )
    parser.add_argument(
        "--output-version",
        type=int,
        default=argparse.SUPPRESS if suppress_defaults else OUTPUT_VERSION,
    )


def _add_timestamp_option(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--timestamp")


def build_parser() -> PraxisArgumentParser:
    parser = PraxisArgumentParser(prog="praxis", description="Praxis workflow control-plane CLI.")
    _add_global_options(parser, suppress_defaults=False)
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init")
    _add_global_options(init_parser, suppress_defaults=True)
    init_parser.add_argument("--adapter", choices=["claude", "codex", "all"], default="all")
    init_parser.add_argument("--force", action="store_true")

    run_parser = subparsers.add_parser("run")
    _add_global_options(run_parser, suppress_defaults=True)
    _add_timestamp_option(run_parser)
    run_parser.add_argument("--workflow", choices=["craft", "forge"], required=True)
    run_parser.add_argument("--entry-task", required=True)
    run_parser.add_argument("--adapter", choices=["claude", "codex"], required=True)
    run_parser.add_argument("--execution-mode", choices=["manual", "autopilot"], default="manual")
    run_parser.add_argument("--entrypoint")

    status_parser = subparsers.add_parser("status")
    _add_global_options(status_parser, suppress_defaults=True)

    inspect_parser = subparsers.add_parser("inspect")
    _add_global_options(inspect_parser, suppress_defaults=True)
    inspect_subparsers = inspect_parser.add_subparsers(dest="inspect_command", required=False)

    inspect_run_parser = inspect_subparsers.add_parser("run")
    _add_global_options(inspect_run_parser, suppress_defaults=True)
    inspect_run_parser.add_argument("run_id", nargs="?")

    inspect_worker_parser = inspect_subparsers.add_parser("worker")
    _add_global_options(inspect_worker_parser, suppress_defaults=True)
    inspect_worker_parser.add_argument("worker_id", nargs="?")

    inspect_session_parser = inspect_subparsers.add_parser("session")
    _add_global_options(inspect_session_parser, suppress_defaults=True)
    inspect_session_parser.add_argument("session_id", nargs="?")

    inspect_watch_parser = inspect_subparsers.add_parser("watch")
    _add_global_options(inspect_watch_parser, suppress_defaults=True)
    inspect_watch_parser.add_argument("--interval", type=float, default=2.0)
    inspect_watch_parser.add_argument("--once", action="store_true")
    inspect_watch_parser.add_argument("--no-color", action="store_true")
    inspect_watch_parser.add_argument("--no-pager", action="store_true")

    inspect_logs_parser = inspect_subparsers.add_parser("logs")
    _add_global_options(inspect_logs_parser, suppress_defaults=True)
    inspect_logs_parser.add_argument("worker_id", nargs="?")
    inspect_logs_parser.add_argument("-f", "--follow", action="store_true")
    inspect_logs_parser.add_argument("--tail", type=int, default=50)
    inspect_logs_parser.add_argument("--stream", choices=["stdout", "stderr", "both"], default="both")
    inspect_logs_parser.add_argument("--path-only", action="store_true")

    inspect_trace_parser = inspect_subparsers.add_parser("trace")
    _add_global_options(inspect_trace_parser, suppress_defaults=True)
    inspect_trace_parser.add_argument("worker_id", nargs="?")
    inspect_trace_parser.add_argument("-f", "--follow", action="store_true")
    inspect_trace_parser.add_argument("--tail", type=int, default=50)
    inspect_trace_parser.add_argument("--type", dest="event_type")
    inspect_trace_parser.add_argument("--reason-code")
    inspect_trace_parser.add_argument("--raw", action="store_true")

    inspect_events_parser = inspect_subparsers.add_parser("events")
    _add_global_options(inspect_events_parser, suppress_defaults=True)
    inspect_events_parser.add_argument("-f", "--follow", action="store_true")
    inspect_events_parser.add_argument("--tail", type=int, default=50)
    inspect_events_parser.add_argument("--type", dest="event_type")
    inspect_events_parser.add_argument("--stage")
    inspect_events_parser.add_argument("--slice", dest="slice_id")
    inspect_events_parser.add_argument("--raw", action="store_true")

    continue_parser = subparsers.add_parser("continue")
    _add_global_options(continue_parser, suppress_defaults=True)
    _add_timestamp_option(continue_parser)

    approve_parser = subparsers.add_parser("approve")
    _add_global_options(approve_parser, suppress_defaults=True)
    _add_timestamp_option(approve_parser)

    resume_parser = subparsers.add_parser("resume")
    _add_global_options(resume_parser, suppress_defaults=True)
    _add_timestamp_option(resume_parser)

    cancel_parser = subparsers.add_parser("cancel")
    _add_global_options(cancel_parser, suppress_defaults=True)
    _add_timestamp_option(cancel_parser)
    cancel_parser.add_argument("--reason")

    dispatch_parser = subparsers.add_parser("dispatch")
    _add_global_options(dispatch_parser, suppress_defaults=True)
    _add_timestamp_option(dispatch_parser)
    dispatch_parser.add_argument("--session-id")

    dispatch_sidecar_parser = subparsers.add_parser("dispatch-sidecar")
    _add_global_options(dispatch_sidecar_parser, suppress_defaults=True)
    _add_timestamp_option(dispatch_sidecar_parser)
    dispatch_sidecar_parser.add_argument("--worker-id", required=True)
    dispatch_sidecar_parser.add_argument("--reason", required=True)
    dispatch_sidecar_parser.add_argument("--stage")
    dispatch_sidecar_parser.add_argument(
        "--permission-profile",
        choices=["planning", "design", "implementation", "review", "verification"],
    )
    dispatch_sidecar_parser.add_argument("--worktree-mode", choices=["shared", "isolated"], default="isolated")
    dispatch_sidecar_parser.add_argument("--spawned-by-worker-id")
    dispatch_sidecar_parser.add_argument("--artifact-input", action="append", default=[])
    dispatch_sidecar_parser.add_argument("--artifact-output", action="append", default=[])
    dispatch_sidecar_parser.add_argument("--context-artifact-dir")
    dispatch_sidecar_parser.add_argument("--session-id")

    submit_parser = subparsers.add_parser("submit-stage-result")
    _add_global_options(submit_parser, suppress_defaults=True)
    _add_timestamp_option(submit_parser)
    submit_parser.add_argument("--stage-result-path", required=True)
    submit_parser.add_argument("--slice-map-path", default=".praxis/slice-map.json")
    submit_parser.add_argument("--commit-meta-path")
    submit_parser.add_argument("--handoff-data-path")
    submit_parser.add_argument("--dirty-path", action="append", default=[])
    submit_parser.add_argument("--gate-failure", action="append", default=[])
    submit_parser.add_argument("--cancel-requested", action="store_true")

    launch_parser = subparsers.add_parser("build-worker-launch")
    _add_global_options(launch_parser, suppress_defaults=True)

    harness_parser = subparsers.add_parser("harness")
    _add_global_options(harness_parser, suppress_defaults=True)
    harness_subparsers = harness_parser.add_subparsers(dest="harness_command", required=True)

    show_adapter_parser = harness_subparsers.add_parser("show-adapter")
    _add_global_options(show_adapter_parser, suppress_defaults=True)
    show_adapter_parser.add_argument("--adapter", choices=["claude", "codex"], required=True)

    doctor_parser = subparsers.add_parser("doctor")
    _add_global_options(doctor_parser, suppress_defaults=True)
    doctor_parser.add_argument("--adapter", choices=["auto", "claude", "codex", "all"], default="auto")

    return parser


def command_name(args: argparse.Namespace) -> str:
    if args.command == "inspect":
        inspect_command = getattr(args, "inspect_command", None)
        return "inspect" if inspect_command is None else f"inspect {inspect_command}"
    if args.command == "harness":
        return f"harness {args.harness_command}"
    return str(args.command)


def guess_command(argv: list[str]) -> str:
    for index, token in enumerate(argv):
        if token == "inspect":
            if index + 1 < len(argv) and argv[index + 1] in {
                "run",
                "worker",
                "session",
                "watch",
                "logs",
                "trace",
                "events",
            }:
                return f"inspect {argv[index + 1]}"
            return "inspect"
        if token == "harness" and index + 1 < len(argv) and argv[index + 1] == "show-adapter":
            return "harness show-adapter"
        if token in {
            "init",
            "run",
            "status",
            "continue",
            "approve",
            "resume",
            "cancel",
            "dispatch",
            "dispatch-sidecar",
            "submit-stage-result",
            "build-worker-launch",
            "doctor",
        }:
            return token
    return "praxis"
