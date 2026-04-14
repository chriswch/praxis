from __future__ import annotations

from copy import deepcopy
from typing import Any

from ..domain.stage_registry import permission_profile_for_stage
from .bookkeeping import build_worker_ownership


_STAGE_SUFFIX = {
    "clarifying-intent": "clarify",
    "slicing-stories": "slice",
    "sketching-design": "sketch",
    "driving-tdd": "tdd",
    "rapid-implementing": "impl",
    "code-reviewing": "review",
    "code-improving": "improve",
    "verifying-and-adapting": "verify",
}

_REUSE_STORY_WORKER_STAGES = {
    "sketching-design",
    "driving-tdd",
    "rapid-implementing",
}

_FRESH_REVIEW_STAGES = {
    "code-reviewing",
    "verifying-and-adapting",
}


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def default_budgets() -> dict[str, Any]:
    return {
        "run_max_turns": 400,
        "run_max_workers": 40,
        "soft_cost_usd": 25.0,
        "hard_cost_usd": 40.0,
    }


def default_policy() -> dict[str, Any]:
    return {
        "default_permission_profile": "implementation",
        "require_fresh_review_worker": True,
    }


def default_checkpoints() -> dict[str, Any]:
    return {
        "pending_user_decision": None,
        "pending_review_gate": None,
    }


def run_id_from_timestamp(timestamp: str | None) -> str:
    if not timestamp:
        return "run_legacy"
    compact = "".join(ch for ch in timestamp if ch.isdigit())
    if not compact:
        return "run_legacy"
    return f"run_{compact[:14]}"


def _scope_slug(scope: str | None, slice_id: str | None) -> str:
    if scope == "slice" and slice_id:
        return slice_id.replace("-", "")
    if scope == "feature":
        return "feature"
    return "root"


def _transition_counter(transition_id: str | None) -> int:
    if not transition_id or not transition_id.startswith("tx_"):
        return 0
    digits = transition_id[3:]
    return int(digits) if digits.isdigit() else 0


def bump_transition_id(run: dict[str, Any]) -> str:
    ensure_run_vnext_defaults(run)
    counter = _transition_counter(run["control"].get("last_transition_id")) + 1
    transition_id = f"tx_{counter:03d}"
    run["control"]["last_transition_id"] = transition_id
    run["control"]["recovery_status"] = "clean"
    return transition_id


def _default_resume_strategy(worker_class: str) -> str | None:
    if worker_class == "session_worker":
        return "prefer_resume_then_relaunch"
    return None


def _boundary_transition(run: dict[str, Any], stage: str | None) -> bool:
    current = run.get("current", {})
    routing = run.get("routing", {})
    execution = run.get("execution", {})
    return bool(
        stage == "clarifying-intent"
        and current.get("scope") == "slice"
        and execution.get("fresh_context_per_story", True)
        and routing.get("boundary_handoff_path")
    )


def _worker_reason(
    *,
    stage: str | None,
    scope: str | None,
    worker_class: str,
    reuse_policy: str,
    boundary_transition: bool,
    review_independence: bool,
) -> str:
    if stage == "clarifying-intent" and scope == "slice" and boundary_transition:
        return "Start the next story in a fresh worker seeded only from the durable boundary handoff."
    if stage == "code-reviewing" and review_independence:
        return "Use a fresh reviewer worker so review does not inherit the implementer context."
    if stage == "verifying-and-adapting" and review_independence:
        return "Use an independent verifier worker to compare implementation reality against the spec."
    if worker_class == "worktree_worker":
        return f"Use an isolated {worker_class} for {stage} so the worker cannot mutate the product worktree in place."
    if reuse_policy == "reuse_story_worker":
        return f"Reuse the current story worker for {stage} to preserve dense local context."
    if worker_class == "interactive_orchestrator":
        return "Use the interactive adapter session because this stage benefits from live operator collaboration."
    return f"Use a fresh {worker_class} for {stage}."


