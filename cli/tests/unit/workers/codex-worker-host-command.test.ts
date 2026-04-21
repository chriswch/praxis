import test from "node:test";
import assert from "node:assert/strict";

import type { WorkerLaunchPayload } from "../../../src/runtime/control/types.js";
import { buildCodexCommand } from "../../../src/runtime/workers/codex-worker-host.js";

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
      stage_instructions: ["Write a failing test.", "Make it pass."],
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
      adapter: "codex",
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

void test("buildCodexCommand uses top-level approval flag for fresh exec sessions", () => {
  const command = buildCodexCommand("launch", makeLaunch(), null);

  assert.deepEqual(command.args.slice(0, 12), [
    "-a",
    "never",
    "-m",
    "gpt-5.3-codex",
    "-c",
    'model_reasoning_effort="high"',
    "exec",
    "-C",
    "/tmp/praxis-workspace",
    "-s",
    "workspace-write",
    "--json",
  ]);
});

void test("buildCodexCommand resumes through `codex exec resume` for JSON event mode", () => {
  const launch = makeLaunch({
    worker: {
      adapter: "codex",
      mode: "resume",
      worker_class: "session_worker",
      resume_session_id: "sess-123",
    },
  });

  const command = buildCodexCommand("resume", launch, null);

  assert.deepEqual(command.args.slice(0, 14), [
    "-a",
    "never",
    "-m",
    "gpt-5.3-codex",
    "-c",
    'model_reasoning_effort="high"',
    "exec",
    "-C",
    "/tmp/praxis-workspace",
    "-s",
    "workspace-write",
    "--json",
    "resume",
    "sess-123",
  ]);
  assert.equal(command.args[14]?.startsWith("/praxis:driving-tdd\nStage: driving-tdd"), true);
});
