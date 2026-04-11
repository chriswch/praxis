from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path
from typing import Any

from .contract_validation import validate_contract_payload
from .durable_state import dump_json, load_json
from .handoff_policy import build_handoff_payload
from .harness_config import build_worker_launch_payload
from .orchestrator import initialize_run, resume_run
from .run_state import update_run_from_stage_result
from .story_boundary import checkpoint_story_boundary


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


def _semantic_launch_view(payload: dict[str, Any]) -> dict[str, Any]:
    dispatch = payload["dispatch"]
    handoff = payload["inputs"]["boundary_handoff"]
    return {
        "workflow": payload["workflow"],
        "dispatch": {
            "action": dispatch["action"],
            "scope": dispatch["scope"],
            "slice_id": dispatch["slice_id"],
            "artifact_dir": dispatch["artifact_dir"],
            "stage": dispatch["stage"],
            "boundary_handoff_path": dispatch["boundary_handoff_path"],
        },
        "context_policy": payload["context_policy"],
        "handoff": {
            "story_id": handoff["story_id"] if handoff else None,
            "next_story_id": handoff["next_story_id"] if handoff else None,
            "summary": handoff["summary"] if handoff else None,
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
    }[kind]
    return evaluator(case)


def _evaluate_routing_case(case: dict[str, Any]) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        repo_root = Path(tmp)
        run = case["input"]["run"]
        stage_result = case["input"]["stage_result"]
        _write_json(repo_root, ".praxis/run.json", run)
        _write_json(repo_root, f"{stage_result['artifact_dir']}/results/{stage_result['stage']}.json", stage_result)

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


def _evaluate_adapter_parity_case(case: dict[str, Any]) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        repo_root = Path(tmp)
        _write_json(repo_root, ".codex-plugin/adapter.json", case["input"]["codex_harness"])
        _write_json(repo_root, ".claude-plugin/adapter.json", case["input"]["claude_harness"])
        _materialize_adapter_harness_files(repo_root, case["input"]["codex_harness"])
        _materialize_adapter_harness_files(repo_root, case["input"]["claude_harness"])

        initialize_run(
            repo_root=repo_root,
            workflow=case["input"]["run"]["workflow"],
            entry_task=case["input"]["run"]["entry_task"],
            adapter="codex",
            execution_mode=case["input"]["run"]["execution"]["mode"],
            entrypoint=case["input"]["run"]["runtime"]["entrypoint"],
            timestamp="2026-04-12T04:15:00Z",
        )
        _write_json(repo_root, ".praxis/run.json", case["input"]["run"])
        handoff_payload = build_handoff_payload(**case["input"]["handoff_seed"])
        _write_json(repo_root, case["input"]["handoff_path"], handoff_payload)

        codex_payload = build_worker_launch_payload(repo_root=repo_root)

        run = case["input"]["run"]
        run["runtime"]["adapter"] = "claude"
        _write_json(repo_root, ".praxis/run.json", run)
        claude_payload = build_worker_launch_payload(repo_root=repo_root)

    passed = _semantic_launch_view(codex_payload) == _semantic_launch_view(claude_payload)
    return {
        "name": case["name"],
        "passed": passed,
        "details": {
            "codex": _semantic_launch_view(codex_payload),
            "claude": _semantic_launch_view(claude_payload),
        },
    }


def run_eval_pack(*, fixtures_dir: Path) -> dict[str, Any]:
    cases = _load_eval_cases(fixtures_dir)
    results = [evaluate_case(case) for case in cases]
    passed = sum(1 for result in results if result["passed"])
    return {
        "total": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "cases": results,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the Praxis local eval pack.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run")
    run_parser.add_argument("--fixtures-dir", default="tests/evals/fixtures")

    args = parser.parse_args(argv)
    if args.command == "run":
        summary = run_eval_pack(fixtures_dir=Path(args.fixtures_dir))
        print(dump_json(summary), end="")
        return 0

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
