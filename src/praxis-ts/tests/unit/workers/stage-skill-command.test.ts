import test from "node:test";
import assert from "node:assert/strict";

import { STAGE_NAMES, type StageName } from "../../../src/contracts/model.js";
import { resolveStageSkillCommand } from "../../../src/runtime/workers/stage-skill-command.js";

const MAPPED_STAGES: readonly StageName[] = [
  "clarifying-intent",
  "slicing-stories",
  "sketching-design",
  "driving-tdd",
  "code-reviewing",
  "code-improving",
  "verifying-and-adapting",
];

const UNMAPPED_STAGES: readonly StageName[] = ["assessing-gaps", "planning-remediation"];

for (const stage of MAPPED_STAGES) {
  void test(`resolveStageSkillCommand returns /praxis:${stage} for ${stage}`, () => {
    assert.equal(resolveStageSkillCommand(stage), `/praxis:${stage}`);
  });
}

for (const stage of UNMAPPED_STAGES) {
  void test(`resolveStageSkillCommand returns null for ${stage}`, () => {
    assert.equal(resolveStageSkillCommand(stage), null);
  });
}

void test("resolveStageSkillCommand covers every StageName (partition enforcement)", () => {
  const mapped = new Set<StageName>(MAPPED_STAGES);
  const unmapped = new Set<StageName>(UNMAPPED_STAGES);
  for (const stage of STAGE_NAMES) {
    const inMapped = mapped.has(stage);
    const inUnmapped = unmapped.has(stage);
    assert.equal(
      inMapped !== inUnmapped,
      true,
      `StageName ${stage} must appear in exactly one of MAPPED_STAGES or UNMAPPED_STAGES.`,
    );
  }
});
