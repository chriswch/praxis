from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from copy import deepcopy
from pathlib import Path
from typing import Any

from .contract_validation import validate_contract_payload
from .durable_state import dump_json, load_events, load_json
from .handoff_policy import build_handoff_payload
from .orchestrator import advance_run, resume_run
from .story_boundary import checkpoint_story_boundary


PROJECT_ROOT = Path(__file__).resolve().parents[2]
_NATIVE_GATE_KINDS = {"native_harness", "native_trace", "adapter_parity"}


def _write_json(base: Path, rel_path: str, payload: dict[str, Any]) -> None:
    path = base / rel_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def _write_placeholder_path(base: Path, rel_path: str) -> None:
    path = base / rel_path
    if path.suffix:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.suffix == ".json":
            path.write_text("{}\n")
        elif path.suffix == ".toml":
            path.write_text("placeholder = true\n")
        else:
            path.write_text("placeholder\n")
        return
    path.mkdir(parents=True, exist_ok=True)


def _materialize_adapter_harness_files(repo_root: Path, harness: dict[str, Any]) -> None:
    for rel in [
        harness["instructions_path"],
        harness["project_config_path"],
        harness["hooks_path"],
        harness["agents_path"],
    ]:
        if rel is not None:
            _write_placeholder_path(repo_root, rel)

    compatibility = harness.get("compatibility")
    if compatibility is not None:
        for rel in compatibility.values():
            _write_placeholder_path(repo_root, rel)

    for rel in harness["extension_points"].values():
        if rel is not None:
            _write_placeholder_path(repo_root, rel)


def _load_eval_cases(fixtures_dir: Path) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for path in sorted(fixtures_dir.glob("*.json")):
        payload = json.loads(path.read_text())
        validate_contract_payload("eval-case.schema.json", payload)
        cases.append(payload)
    return cases


def _adapter_config_relpath(adapter: str) -> str:
    mapping = {
        "codex": ".codex/adapter.json",
        "claude": ".claude/adapter.json",
    }
    try:
        return mapping[adapter]
    except KeyError as exc:
        raise ValueError(f"Unsupported adapter for native harness eval: {adapter!r}.") from exc


def _run_module(*, module: str, argv: list[str], input_text: str | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", module, *argv],
        cwd=PROJECT_ROOT,
        input=input_text,
        capture_output=True,
        text=True,
        check=check,
    )


def _show_run(repo_root: Path) -> dict[str, Any]:
    completed = _run_module(
        module="workflow.scripts.orchestrator",
        argv=["show-run", "--repo-root", str(repo_root)],
    )
    return json.loads(completed.stdout)


def _last_event(events: list[dict[str, Any]], event_types: set[str]) -> dict[str, Any] | None:
    for event in reversed(events):
        if event.get("type") in event_types:
            return event
    return None


def _materialize_native_adapter(repo_root: Path, *, adapter: str, harness: dict[str, Any]) -> None:
    _write_json(repo_root, _adapter_config_relpath(adapter), harness)
    _materialize_adapter_harness_files(repo_root, harness)


def _prepare_native_harness_repo(
    *,
    repo_root: Path,
    adapter: str,
    harness: dict[str, Any],
    run: dict[str, Any],
    handoff_path: str | None,
    handoff_seed: dict[str, Any] | None,
) -> None:
    (repo_root / ".praxis" / "results").mkdir(parents=True, exist_ok=True)
    _materialize_native_adapter(repo_root, adapter=adapter, harness=harness)
    _write_json(repo_root, ".praxis/run.json", run)
    if handoff_path and handoff_seed:
        _write_json(repo_root, handoff_path, build_handoff_payload(**handoff_seed))


def _run_native_session_start(
    *,
    repo_root: Path,
    adapter: str,
    timestamp: str,
    session_request: dict[str, Any] | None,
) -> dict[str, Any]:
    payload = dict(session_request or {})
    payload.setdefault("session_id", f"{adapter}-session-123")
    payload.setdefault("source", "startup")
    payload.setdefault("cwd", str(repo_root))

    completed = _run_module(
        module=f"workflow.scripts.{adapter}_hooks",
        argv=["session-start", "--repo-root", str(repo_root), "--timestamp", timestamp],
        input_text=json.dumps(payload),
    )
    response = json.loads(completed.stdout)

    launch_dir = repo_root / ".praxis" / "runtime" / "launches" / adapter
    if launch_dir.exists():
        launch_records = sorted(launch_dir.glob("*.json"))
    else:
        legacy_dir = repo_root / ".praxis" / "runtime" / f"{adapter}-launches"
        launch_records = sorted(legacy_dir.glob("*.json")) if legacy_dir.exists() else []
    record = load_json(launch_records[0]) if launch_records else None
    events = load_events(repo_root / ".praxis" / "events.jsonl")
    show_run = _show_run(repo_root)
    return {
        "response": response,
        "record": record,
        "events": events,
        "show_run": show_run,
        "launch_record_count": len(launch_records),
    }


