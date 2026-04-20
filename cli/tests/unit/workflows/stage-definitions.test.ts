import test from "node:test";
import assert from "node:assert/strict";

import {
  STAGE_DEFINITIONS,
  resolveStageGoal,
  resolveStageInstructions,
  resolveStageProfile,
  resolveStageRestrictsNetwork,
} from "../../../src/workflows/stage-definitions.js";
import { STAGE_NAMES } from "../../../src/contracts/model.js";

void test("STAGE_DEFINITIONS covers every stage in STAGE_NAMES", () => {
  for (const stage of STAGE_NAMES) {
    assert.ok(STAGE_DEFINITIONS[stage], `missing definition for ${stage}`);
  }
});

void test("resolveStageProfile maps each stage to its permission profile", () => {
  assert.equal(resolveStageProfile("clarifying-intent"), "planning");
  assert.equal(resolveStageProfile("assessing-gaps"), "planning");
  assert.equal(resolveStageProfile("planning-remediation"), "planning");
  assert.equal(resolveStageProfile("slicing-stories"), "planning");
  assert.equal(resolveStageProfile("sketching-design"), "design");
  assert.equal(resolveStageProfile("driving-tdd"), "implementation");
  assert.equal(resolveStageProfile("code-reviewing"), "review");
  assert.equal(resolveStageProfile("code-improving"), "implementation");
  assert.equal(resolveStageProfile("verifying-and-adapting"), "verification");
});

void test("resolveStageRestrictsNetwork is true only for review and verification stages", () => {
  assert.equal(resolveStageRestrictsNetwork("clarifying-intent"), false);
  assert.equal(resolveStageRestrictsNetwork("driving-tdd"), false);
  assert.equal(resolveStageRestrictsNetwork("code-reviewing"), true);
  assert.equal(resolveStageRestrictsNetwork("verifying-and-adapting"), true);
});

void test("resolveStageInstructions returns at least one instruction per stage", () => {
  for (const stage of STAGE_NAMES) {
    const instructions = resolveStageInstructions(stage);
    assert.ok(instructions.length > 0, `${stage} has no instructions`);
    for (const instruction of instructions) {
      assert.equal(typeof instruction, "string");
      assert.ok(instruction.length > 0, `${stage} has an empty instruction`);
    }
  }
});

void test("resolveStageGoal varies between craft and converge for overridden stages", () => {
  const craftClarify = resolveStageGoal("craft", "clarifying-intent");
  const convergeClarify = resolveStageGoal("converge-pre-remediation", "clarifying-intent");
  assert.notEqual(craftClarify, convergeClarify);
  assert.match(convergeClarify, /target spec/i);
});

void test("resolveStageGoal falls back to the default goal when a workflow has no override", () => {
  const craftTdd = resolveStageGoal("craft", "driving-tdd");
  const convergeTdd = resolveStageGoal("converge-pre-remediation", "driving-tdd");
  assert.equal(craftTdd, convergeTdd);
});
