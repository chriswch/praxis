import test from "node:test";
import assert from "node:assert/strict";

import {
  ContractError,
  validateClarificationDecision,
  type ClarificationDecisionPayload,
} from "../../../src/contracts/validators.js";

void test("validateClarificationDecision accepts an empty object", () => {
  assert.doesNotThrow(() => {
    validateClarificationDecision({});
  });
});

void test("validateClarificationDecision accepts a fully-formed approved payload", () => {
  const payload: ClarificationDecisionPayload = {
    approval: { status: "approved", reasons: ["all AC confirmed"] },
    clarification_issues: [],
    decisions: { acceptance_criteria: { items: ["AC1", "AC2"] } },
  };
  assert.doesNotThrow(() => {
    validateClarificationDecision(payload);
  });
});

void test("validateClarificationDecision rejects unknown approval.status values", () => {
  assert.throws(
    () => {
      validateClarificationDecision({ approval: { status: "ok" } });
    },
    (error: unknown) =>
      error instanceof ContractError &&
      error.message.includes("approval.status") &&
      error.message.includes("approved") &&
      error.message.includes("needs_operator"),
    "must name the allowed values in the error",
  );
});

void test("validateClarificationDecision rejects non-string clarification_issues", () => {
  assert.throws(
    () => {
      validateClarificationDecision({
        clarification_issues: [1 as unknown as string],
      });
    },
    (error: unknown) =>
      error instanceof ContractError && /clarification_issues/.test(error.message),
  );
});

void test("validateClarificationDecision rejects non-string acceptance_criteria.items", () => {
  assert.throws(
    () => {
      validateClarificationDecision({
        decisions: {
          acceptance_criteria: {
            items: [null as unknown as string],
          },
        },
      });
    },
    (error: unknown) =>
      error instanceof ContractError && /acceptance_criteria\.items/.test(error.message),
  );
});

void test("validateClarificationDecision rejects non-record approval", () => {
  assert.throws(
    () => {
      validateClarificationDecision({
        approval: "approved" as unknown as ClarificationDecisionPayload["approval"],
      });
    },
    (error: unknown) =>
      error instanceof ContractError && /approval/.test(error.message),
  );
});
