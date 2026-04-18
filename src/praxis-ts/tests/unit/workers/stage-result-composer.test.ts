import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, unlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { WorkerLaunchPayload } from "../../../src/runtime/control/types.js";
import {
  composeStageResult,
  parseRoutingPayload,
  readRoutingPayload,
  routingScratchPathFor,
  RoutingPayloadError,
} from "../../../src/runtime/workers/stage-result-composer.js";

function makeLaunch(overrides: Partial<WorkerLaunchPayload> = {}): WorkerLaunchPayload {
  const base: WorkerLaunchPayload = {
    run_id: "run-1",
    dispatch_id: "disp-1",
    workflow: "craft",
    stage: "driving-tdd",
    scope: "slice",
    artifact_dir: ".praxis/slices/S-042",
    stage_result_path: ".praxis/slices/S-042/results/driving-tdd.json",
    contract: {
      stage_goal: "Drive TDD.",
      stage_instructions: ["Red.", "Green.", "Refactor."],
      expected_output_artifacts: [".praxis/slices/S-042/results/driving-tdd.json"],
      primary_output: ".praxis/slices/S-042/tdd.md",
    },
    context_manifest: {
      declared_inputs: [],
      boundary_handoff_path: null,
      instruction_surfaces: [],
    },
    inputs: {
      required_artifacts: [".praxis/slices/S-042/spec.md"],
      boundary_handoff: null,
    },
    policy: {
      writable_roots: ["."],
      blocked_paths: [],
      network: "enabled",
      profile: "implementation",
    },
    worker: {
      adapter: "claude",
      mode: "fresh_session",
      worker_class: "session_worker",
      resume_session_id: null,
    },
    execution: {
      fresh_context: true,
      worktree_mode: "shared",
      workspace_root: "/tmp/praxis-workspace",
      workspace_origin: "shared",
    },
    runtime: {
      entrypoint: "praxis",
      fresh_context_per_story: false,
    },
  };
  return { ...base, ...overrides };
}

void test("routingScratchPathFor appends .draft.json before the .json suffix", () => {
  assert.equal(
    routingScratchPathFor(".praxis/results/clarifying-intent.json"),
    ".praxis/results/clarifying-intent.draft.json",
  );
});

void test("routingScratchPathFor tolerates a missing .json suffix", () => {
  assert.equal(
    routingScratchPathFor(".praxis/results/clarifying-intent"),
    ".praxis/results/clarifying-intent.draft.json",
  );
});

void test("parseRoutingPayload requires outcome_code and status", () => {
  assert.throws(() => parseRoutingPayload({}), RoutingPayloadError);
  assert.throws(
    () => parseRoutingPayload({ outcome_code: "tdd_complete" }),
    RoutingPayloadError,
  );
  assert.throws(
    () => parseRoutingPayload({ outcome_code: "tdd_complete", status: "bogus" }),
    RoutingPayloadError,
  );
});

void test("parseRoutingPayload accepts the minimum shape", () => {
  const payload = parseRoutingPayload({
    outcome_code: "tdd_complete",
    status: "completed",
  });
  assert.equal(payload.outcome_code, "tdd_complete");
  assert.equal(payload.status, "completed");
});

void test("parseRoutingPayload validates optional fields", () => {
  assert.throws(
    () =>
      parseRoutingPayload({
        outcome_code: "tdd_complete",
        status: "completed",
        artifacts_written: ["a", 42],
      }),
    RoutingPayloadError,
  );
  assert.throws(
    () =>
      parseRoutingPayload({
        outcome_code: "tdd_complete",
        status: "completed",
        data: "not-an-object",
      }),
    RoutingPayloadError,
  );
});

void test("composeStageResult fills structural fields from the launch and resolves route.kind", () => {
  const launch = makeLaunch({ stage: "driving-tdd", workflow: "craft" });
  const result = composeStageResult(launch, "sess-abc", {
    outcome_code: "tdd_complete",
    status: "completed",
    summary_path: "impl.md",
    artifacts_written: ["impl.md", "impl-test.md"],
    data: { notes: "done" },
  });

  assert.equal(result.version, 2);
  assert.equal(result.run_id, "run-1");
  assert.equal(result.dispatch_id, "disp-1");
  assert.equal(result.session_id, "sess-abc");
  assert.equal(result.stage, "driving-tdd");
  assert.equal(result.artifact_dir, ".praxis/slices/S-042");
  assert.equal(result.status, "completed");
  assert.equal(result.summary_path, "impl.md");
  assert.deepEqual(result.artifacts_written, ["impl.md", "impl-test.md"]);
  assert.equal(result.route.kind, "proceed");
  assert.equal(result.route.next_stage, null);
  assert.equal(result.route.next_slice_id, null);
  assert.deepEqual(result.data, { outcome_code: "tdd_complete", notes: "done" });
  assert.equal(result.needs_user_input, false);
  assert.equal(result.needs_confirmation, false);
});

void test("composeStageResult treats null session_id as 'no active session'", () => {
  const launch = makeLaunch({ stage: "clarifying-intent" });
  const result = composeStageResult(launch, null, {
    outcome_code: "story_spec_ready",
    status: "completed",
  });
  assert.equal(result.session_id, null);
});

void test("composeStageResult rejects an unknown outcome_code for the stage", () => {
  const launch = makeLaunch({ stage: "driving-tdd" });
  assert.throws(
    () =>
      composeStageResult(launch, null, {
        outcome_code: "nonsense",
        status: "completed",
      }),
    /Outcome nonsense is not mapped/,
  );
});

void test("readRoutingPayload reads JSON from disk and fails cleanly when absent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "praxis-routing-"));
  try {
    const path = join(dir, "driving-tdd.draft.json");
    await writeFile(
      path,
      JSON.stringify({ outcome_code: "tdd_complete", status: "completed" }),
      "utf8",
    );
    const payload = await readRoutingPayload(path);
    assert.equal(payload.outcome_code, "tdd_complete");

    await unlink(path);
    await assert.rejects(readRoutingPayload(path), RoutingPayloadError);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