def build_worker_isolation(
    *,
    worker_id: str,
    stage: str | None,
    review_independence: bool,
    worktree_mode: str,
    worktree_path: str,
) -> dict[str, Any]:
    if review_independence and stage == "code-reviewing":
        reason_code = "independent_review_isolation"
        reason = "Review runs in an isolated worktree so the reviewer cannot silently mutate the product worktree."
    elif review_independence and stage == "verifying-and-adapting":
        reason_code = "independent_verification_isolation"
        reason = "Verification runs in an isolated worktree so the verifier cannot silently mutate the product worktree."
    elif worktree_mode == "isolated":
        reason_code = "isolated_worktree_owned"
        reason = "This worker owns an isolated git worktree and does not mutate the product worktree directly."
    else:
        reason_code = "shared_story_workspace"
        reason = "This worker runs in the shared product worktree for the active story."

    return {
        "worker_id": worker_id,
        "mode": worktree_mode,
        "worktree_path": worktree_path,
        "product_worktree_path": ".",
        "review_independence_required": review_independence,
        "product_worktree_mutation_allowed": worktree_mode != "isolated",
        "runtime_state_channel": "projected_control_plane" if worktree_mode == "isolated" else "direct_repo",
        "control_plane_access": "projected_read_only" if worktree_mode == "isolated" else "direct_repo",
        "guardrail_reason_code": reason_code,
        "guardrail_reason": reason,
    }


def stage_permission_profile(stage: str | None) -> str:
    return permission_profile_for_stage(stage, default="implementation")


def build_worker_plan(run: dict[str, Any], *, stage: str | None = None) -> dict[str, Any] | None:
    ensure_run_vnext_defaults(run)
    current = run.get("current", {})
    routing = run.get("routing", {})
    execution = run.get("execution", {})
    policy = run.get("policy", {})

    stage_name = stage or routing.get("next_stage") or current.get("stage")
    if stage_name is None:
        return None

    scope = current.get("scope")
    slice_id = current.get("slice_id")
    execution_mode = execution.get("mode", "manual")
    review_independence = stage_name in _FRESH_REVIEW_STAGES and bool(policy.get("require_fresh_review_worker", True))
    boundary_transition = _boundary_transition(run, stage_name)

    worktree_mode = "shared"
    worker_class = "session_worker"
    reuse_policy = "none"
    fresh_context = True

    if stage_name == "clarifying-intent" and scope != "slice" and execution_mode == "manual":
        worker_class = "interactive_orchestrator"
    elif stage_name == "clarifying-intent" and scope == "slice":
        worker_class = "session_worker"
        reuse_policy = "new_story_worker"
    elif stage_name in _REUSE_STORY_WORKER_STAGES:
        worker_class = "session_worker"
        reuse_policy = "reuse_story_worker"
        fresh_context = False
    elif review_independence:
        worker_class = "worktree_worker"
        worktree_mode = "isolated"
        reuse_policy = "none"
        fresh_context = True

    if boundary_transition:
        fresh_context = True
        if stage_name == "clarifying-intent" and scope == "slice":
            reuse_policy = "new_story_worker"

    transition_id = run.get("control", {}).get("last_transition_id") or "tx_001"
    scope_slug = _scope_slug(scope, slice_id)
    suffix = _STAGE_SUFFIX.get(stage_name, "stage")
    next_counter = _transition_counter(transition_id)
    if next_counter <= 0:
        next_counter = 1
    worker_id = f"wrk_{scope_slug}_{suffix}_{next_counter:02d}"

    return {
        "worker_id": worker_id,
        "worker_class": worker_class,
        "reuse_policy": reuse_policy,
        "review_independence": review_independence,
        "fresh_context": fresh_context,
        "worktree_mode": worktree_mode,
        "permission_profile": stage_permission_profile(stage_name),
        "reason": _worker_reason(
            stage=stage_name,
            scope=scope,
            worker_class=worker_class,
            reuse_policy=reuse_policy,
            boundary_transition=boundary_transition,
            review_independence=review_independence,
        ),
        "resume_strategy": _default_resume_strategy(worker_class),
        "trace_path": f".praxis/runtime/traces/{worker_id}.jsonl",
        "ownership": build_worker_ownership(
            worker_id=worker_id,
            worker_class=worker_class,
        ),
    }


def sync_worker_cursor(run: dict[str, Any]) -> dict[str, Any] | None:
    ensure_run_vnext_defaults(run)
    current = run["current"]
    routing = run["routing"]
    status = run.get("status")
    stage = current.get("stage")
    if stage is None or status in {"completed", "cancelled"}:
        current["worker_id"] = None
        current["session_id"] = None
        routing["pending_worker_action"] = None
        routing["resume_strategy"] = None
        return None

    plan = build_worker_plan(run, stage=stage)
    if plan is None:
        current["worker_id"] = None
        current["session_id"] = None
        routing["pending_worker_action"] = None
        routing["resume_strategy"] = None
        return None

    if plan["reuse_policy"] == "reuse_story_worker" and current.get("worker_id"):
        worker_id = current["worker_id"]
    else:
        worker_id = plan["worker_id"]
    current["worker_id"] = worker_id

    if plan["reuse_policy"] != "reuse_story_worker" and plan["worker_class"] != "interactive_orchestrator":
        current["session_id"] = None

    next_action = routing.get("next_action")
    if next_action == "run_stage":
        routing["pending_worker_action"] = "resume_or_launch"
    else:
        routing["pending_worker_action"] = None
    routing["resume_strategy"] = plan["resume_strategy"]
    return plan