def _native_harness_view(outcome: dict[str, Any]) -> dict[str, Any]:
    events = outcome["events"]
    handoff_event = _last_event(events, {"handoff_validated"})
    launch_event = _last_event(events, {"native_launch_recorded", "native_launch_failed"})
    record = outcome["record"]
    show_run = outcome["show_run"]
    dispatch = record["dispatch"] if record is not None else show_run["dispatch"]
    handoff_injected = (
        record["context"]["handoff_injected"]
        if record is not None
        else launch_event.get("handoff_injected") if launch_event is not None else None
    )

    return {
        "response_continue": outcome["response"].get("continue"),
        "recorded_launch": record is not None,
        "launch_record_count": outcome["launch_record_count"],
        "slice_id": dispatch.get("slice_id"),
        "stage": dispatch.get("stage"),
        "handoff_injected": handoff_injected,
        "handoff_story_id": handoff_event.get("handoff_story_id") if handoff_event else None,
        "handoff_next_story_id": handoff_event.get("handoff_next_story_id") if handoff_event else None,
        "launch_event_type": launch_event.get("type") if launch_event else None,
        "launch_reason_code": launch_event.get("reason_code") if launch_event else None,
        "trace_launch_event_type": (
            show_run["trace"]["last_launch_event"]["type"]
            if show_run["trace"].get("last_launch_event")
            else None
        ),
        "trace_handoff_event_type": (
            show_run["trace"]["last_handoff_event"]["type"]
            if show_run["trace"].get("last_handoff_event")
            else None
        ),
        "trace_resume_event_type": (
            show_run["trace"]["last_resume_event"]["type"]
            if show_run["trace"].get("last_resume_event")
            else None
        ),
        "trace_stop_reason_code": show_run["trace"].get("stop_reason_code"),
    }


def _semantic_native_harness_view(outcome: dict[str, Any]) -> dict[str, Any]:
    events = outcome["events"]
    handoff_event = _last_event(events, {"handoff_validated"})
    record = outcome["record"]
    show_run = outcome["show_run"]
    if record is None:
        raise ValueError("Adapter parity eval expected a native launch record, but none was written.")

    return {
        "response_continue": outcome["response"].get("continue"),
        "dispatch": {
            "scope": record["dispatch"]["scope"],
            "slice_id": record["dispatch"]["slice_id"],
            "artifact_dir": record["dispatch"]["artifact_dir"],
            "stage": record["dispatch"]["stage"],
            "boundary_handoff_path": record["dispatch"]["boundary_handoff_path"],
        },
        "context": {
            "fresh_context": record["context"]["fresh_context"],
            "carry_forward_mode": record["context"]["carry_forward_mode"],
            "handoff_injected": record["context"]["handoff_injected"],
            "boundary_handoff_story_id": record["context"]["boundary_handoff_story_id"],
            "boundary_handoff_next_story_id": record["context"]["boundary_handoff_next_story_id"],
        },
        "telemetry": {
            "handoff_type": handoff_event["type"] if handoff_event else None,
            "handoff_schema_valid": handoff_event.get("schema_valid") if handoff_event else None,
            "handoff_within_budget": handoff_event.get("within_budget") if handoff_event else None,
            "launch_type": show_run["trace"]["last_launch_event"]["type"],
            "launch_reason_code": show_run["trace"]["last_launch_event"]["reason_code"],
            "trace_handoff_event_type": show_run["trace"]["last_handoff_event"]["type"],
        },
    }


def evaluate_case(case: dict[str, Any]) -> dict[str, Any]:
    kind = case["kind"]
    evaluator = {
        "routing": _evaluate_routing_case,
        "resume": _evaluate_resume_case,
        "boundary_stop": _evaluate_boundary_stop_case,
        "handoff_budget": _evaluate_handoff_budget_case,
        "adapter_parity": _evaluate_adapter_parity_case,
        "native_harness": _evaluate_native_harness_case,
        "native_trace": _evaluate_native_trace_case,
    }[kind]
    return evaluator(case)


def _evaluate_routing_case(case: dict[str, Any]) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        repo_root = Path(tmp)
        run = case["input"]["run"]
        stage_result = case["input"]["stage_result"]
        _write_json(repo_root, ".praxis/run.json", run)
        _write_json(repo_root, f"{stage_result['artifact_dir']}/results/{stage_result['stage']}.json", stage_result)

        from .run_state import update_run_from_stage_result

        action = update_run_from_stage_result(
            repo_root=repo_root,
            stage_result_path=Path(f"{stage_result['artifact_dir']}/results/{stage_result['stage']}.json"),
            timestamp=case["input"].get("timestamp", "2026-04-12T04:00:00Z"),
        )
        updated_run = load_json(repo_root / ".praxis" / "run.json")

    passed = (
        action == case["expected"]["action"]
        and updated_run["routing"]["next_stage"] == case["expected"]["next_stage"]
        and updated_run["routing"]["stop_reason_code"] == case["expected"]["stop_reason_code"]
    )
    return {"name": case["name"], "passed": passed, "details": {"action": action, "run": updated_run}}


