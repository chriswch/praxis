import { describe, expect, it } from "vitest";
import { validateClarifyAssessArtifact } from "../../src/workflow/validator.js";

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