def mark_worker_started(run: dict[str, Any], *, session_id: str) -> dict[str, Any] | None:
    ensure_run_vnext_defaults(run)
    plan = build_worker_plan(run)
    run["current"]["session_id"] = session_id
    run["routing"]["pending_worker_action"] = "await_stage_result"
    stage = run.get("current", {}).get("stage") or "the current stage"
    worker_id = run.get("current", {}).get("worker_id") or "the active worker"
    run["routing"]["reason"] = f"Awaiting {stage} stage results from {worker_id}."
    if plan is not None:
        run["routing"]["resume_strategy"] = plan["resume_strategy"]
    return plan


def mark_worker_resumed(run: dict[str, Any], *, session_id: str) -> dict[str, Any] | None:
    ensure_run_vnext_defaults(run)
    plan = build_worker_plan(run)
    run["current"]["session_id"] = session_id
    run["routing"]["pending_worker_action"] = "await_stage_result"
    stage = run.get("current", {}).get("stage") or "the current stage"
    worker_id = run.get("current", {}).get("worker_id") or "the active worker"
    run["routing"]["reason"] = f"Awaiting {stage} stage results from resumed worker {worker_id}."
    if plan is not None:
        run["routing"]["resume_strategy"] = plan["resume_strategy"]
    return plan


def _ensure_runtime(run: dict[str, Any]) -> None:
    runtime = run.setdefault("runtime", {})
    runtime.setdefault("entrypoint", f"praxis:{run.get('workflow', 'forge')}")


def ensure_run_vnext_defaults(run: dict[str, Any], *, timestamp: str | None = None) -> dict[str, Any]:
    _ensure_runtime(run)
    execution = run.setdefault("execution", {})
    execution.setdefault("mode", "manual")
    execution.setdefault("fresh_context_per_story", True)

    current = run.setdefault("current", {})
    current.setdefault("scope", "root")
    current.setdefault("slice_id", None)
    current.setdefault("artifact_dir", ".praxis")
    current.setdefault("stage", "clarifying-intent")
    current.setdefault("worker_id", None)
    current.setdefault("session_id", None)

    routing = run.setdefault("routing", {})
    routing.setdefault("next_action", "run_stage")
    routing.setdefault("next_stage", current.get("stage"))
    routing.setdefault("next_slice_id", None)
    routing.setdefault("reason", None)
    routing.setdefault("stop_reason_code", None)
    routing.setdefault("boundary_handoff_path", None)
    routing.setdefault("pending_worker_action", None)
    routing.setdefault("resume_strategy", None)

    timestamps = run.setdefault("timestamps", {})
    timestamps.setdefault("created_at", timestamp or "1970-01-01T00:00:00Z")
    timestamps.setdefault("updated_at", timestamps["created_at"])

    control = run.setdefault("control", {})
    control.setdefault("owner", "praxis.runtime.orchestrator")
    control.setdefault("manual_session_required", execution.get("mode") == "manual")
    control.setdefault("last_transition_id", None)
    control.setdefault("recovery_status", "clean")

    run.setdefault("run_id", run_id_from_timestamp(timestamps.get("created_at") or timestamp))
    run.setdefault("workflow_version", "vNext")
    budgets = run.setdefault("budgets", {})
    for key, value in default_budgets().items():
        budgets.setdefault(key, value)
    policy = run.setdefault("policy", {})
    policy.setdefault("default_permission_profile", stage_permission_profile(current.get("stage")))
    policy.setdefault("require_fresh_review_worker", True)
    checkpoints = run.setdefault("checkpoints", {})
    checkpoints.setdefault("pending_user_decision", None)
    checkpoints.setdefault("pending_review_gate", None)
    run["version"] = 4
    return run


