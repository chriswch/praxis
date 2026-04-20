import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDispatchPrompt,
  type DispatchPromptInput,
} from "../../../src/runtime/dispatch/prompt-templates.js";

function baseInput(overrides: Partial<DispatchPromptInput> = {}): DispatchPromptInput {
  return {
    stage: "clarifying-intent",
    workflow: "converge-pre-remediation",
    stageGoal: "goal text",
    stageInstructions: ["do A", "do B"],
    inputs: {
      requiredArtifacts: [".praxis/objective.md"],
      inputEnvelopePath: null,
    },
    outputs: {
      expectedArtifacts: [".praxis/target-spec.md"],
      primaryOutput: ".praxis/target-spec.md",
      outputEnvelopePath: null,
    },
    extraContext: { campaign_id: "c-1" },
    ...overrides,
  };
}

void test("slash-command stage starts with /praxis:<stage>", () => {
  const prompt = buildDispatchPrompt(baseInput());
  assert.equal(prompt.split("\n")[0], "/praxis:clarifying-intent");
});

void test("non-slash stage starts with a Stage: header instead of /praxis:", () => {
  const prompt = buildDispatchPrompt(baseInput({ stage: "assessing-gaps" }));
  assert.equal(prompt.split("\n")[0], "Stage: assessing-gaps");
  assert.ok(!prompt.includes("/praxis:"), "must not contain any /praxis: prefix");
});

void test("input envelope path is inlined when provided", () => {
  const prompt = buildDispatchPrompt(
    baseInput({
      inputs: {
        requiredArtifacts: [".praxis/objective.md"],
        inputEnvelopePath: ".praxis/dispatch/clarifying-intent/input.json",
      },
    }),
  );
  assert.ok(prompt.includes("Input envelope: .praxis/dispatch/clarifying-intent/input.json"));
});

void test("input envelope path is absent when null", () => {
  const prompt = buildDispatchPrompt(baseInput());
  assert.ok(!prompt.includes("Input envelope:"));
});

void test("output envelope path is inlined when provided", () => {
  const prompt = buildDispatchPrompt(
    baseInput({
      outputs: {
        expectedArtifacts: [],
        primaryOutput: null,
        outputEnvelopePath: ".praxis/dispatch/assessing-gaps/output.json",
      },
      stage: "assessing-gaps",
    }),
  );
  assert.ok(prompt.includes("Output envelope: .praxis/dispatch/assessing-gaps/output.json"));
});

void test("expectedOutputShape hint is inlined when provided", () => {
  const prompt = buildDispatchPrompt(
    baseInput({ expectedOutputShape: "{ findings: Finding[] }" }),
  );
  assert.ok(prompt.includes("Expected output shape:"));
  assert.ok(prompt.includes("{ findings: Finding[] }"));
});

void test("required inputs with no artifacts renders as (none)", () => {
  const prompt = buildDispatchPrompt(
    baseInput({ inputs: { requiredArtifacts: [], inputEnvelopePath: null } }),
  );
  assert.ok(prompt.includes("Required inputs:\n- (none)"));
});

void test("extraContext is JSON-stringified inside the prompt body", () => {
  const prompt = buildDispatchPrompt(
    baseInput({ extraContext: { review_id: "r-7", profile: "fast" } }),
  );
  assert.ok(prompt.includes('"review_id": "r-7"'));
  assert.ok(prompt.includes('"profile": "fast"'));
});

void test("stage-goal and stage-instructions appear in the prompt", () => {
  const prompt = buildDispatchPrompt(
    baseInput({ stageGoal: "unique-goal-xyz", stageInstructions: ["unique-inst-A"] }),
  );
  assert.ok(prompt.includes("Stage goal: unique-goal-xyz"));
  assert.ok(prompt.includes("- unique-inst-A"));
});
