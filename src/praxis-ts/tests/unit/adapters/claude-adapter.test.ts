import test from "node:test";
import assert from "node:assert/strict";

import { ClaudeAdapter } from "../../../src/runtime/adapters/claude-adapter.js";
import { getAdapter, getAllAdapters } from "../../../src/runtime/adapters/index.js";
import { InvalidInputError } from "../../../src/contracts/errors.js";
import type { AdapterLaunchRequest } from "../../../src/runtime/adapters/types.js";

function buildLaunchRequest(): AdapterLaunchRequest {
  return {
    dispatch: {
      version: 1,
      dispatch_id: "dispatch_test",
      run_id: "run_test",
      workflow: "craft",
      stage: "clarifying-intent",
      scope: "root",
      slice_id: null,
      artifact_dir: ".praxis",
      stage_result_path: ".praxis/results/clarifying-intent.json",
      created_at: "2026-04-17T00:00:00.000Z",
      inputs: { required_artifacts: [], boundary_handoff: null },
      contract: {
        stage_goal: "test",
        stage_instructions: [],
        expected_output_artifacts: [],
        primary_output: null,
      },
      context_manifest: {
        declared_inputs: [],
        boundary_handoff_path: null,
        instruction_surfaces: [],
      },
      worker: { adapter: "claude", mode: "session", worker_class: "session_worker" },
      execution: {
        fresh_context: true,
        worktree_mode: "shared",
        workspace_root: "/tmp/praxis-test",
        workspace_origin: "shared",
      },
      tool_policy: {
        writable_roots: ["."],
        blocked_paths: [".git", ".env"],
        network: "enabled",
        profile: "implementation",
      },
    },
    launch: {
      run_id: "run_test",
      dispatch_id: "dispatch_test",
      workflow: "craft",
      stage: "clarifying-intent",
      scope: "root",
      artifact_dir: ".praxis",
      stage_result_path: ".praxis/results/clarifying-intent.json",
      contract: {
        stage_goal: "test",
        stage_instructions: [],
        expected_output_artifacts: [],
        primary_output: null,
      },
      context_manifest: {
        declared_inputs: [],
        boundary_handoff_path: null,
        instruction_surfaces: [],
      },
      inputs: { required_artifacts: [], boundary_handoff: null },
      policy: {
        writable_roots: ["."],
        blocked_paths: [".git", ".env"],
        network: "enabled",
        profile: "implementation",
      },
      worker: {
        adapter: "claude",
        mode: "session",
        worker_class: "session_worker",
        resume_session_id: null,
      },
      execution: {
        fresh_context: true,
        worktree_mode: "shared",
        workspace_root: "/tmp/praxis-test",
        workspace_origin: "shared",
      },
      runtime: { entrypoint: "praxis:craft", fresh_context_per_story: true },
    },
    repoRoot: "/tmp/praxis-test",
  };
}

void test("ClaudeAdapter.health reports not implemented without probing the binary", async () => {
  const adapter = new ClaudeAdapter();
  const health = await adapter.health();
  assert.equal(health.adapter, "claude");
  assert.equal(health.healthy, false);
  assert.equal(health.supports_resume, false);
  assert.match(health.reason, /not implemented/i);
  assert.equal(health.binary, null);
  assert.equal(health.version, null);
});

void test("ClaudeAdapter.launch rejects with a not-implemented error", async () => {
  const adapter = new ClaudeAdapter();
  await assert.rejects(
    () => adapter.launch(buildLaunchRequest()),
    (error: unknown) =>
      error instanceof InvalidInputError && /not implemented/i.test((error as Error).message),
  );
});

void test("ClaudeAdapter.resume rejects with a not-implemented error", async () => {
  const adapter = new ClaudeAdapter();
  await assert.rejects(
    () => adapter.resume("some-session", buildLaunchRequest()),
    (error: unknown) =>
      error instanceof InvalidInputError && /not implemented/i.test((error as Error).message),
  );
});

void test("ClaudeAdapter.cancel returns cancelled:false to prevent false run-cancel", async () => {
  const adapter = new ClaudeAdapter();
  const result = await adapter.cancel({ session_id: "foo", locator: "bar" });
  assert.equal(result.cancelled, false);
  assert.match(result.reason, /not implemented/i);
});

void test("getAdapter('claude') throws InvalidInputError with operator guidance", () => {
  assert.throws(
    () => getAdapter("claude"),
    (error: unknown) =>
      error instanceof InvalidInputError &&
      /not implemented/i.test((error as Error).message) &&
      /codex/i.test((error as Error).message),
  );
});

void test("getAdapter('codex') still returns the Codex adapter", () => {
  const codex = getAdapter("codex");
  assert.equal(codex.name, "codex");
});

void test("getAllAdapters still exposes both adapters so doctor can report claude as unhealthy", async () => {
  const adapters = getAllAdapters();
  const names = adapters.map((a) => a.name).sort();
  assert.deepEqual(names, ["claude", "codex"]);
  const claude = adapters.find((a) => a.name === "claude");
  assert.ok(claude);
  const claudeHealth = await claude.health();
  assert.equal(claudeHealth.healthy, false);
});