def _evaluate_resume_case(case: dict[str, Any]) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        repo_root = Path(tmp)
        _write_json(repo_root, ".praxis/run.json", case["input"]["run"])
        action = resume_run(
            repo_root=repo_root,
            timestamp=case["input"].get("timestamp", "2026-04-12T04:05:00Z"),
        )
        updated_run = load_json(repo_root / ".praxis" / "run.json")

    passed = (
        action == case["expected"]["action"]
        and updated_run["status"] == case["expected"]["run_status"]
        and updated_run["routing"]["next_action"] == case["expected"]["next_action"]
    )
    return {"name": case["name"], "passed": passed, "details": {"action": action, "run": updated_run}}


def _evaluate_boundary_stop_case(case: dict[str, Any]) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        repo_root = Path(tmp)
        stage_result = case["input"]["stage_result"]
        _write_json(repo_root, ".praxis/run.json", case["input"]["run"])
        _write_json(repo_root, ".praxis/story-ledger.json", case["input"]["story_ledger"])
        _write_json(repo_root, f"{stage_result['artifact_dir']}/results/{stage_result['stage']}.json", stage_result)

        checkpoint_story_boundary(
            repo_root=repo_root,
            stage_result_path=Path(f"{stage_result['artifact_dir']}/results/{stage_result['stage']}.json"),
            commit_meta=case["input"]["commit_meta"],
            handoff_data=case["input"]["handoff_data"],
            dirty_paths=case["input"].get("dirty_paths"),
            gate_failures=case["input"].get("gate_failures"),
            timestamp=case["input"].get("timestamp", "2026-04-12T04:10:00Z"),
        )

        updated_run = load_json(repo_root / ".praxis" / "run.json")
        ledger = load_json(repo_root / ".praxis" / "story-ledger.json")

    passed = (
        updated_run["routing"]["stop_reason_code"] == case["expected"]["stop_reason_code"]
        and updated_run["status"] == case["expected"]["run_status"]
        and ledger["stories"]["items"]["S-001"]["boundary_status"] == case["expected"]["boundary_status"]
    )
    return {
        "name": case["name"],
        "passed": passed,
        "details": {"run": updated_run, "story": ledger["stories"]["items"]["S-001"]},
    }


def _evaluate_handoff_budget_case(case: dict[str, Any]) -> dict[str, Any]:
    payload = build_handoff_payload(**case["input"])
    passed = (
        payload["validation"]["within_budget"] == case["expected"]["within_budget"]
        and payload["compaction"]["applied"] == case["expected"]["compaction_applied"]
    )
    return {"name": case["name"], "passed": passed, "details": payload}


def _evaluate_native_harness_case(case: dict[str, Any]) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        repo_root = Path(tmp)
        _prepare_native_harness_repo(
            repo_root=repo_root,
            adapter=case["input"]["adapter"],
            harness=case["input"]["harness"],
            run=case["input"]["run"],
            handoff_path=case["input"].get("handoff_path"),
            handoff_seed=case["input"].get("handoff_seed"),
        )
        outcome = _run_native_session_start(
            repo_root=repo_root,
            adapter=case["input"]["adapter"],
            timestamp=case["input"].get("timestamp", "2026-04-12T04:30:00Z"),
            session_request=case["input"].get("session_request"),
        )

    view = _native_harness_view(outcome)
    passed = all(view.get(key) == value for key, value in case["expected"].items())
    return {
        "name": case["name"],
        "passed": passed,
        "details": {
            "view": view,
            "trace": outcome["show_run"]["trace"],
        },
    }


