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

void test("AC-1: mapped stage — first line is /praxis:<stage> with no argument", () => {
  const prompt = buildStagePrompt(
    makeLaunch({ stage: "driving-tdd", artifact_dir: ".praxis/slices/S-042" }),
  );
  const firstLine = prompt.split("\n")[0];
  assert.equal(firstLine, "/praxis:driving-tdd");
});

void test("AC-2: mapped stage — prompt carries the adapter-owned routing instructions", () => {
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

  assert.equal(lines[0], "/praxis:driving-tdd");
  assert.equal(lines[1], "Stage: driving-tdd");
  assert.equal(lines[2], "Artifact dir: .praxis/slices/S-042");
  assert.equal(lines[3], "Goal: Drive TDD to completion.");
  assert.equal(lines[4], "Instructions: Red. | Green. | Refactor.");
  assert.equal(
    lines[5],
    "Read inputs from: .praxis/slices/S-042/spec.md, .praxis/slices/S-042/sketch.md",
  );
  assert.equal(lines[6], "Primary output: .praxis/slices/S-042/tdd.md");
  assert.equal(
    lines[7],
    "Routing payload: write to .praxis/slices/S-042/results/driving-tdd.draft.json",
  );
  assert.equal(lines[8], "Dispatch: disp-xyz");
  assert.equal(lines[9], "Run: run-xyz");
  assert.equal(lines[10], "Worker mode: fresh_session");
  assert.match(lines[11], /^Trace: [0-9a-f-]{36}$/);
  assert.equal(lines[12], "");
  assert.match(prompt, /Run the skill, produce the stage's primary output/);
  assert.match(prompt, /outcome_code \(string\)/);
  assert.match(
    prompt,
    /status \(completed\|blocked\|failed\|skipped\)/,
  );
  assert.match(prompt, /The host will translate it into the stage-result contract\./);
  assert.equal(prompt.includes("Write the stage result JSON"), false);
});

void test("AC-2: mapped stage — Read inputs falls back to 'none' when empty", () => {
  const prompt = buildStagePrompt(
    makeLaunch({
      stage: "driving-tdd",
      inputs: { required_artifacts: [], boundary_handoff: null },
    }),
  );
  assert.match(prompt, /\nRead inputs from: none\n/);
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

void test("AC-4: scratch path derives from stage_result_path by suffix replacement", () => {
  const prompt = buildStagePrompt(
    makeLaunch({
      stage: "clarifying-intent",
      artifact_dir: ".praxis",
      stage_result_path: ".praxis/results/clarifying-intent.json",
    }),
  );
  assert.match(
    prompt,
    /Routing payload: write to \.praxis\/results\/clarifying-intent\.draft\.json/,
  );
});

void test("AC-4: artifact_dir appears in the prompt body, not as slash-command arg", () => {
  const prompt = buildStagePrompt(
    makeLaunch({ stage: "clarifying-intent", artifact_dir: ".praxis/slices/S-007/" }),
  );
  const firstLine = prompt.split("\n")[0];
  assert.equal(firstLine, "/praxis:clarifying-intent");
  assert.match(prompt, /\nArtifact dir: \.praxis\/slices\/S-007\/\n/);
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
  void test(`AC-5: buildStagePrompt prepends /praxis:${stage} (no argument) for mapped stage ${stage}`, () => {
    const prompt = buildStagePrompt(makeLaunch({ stage, artifact_dir: ".praxis/slices/S-1" }));
    const firstLine = prompt.split("\n")[0];
    assert.equal(firstLine, `/praxis:${stage}`);
  });
}

for (const stage of AC5_UNMAPPED) {
  void test(`AC-5: buildStagePrompt has no /praxis: line for unmapped stage ${stage}`, () => {
    const prompt = buildStagePrompt(makeLaunch({ stage }));
    assert.equal(prompt.split("\n")[0], `Stage: ${stage}`);
    assert.equal(prompt.includes("/praxis:"), false);
  });
}
