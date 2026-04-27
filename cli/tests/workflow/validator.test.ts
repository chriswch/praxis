import { describe, expect, it } from "vitest";
import {
  parseReviewDecision,
  validateClarifyAssessArtifact,
  validateCodeReviewArtifact,
} from "../../src/workflow/validator.js";

const happyPath = `## Intent

Add a logout button.

## Assumptions

- Auth context is available

## Gaps

- none

## Plan

1. Wire button — surfaces logout

## Acceptance

- Button posts to /logout and redirects home
`;

describe("validateClarifyAssessArtifact", () => {
  it("accepts a well-formed artifact in the canonical H2 order", () => {
    expect(validateClarifyAssessArtifact(happyPath)).toEqual({ ok: true });
  });

  it("rejects when an H2 heading is missing", () => {
    const noGaps = happyPath.replace(/## Gaps[\s\S]*?(?=## Plan)/, "");
    const result = validateClarifyAssessArtifact(noGaps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/Gaps/);
    }
  });

  it("rejects when H2 headings appear in the wrong order", () => {
    const swapped = `## Intent\n\nx\n\n## Gaps\n\n- none\n\n## Assumptions\n\n- y\n\n## Plan\n\n1. step — why\n\n## Acceptance\n\n- crit\n`;
    const result = validateClarifyAssessArtifact(swapped);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.toLowerCase()).toMatch(/order|sequence/);
    }
  });

  it("rejects when the Acceptance section has no bullets", () => {
    const noBullets = happyPath.replace(
      /## Acceptance[\s\S]*$/,
      "## Acceptance\n\nNothing here.\n",
    );
    const result = validateClarifyAssessArtifact(noBullets);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/Acceptance/);
    }
  });

  it("rejects when the Acceptance section has only whitespace bullets", () => {
    const whitespaceBullets = happyPath.replace(
      /## Acceptance[\s\S]*$/,
      "## Acceptance\n\n-   \n-\t\n",
    );
    const result = validateClarifyAssessArtifact(whitespaceBullets);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/Acceptance/);
    }
  });

  it("accepts the literal '- none' for Gaps", () => {
    expect(validateClarifyAssessArtifact(happyPath).ok).toBe(true);
  });

  it("rejects an empty string", () => {
    const result = validateClarifyAssessArtifact("");
    expect(result.ok).toBe(false);
  });
});

describe("validateCodeReviewArtifact", () => {
  it("accepts a Decision body of 'proceed'", () => {
    const text = `## Summary\n\nLooks fine.\n\n## Decision\n\nproceed\n`;
    expect(validateCodeReviewArtifact(text)).toEqual({ ok: true });
  });

  it("accepts a Decision body of 'skip-improve'", () => {
    const text = `## Summary\n\nTrivial change.\n\n## Decision\n\nskip-improve\n`;
    expect(validateCodeReviewArtifact(text)).toEqual({ ok: true });
  });

  it("rejects when the ## Decision section is missing", () => {
    const text = `## Summary\n\nLooks fine.\n`;
    const result = validateCodeReviewArtifact(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/Decision/);
    }
  });

  it("rejects a Decision body that is neither 'proceed' nor 'skip-improve'", () => {
    const text = `## Decision\n\nmaybe\n`;
    const result = validateCodeReviewArtifact(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/Decision/);
    }
  });

  it("rejects a case-mismatched Decision body ('Proceed')", () => {
    const text = `## Decision\n\nProceed\n`;
    const result = validateCodeReviewArtifact(text);
    expect(result.ok).toBe(false);
  });

  it("rejects a multi-line Decision body", () => {
    const text = `## Decision\n\nproceed\nwith caution\n`;
    const result = validateCodeReviewArtifact(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/Decision/);
    }
  });

  it("rejects an empty Decision body", () => {
    const text = `## Summary\n\nx\n\n## Decision\n\n`;
    const result = validateCodeReviewArtifact(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/Decision/);
    }
  });

  it("tolerates blank lines and trailing whitespace around the Decision value", () => {
    const text = `## Decision\n\n\n  proceed   \n\n`;
    expect(validateCodeReviewArtifact(text)).toEqual({ ok: true });
  });
});

describe("parseReviewDecision", () => {
  it("returns 'proceed' when the Decision body is 'proceed'", () => {
    const text = `## Summary\n\nx\n\n## Decision\n\nproceed\n`;
    expect(parseReviewDecision(text)).toBe("proceed");
  });

  it("returns 'skip-improve' when the Decision body is 'skip-improve'", () => {
    const text = `## Summary\n\nx\n\n## Decision\n\nskip-improve\n`;
    expect(parseReviewDecision(text)).toBe("skip-improve");
  });

  it("trims surrounding whitespace from the Decision body", () => {
    const text = `## Decision\n\n\n   proceed   \n\n`;
    expect(parseReviewDecision(text)).toBe("proceed");
  });
});
