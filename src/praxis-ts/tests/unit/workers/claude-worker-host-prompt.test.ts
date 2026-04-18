import test from "node:test";
import assert from "node:assert/strict";

import type { WorkerLaunchPayload } from "../../../src/runtime/control/types.js";
import { buildStagePrompt } from "../../../src/runtime/workers/claude-worker-host.js";

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

void test("AC-1: mapped stage — first line is /praxis:<stage> <artifact_dir>", () => {
  const prompt = buildStagePrompt(
    makeLaunch({ stage: "driving-tdd", artifact_dir: ".praxis/slices/S-042" }),
  );
  const firstLine = prompt.split("\n")[0];
  assert.equal(firstLine, "/praxis:driving-tdd .praxis/slices/S-042");
});

void test("AC-2: mapped stage — lines 2..N carry today's prompt block verbatim", () => {
  const launch = makeLaunch({
    stage: "driving-tdd",
    artifact_dir: ".praxis/slices/S-042",
    run_id: "run-xyz",
    dispatch_id: "disp-xyz",
    stage_result_path: ".praxis/slices/S-042/results/driving-tdd.json",
    inputs: {
      required_artifacts: [".praxis/slices/S-042/spec.md", ".praxis/slices/S-042/sketch.md"],
      boundary_handoff: null,
    },
    contract: {
      stage_goal: "Drive TDD to completion.",
      stage_instructions: ["Red.", "Green.", "Refactor."],
      expected_output_artifacts: [".praxis/slices/S-042/results/driving-tdd.json"],
      primary_output: ".praxis/slices/S-042/tdd.md",
    },
    worker: {
      adapter: "claude",
      mode: "fresh_session",
      worker_class: "session_worker",
      resume_session_id: null,
    },
  });
  const prompt = buildStagePrompt(launch);
  const lines = prompt.split("\n");

  assert.equal(lines[0], "/praxis:driving-tdd .praxis/slices/S-042");
  assert.equal(lines[1], "Stage: driving-tdd");
  assert.equal(lines[2], "Goal: Drive TDD to completion.");
  assert.equal(lines[3], "Instructions: Red. | Green. | Refactor.");
  assert.equal(
    lines[4],
    "Required inputs: .praxis/slices/S-042/spec.md, .praxis/slices/S-042/sketch.md",
  );
  assert.equal(lines[5], "Primary output: .praxis/slices/S-042/tdd.md");
  assert.equal(lines[6], "Stage result: .praxis/slices/S-042/results/driving-tdd.json");
  assert.equal(lines[7], "Dispatch: disp-xyz");
  assert.equal(lines[8], "Run: run-xyz");
  assert.equal(lines[9], "Worker mode: fresh_session");
  assert.match(lines[10], /^Trace: [0-9a-f-]{36}$/);
  assert.equal(lines[11], "");
  assert.equal(
    lines[12],
    "Write the stage result JSON to the path under `Stage result:` using the",
  );
  assert.equal(lines[13], "Write tool, conforming to the stage-result contract. Exit when the file");
  assert.equal(lines[14], "is on disk.");
  assert.equal(lines.length, 15);
});

void test("AC-2: mapped stage — Required inputs falls back to 'none' when empty", () => {
  const prompt = buildStagePrompt(
    makeLaunch({
      stage: "driving-tdd",
      inputs: { required_artifacts: [], boundary_handoff: null },
    }),
  );
  assert.match(prompt, /\nRequired inputs: none\n/);
});

void test("AC-2: mapped stage — Primary output falls back to 'none' when null", () => {
  const launch = makeLaunch({ stage: "driving-tdd" });
  launch.contract = { ...launch.contract, primary_output: null };
  const prompt = buildStagePrompt(launch);
  assert.match(prompt, /\nPrimary output: none\n/);
});

void test("AC-3: unmapped stage assessing-gaps — first line is Stage:, no /praxis: anywhere", () => {
  const prompt = buildStagePrompt(
    makeLaunch({ stage: "assessing-gaps", artifact_dir: ".praxis" }),
  );
  const lines = prompt.split("\n");
  assert.equal(lines[0], "Stage: assessing-gaps");
  assert.equal(prompt.includes("/praxis:"), false);
});

void test("AC-3: unmapped stage planning-remediation — first line is Stage:, no /praxis: anywhere", () => {
  const prompt = buildStagePrompt(makeLaunch({ stage: "planning-remediation" }));
  const lines = prompt.split("\n");
  assert.equal(lines[0], "Stage: planning-remediation");
  assert.equal(prompt.includes("/praxis:"), false);
});

void test("AC-4: slash line uses payload.artifact_dir verbatim (.praxis with no trailing slash)", () => {
  const prompt = buildStagePrompt(
    makeLaunch({ stage: "clarifying-intent", artifact_dir: ".praxis" }),
  );
  const firstLine = prompt.split("\n")[0];
  assert.equal(firstLine, "/praxis:clarifying-intent .praxis");
});

void test("AC-4: slash line preserves artifact_dir with trailing slash verbatim", () => {
  const prompt = buildStagePrompt(
    makeLaunch({ stage: "clarifying-intent", artifact_dir: ".praxis/slices/S-007/" }),
  );
  const firstLine = prompt.split("\n")[0];
  assert.equal(firstLine, "/praxis:clarifying-intent .praxis/slices/S-007/");
});

const AC5_MAPPED: readonly string[] = [
  "clarifying-intent",
  "slicing-stories",
  "sketching-design",
  "driving-tdd",
  "code-reviewing",
  "code-improving",
  "verifying-and-adapting",
];

const AC5_UNMAPPED: readonly string[] = ["assessing-gaps", "planning-remediation"];

for (const stage of AC5_MAPPED) {
  void test(`AC-5: buildStagePrompt prepends /praxis:${stage} for mapped stage ${stage}`, () => {
    const prompt = buildStagePrompt(makeLaunch({ stage, artifact_dir: ".praxis/slices/S-1" }));
    const firstLine = prompt.split("\n")[0];
    assert.equal(firstLine, `/praxis:${stage} .praxis/slices/S-1`);
  });
}

for (const stage of AC5_UNMAPPED) {
  void test(`AC-5: buildStagePrompt has no /praxis: line for unmapped stage ${stage}`, () => {
    const prompt = buildStagePrompt(makeLaunch({ stage }));
    assert.equal(prompt.split("\n")[0], `Stage: ${stage}`);
    assert.equal(prompt.includes("/praxis:"), false);
  });
}
