import test from "node:test";
import assert from "node:assert/strict";

import {
  CLARIFICATION_OUTPUT_SHAPE,
  CLARIFYING_INTENT_INSTRUCTIONS,
} from "../../../src/runtime/converge/executors/clarifying-intent-executor.js";
import { STAGE_RESULT_STATUS, CLARIFICATION_APPROVAL_STATUS } from "../../../src/contracts/model.js";

void test("clarifying-intent output shape enumerates all allowed stage-result status values", () => {
  for (const status of STAGE_RESULT_STATUS) {
    assert.ok(
      CLARIFICATION_OUTPUT_SHAPE.includes(status),
      `output shape must mention stage-result status "${status}"`,
    );
  }
});

void test("clarifying-intent output shape enumerates all allowed clarification approval statuses", () => {
  for (const status of CLARIFICATION_APPROVAL_STATUS) {
    assert.ok(
      CLARIFICATION_OUTPUT_SHAPE.includes(status),
      `output shape must mention approval status "${status}"`,
    );
  }
});

void test("clarifying-intent instructions explicitly forbid the drifted `ok` status", () => {
  const joined = CLARIFYING_INTENT_INSTRUCTIONS.join("\n");
  assert.ok(
    /not.+`ok`/.test(joined),
    "instructions should explicitly mention `ok` is not allowed",
  );
});

void test("clarifying-intent instructions name every allowed stage-result status", () => {
  const joined = CLARIFYING_INTENT_INSTRUCTIONS.join("\n");
  for (const status of STAGE_RESULT_STATUS) {
    assert.ok(joined.includes(status), `instructions must mention status "${status}"`);
  }
});