def _evaluate_native_trace_case(case: dict[str, Any]) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        repo_root = Path(tmp)
        stage_result = case["input"]["stage_result"]
        _write_json(repo_root, ".praxis/run.json", case["input"]["run"])
        _write_json(repo_root, ".praxis/story-ledger.json", case["input"]["story_ledger"])
        _write_json(repo_root, f"{stage_result['artifact_dir']}/results/{stage_result['stage']}.json", stage_result)

        pause_action = advance_run(
            repo_root=repo_root,
            stage_result_path=Path(f"{stage_result['artifact_dir']}/results/{stage_result['stage']}.json"),
            slice_map_path=Path(".praxis/slice-map.json"),
            commit_meta=None,
            handoff_data=None,
            dirty_paths=None,
            gate_failures=None,
            cancel_requested=False,
            timestamp=case["input"].get("pause_timestamp", "2026-04-12T04:35:00Z"),
        )
        resume_action = resume_run(
            repo_root=repo_root,
            timestamp=case["input"].get("resume_timestamp", "2026-04-12T04:36:00Z"),
        )
        show_run = _show_run(repo_root)

    view = {
        "pause_action": pause_action,
        "resume_action": resume_action,
        "run_status": show_run["run_status"],
        "last_stop_event_type": show_run["trace"]["last_stop_event"]["type"],
        "last_stop_reason_code": show_run["trace"]["last_stop_event"]["reason_code"],
        "last_resume_event_type": show_run["trace"]["last_resume_event"]["type"],
        "last_resume_action": show_run["trace"]["last_resume_event"].get("resume_action"),
        "trace_stop_reason_code": show_run["trace"].get("stop_reason_code"),
    }
    passed = all(view.get(key) == value for key, value in case["expected"].items())
    return {
        "name": case["name"],
        "passed": passed,
        "details": {
            "view": view,
            "trace": show_run["trace"],
        },
    }


def _evaluate_adapter_parity_case(case: dict[str, Any]) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as codex_tmp, tempfile.TemporaryDirectory() as claude_tmp:
        codex_repo = Path(codex_tmp)
        claude_repo = Path(claude_tmp)

        codex_run = deepcopy(case["input"]["run"])
        codex_run["runtime"]["adapter"] = "codex"
        _prepare_native_harness_repo(
            repo_root=codex_repo,
            adapter="codex",
            harness=case["input"]["codex_harness"],
            run=codex_run,
            handoff_path=case["input"].get("handoff_path"),
            handoff_seed=case["input"].get("handoff_seed"),
        )
        codex_outcome = _run_native_session_start(
            repo_root=codex_repo,
            adapter="codex",
            timestamp=case["input"].get("timestamp", "2026-04-12T04:15:00Z"),
            session_request=case["input"].get("session_request"),
        )

        claude_run = deepcopy(case["input"]["run"])
        claude_run["runtime"]["adapter"] = "claude"
        _prepare_native_harness_repo(
            repo_root=claude_repo,
            adapter="claude",
            harness=case["input"]["claude_harness"],
            run=claude_run,
            handoff_path=case["input"].get("handoff_path"),
            handoff_seed=case["input"].get("handoff_seed"),
        )
        claude_outcome = _run_native_session_start(
            repo_root=claude_repo,
            adapter="claude",
            timestamp=case["input"].get("timestamp", "2026-04-12T04:15:00Z"),
            session_request=case["input"].get("session_request"),
        )

    codex_view = _semantic_native_harness_view(codex_outcome)
    claude_view = _semantic_native_harness_view(claude_outcome)
    passed = codex_view == claude_view
    if not case["expected"].get("semantic_parity", False):
        passed = not passed
    return {
        "name": case["name"],
        "passed": passed,
        "details": {
            "codex": codex_view,
            "claude": claude_view,
        },
    }


def run_eval_pack(
    *,
    fixtures_dir: Path,
    kind_filters: set[str] | None = None,
    required_kinds: set[str] | None = None,
) -> dict[str, Any]:
    cases = _load_eval_cases(fixtures_dir)
    if kind_filters is not None:
        cases = [case for case in cases if case["kind"] in kind_filters]

    results = [evaluate_case(case) for case in cases]
    present_kinds = {case["kind"] for case in cases}
    for kind in sorted((required_kinds or set()) - present_kinds):
        results.append(
            {
                "name": f"missing_required_kind:{kind}",
                "passed": False,
                "details": {"reason": f"No eval fixtures were found for required kind {kind!r}."},
            }
        )

    passed = sum(1 for result in results if result["passed"])
    return {
        "total": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "cases": results,
        "selected_kinds": sorted(kind_filters) if kind_filters is not None else None,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the Praxis local eval pack.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run")
    run_parser.add_argument("--fixtures-dir", default="tests/evals/fixtures")
    run_parser.add_argument("--kind", action="append", default=[])

    native_gate_parser = subparsers.add_parser("native-gate")
    native_gate_parser.add_argument("--fixtures-dir", default="tests/evals/fixtures")

    args = parser.parse_args(argv)
    if args.command == "run":
        summary = run_eval_pack(
            fixtures_dir=Path(args.fixtures_dir),
            kind_filters=set(args.kind) or None,
        )
        print(dump_json(summary), end="")
        return 0

    if args.command == "native-gate":
        summary = run_eval_pack(
            fixtures_dir=Path(args.fixtures_dir),
            kind_filters=_NATIVE_GATE_KINDS,
            required_kinds=_NATIVE_GATE_KINDS,
        )
        print(dump_json(summary), end="")
        return 0 if summary["failed"] == 0 else 1

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
