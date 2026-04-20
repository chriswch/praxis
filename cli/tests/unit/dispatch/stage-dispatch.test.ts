import test from "node:test";
import assert from "node:assert/strict";

import { STAGE_NAMES, type StageName } from "../../../src/contracts/model.js";
import {
  PRAXIS_SLASH_PREFIX,
  isSlashCommandStage,
  resolveStageSlashCommand,
} from "../../../src/runtime/dispatch/stage-dispatch.js";

const SLASH_STAGES: readonly StageName[] = [
  "clarifying-intent",
  "slicing-stories",
  "sketching-design",
  "driving-tdd",
  "code-reviewing",
  "code-improving",
  "verifying-and-adapting",
];

const NON_SLASH_STAGES: readonly StageName[] = ["assessing-gaps", "planning-remediation"];

void test("PRAXIS_SLASH_PREFIX is the one /praxis: constant", () => {
  assert.equal(PRAXIS_SLASH_PREFIX, "/praxis:");
});

for (const stage of SLASH_STAGES) {
  void test(`resolveStageSlashCommand(${stage}) → ${PRAXIS_SLASH_PREFIX}${stage}`, () => {
    assert.equal(resolveStageSlashCommand(stage), `${PRAXIS_SLASH_PREFIX}${stage}`);
    assert.equal(isSlashCommandStage(stage), true);
  });
}

for (const stage of NON_SLASH_STAGES) {
  void test(`resolveStageSlashCommand(${stage}) → null (CLI-private)`, () => {
    assert.equal(resolveStageSlashCommand(stage), null);
    assert.equal(isSlashCommandStage(stage), false);
  });
}

void test("resolveStageSlashCommand covers every StageName (partition enforcement)", () => {
  const seen = new Set<StageName>();
  for (const stage of SLASH_STAGES) seen.add(stage);
  for (const stage of NON_SLASH_STAGES) seen.add(stage);
  for (const stage of STAGE_NAMES) {
    assert.ok(seen.has(stage), `stage ${stage} must appear in either SLASH_STAGES or NON_SLASH_STAGES`);
  }
});
