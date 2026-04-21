import test from "node:test";
import assert from "node:assert/strict";

import { backfillGapFingerprints } from "../../../src/runtime/converge/executors/assessing-gaps-executor.js";
import { buildFindingFingerprint } from "../../../src/runtime/converge/identity.js";
import type { GapAssessmentResult, GapFinding } from "../../../src/contracts/model.js";
import { validateGapAssessmentResult } from "../../../src/contracts/validators.js";

function buildFinding(overrides: Partial<GapFinding> = {}): GapFinding {
  return {
    finding_id: "G-001",
    fingerprint: "",
    title: "Primary deliverable missing",
    kind: "missing",
    severity: "critical",
    category: "deliverable",
    summary: "The target spec's primary deliverable is not present.",
    expected_behavior: "Deliverable document exists at the expected path.",
    current_behavior: "No such document was found.",
    evidence: [".praxis/target-spec.md:37 — ## Primary Deliverable"],
    objective_refs: ["R-001:AC1"],
    affected_paths: [],
    recommended_direction: "Author the missing deliverable.",
    recommended_action: "Create the deliverable markdown file.",
    confidence: 0.98,
    ...overrides,
  };
}

function buildGap(findings: GapFinding[]): GapAssessmentResult {
  return {
    version: 1,
    profile: "product-spec-gap",
    review_id: "R-001",
    target_spec_path: ".praxis/target-spec.md",
    findings,
    generated_at: "2026-04-21T00:52:00.000Z",
  };
}

void test("backfillGapFingerprints fills empty fingerprints deterministically", () => {
  const gap = buildGap([buildFinding(), buildFinding({ finding_id: "G-002", title: "Other" })]);
  backfillGapFingerprints(gap);

  for (const finding of gap.findings) {
    assert.notEqual(finding.fingerprint, "");
    assert.equal(
      finding.fingerprint,
      buildFindingFingerprint(gap.profile, finding),
      "fingerprint must match host-computed value",
    );
  }
});

void test("backfillGapFingerprints overwrites stale values with the canonical fingerprint", () => {
  const gap = buildGap([buildFinding({ fingerprint: "bogus-from-agent" })]);
  backfillGapFingerprints(gap);

  const expected = buildFindingFingerprint(gap.profile, gap.findings[0]);
  assert.equal(gap.findings[0].fingerprint, expected);
});

void test("gap.json with empty fingerprints passes validation after backfill", () => {
  const gap = buildGap([
    buildFinding(),
    buildFinding({ finding_id: "G-002", title: "Critique section missing" }),
  ]);

  assert.throws(() => {
    validateGapAssessmentResult(gap);
  }, /fingerprint must be a non-empty string/);

  backfillGapFingerprints(gap);

  assert.doesNotThrow(() => {
    validateGapAssessmentResult(gap);
  });
});

void test("backfillGapFingerprints is a no-op when findings is not an array", () => {
  const gap = { ...buildGap([]), findings: undefined as unknown as GapFinding[] };
  assert.doesNotThrow(() => {
    backfillGapFingerprints(gap);
  });
});
