import test from "node:test";
import assert from "node:assert/strict";

import { ContractError, validateRunRecord } from "../../../src/contracts/validators.js";
import type { RunRecord, WorkflowName } from "../../../src/contracts/model.js";

function buildRun(overrides: Partial<RunRecord> = {}): RunRecord {
  const workflow: WorkflowName = overrides.workflow ?? "craft";
  return {
    version: 1,
    run_id: "run_test",
    workflow,
    status: "running",
    mode: "single_story",
    entry_task: "test",
    runtime: { adapter: "codex", entrypoint: "praxis:craft" },
    execution: { mode: "manual", fresh_context_per_story: true },
    current: {
      scope: "root",
      slice_id: null,
      artifact_dir: ".praxis",
      stage: "clarifying-intent",
    },
    routing: {
      next_action: "run_stage",
      next_stage: "clarifying-intent",
      next_slice_id: null,
      reason: "init",
      stop_reason_code: null,
      boundary_handoff_path: null,
      entered_from_stage: null,
      entered_from_outcome_code: null,
    },
    active: {
      dispatch_id: null,
      worker_id: null,
      session_id: null,
      resumable: false,
    },
    timestamps: { created_at: "2026-04-17T00:00:00.000Z", updated_at: "2026-04-17T00:00:00.000Z" },
    ...overrides,
  };
}

void test("validateRunRecord accepts a craft run with no workflow_constraints", () => {
  const run = buildRun();
  assert.doesNotThrow(() => {
    validateRunRecord(run);
  });
});

void test("validateRunRecord accepts a converge run with workflow_constraints keyed to converge-pre-remediation", () => {
  const run = buildRun({
    workflow: "converge-pre-remediation",
    workflow_constraints: {
      workflow: "converge-pre-remediation",
      clarifying_required_artifacts: [".praxis/passes/P-001/brief.md"],
      clarifying_allowed_outcomes: ["story_spec_ready"],
      bounded_scope: {
        kind: "converge_pass",
        pass_id: "P-001",
        objective_path: ".praxis/target-spec.md",
        finding_ids: ["F-001"],
        story_ids: ["S-001"],
        brief_path: ".praxis/passes/P-001/brief.md",
      },
      commit_per_story: {
        enabled: true,
        last_verified_head: "abc123",
        pending_story_id: null,
      },
    },
  });
  assert.doesNotThrow(() => {
    validateRunRecord(run);
  });
});

void test("validateRunRecord accepts workflow_constraints with converge origin on a craft child run", () => {
  // Converge campaigns seed craft child runs with converge-origin constraints, so
  // workflow_constraints.workflow is the origin marker, not a mirror of run.workflow.
  const run = buildRun({
    workflow: "craft",
    workflow_constraints: {
      workflow: "converge-pre-remediation",
      clarifying_allowed_outcomes: ["story_spec_ready"],
    },
  });
  assert.doesNotThrow(() => {
    validateRunRecord(run);
  });
});

void test("validateRunRecord rejects an unrecognized workflow_constraints.workflow discriminator", () => {
  const run = {
    ...buildRun({ workflow: "craft" }),
    workflow_constraints: {
      workflow: "not-a-real-workflow",
      clarifying_allowed_outcomes: ["story_spec_ready"],
    },
  } as unknown as RunRecord;
  assert.throws(
    () => {
      validateRunRecord(run);
    },
    (error: unknown) =>
      error instanceof ContractError &&
      /workflow_constraints\.workflow/i.test((error as Error).message),
  );
});