def stage_input_artifacts(*, run: dict[str, Any], stage: str, artifact_dir: str) -> list[str]:
    inputs = [".praxis/run.json"]
    boundary_handoff_path = run.get("routing", {}).get("boundary_handoff_path")
    if boundary_handoff_path:
        inputs.append(boundary_handoff_path)

    if stage == "slicing-stories":
        inputs.append(".praxis/brief.md")
    elif stage == "sketching-design":
        inputs.append(f"{artifact_dir}/spec.md")
    elif stage in {"driving-tdd", "rapid-implementing"}:
        inputs.extend([f"{artifact_dir}/spec.md", f"{artifact_dir}/sketch.md"])
    elif stage == "code-reviewing":
        inputs.extend([f"{artifact_dir}/spec.md", f"{artifact_dir}/implementation.md"])
    elif stage == "code-improving":
        inputs.extend(
            [
                f"{artifact_dir}/spec.md",
                f"{artifact_dir}/implementation.md",
                f"{artifact_dir}/review.md",
            ]
        )
    elif stage == "verifying-and-adapting":
        inputs.extend(
            [
                f"{artifact_dir}/spec.md",
                f"{artifact_dir}/implementation.md",
                f"{artifact_dir}/review.md",
            ]
        )

    return _dedupe(inputs)


def stage_expected_outputs(*, run: dict[str, Any], stage: str, artifact_dir: str) -> list[str]:
    outputs = [f"{artifact_dir}/results/{stage}.json"]
    if stage == "clarifying-intent":
        outputs.append(f"{artifact_dir}/spec.md")
        if artifact_dir == ".praxis":
            outputs.append(".praxis/brief.md")
    elif stage == "slicing-stories":
        outputs.extend([".praxis/slice-map.json", ".praxis/slice-map.md"])
    elif stage == "sketching-design":
        outputs.append(f"{artifact_dir}/sketch.md")
    elif stage in {"driving-tdd", "rapid-implementing", "code-improving"}:
        outputs.append(f"{artifact_dir}/implementation.md")
    elif stage == "code-reviewing":
        outputs.append(f"{artifact_dir}/review.md")
    elif stage == "verifying-and-adapting":
        outputs.append(f"{artifact_dir}/verify.md")
    return _dedupe(outputs)


def ensure_stage_result_vnext_defaults(
    stage_result: dict[str, Any],
    *,
    run: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = deepcopy(stage_result)
    payload["version"] = 3

    if run is not None:
        ensure_run_vnext_defaults(run)
        plan = build_worker_plan(run, stage=payload.get("stage"))
        current = run.get("current", {})
        artifact_dir = payload.get("artifact_dir") or current.get("artifact_dir") or ".praxis"
        output_artifacts = payload.get("output_artifacts") or payload.get("artifacts_written") or stage_expected_outputs(
            run=run,
            stage=payload.get("stage"),
            artifact_dir=artifact_dir,
        )
        payload.setdefault("run_id", run.get("run_id"))
        worker = payload.setdefault("worker", {})
        worker.setdefault("worker_id", current.get("worker_id") or (plan["worker_id"] if plan else None))
        worker.setdefault("adapter", run.get("runtime", {}).get("adapter"))
        worker.setdefault("session_id", current.get("session_id"))
        worker.setdefault("worker_class", plan["worker_class"] if plan else "session_worker")
        execution = payload.setdefault("execution", {})
        execution.setdefault(
            "permission_profile",
            plan["permission_profile"] if plan else stage_permission_profile(payload.get("stage")),
        )
        execution.setdefault("worktree_mode", plan["worktree_mode"] if plan else "shared")
        execution.setdefault("fresh_context", bool(plan["fresh_context"]) if plan else True)
        execution.setdefault("resumed", False)
        payload.setdefault(
            "input_artifacts",
            stage_input_artifacts(run=run, stage=payload.get("stage"), artifact_dir=artifact_dir),
        )
        payload.setdefault("output_artifacts", _dedupe(list(output_artifacts)))
    else:
        payload.setdefault("run_id", None)
        worker = payload.setdefault("worker", {})
        worker.setdefault("worker_id", None)
        worker.setdefault("adapter", None)
        worker.setdefault("session_id", None)
        worker.setdefault("worker_class", "session_worker")
        execution = payload.setdefault("execution", {})
        execution.setdefault("permission_profile", stage_permission_profile(payload.get("stage")))
        execution.setdefault("worktree_mode", "shared")
        execution.setdefault("fresh_context", True)
        execution.setdefault("resumed", False)
        payload.setdefault("input_artifacts", [".praxis/run.json"])
        payload.setdefault("output_artifacts", payload.get("artifacts_written", []))

    verification = payload.setdefault("verification", {})
    verification.setdefault("tests_run", False)
    verification.setdefault("diff_reviewed", payload.get("stage") == "code-reviewing")
    payload.setdefault("handoff", None)
    return payload
