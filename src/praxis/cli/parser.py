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

    continue_parser = subparsers.add_parser("continue")
    _add_global_options(continue_parser, suppress_defaults=True)
    _add_timestamp_option(continue_parser)

    resume_parser = subparsers.add_parser("resume")
    _add_global_options(resume_parser, suppress_defaults=True)
    _add_timestamp_option(resume_parser)

    dispatch_parser = subparsers.add_parser("dispatch")
    _add_global_options(dispatch_parser, suppress_defaults=True)
    _add_timestamp_option(dispatch_parser)
    dispatch_parser.add_argument("--session-id")

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

    return parser


def command_name(args: argparse.Namespace) -> str:
    if args.command == "harness":
        return f"harness {args.harness_command}"
    return str(args.command)


def guess_command(argv: list[str]) -> str:
    for index, token in enumerate(argv):
        if token == "harness" and index + 1 < len(argv) and argv[index + 1] == "show-adapter":
            return "harness show-adapter"
        if token in {
            "run",
            "status",
            "continue",
            "resume",
            "dispatch",
            "submit-stage-result",
            "build-worker-launch",
        }:
            return token
    return "praxis"
