/**
 * Structural validators for workflow stage artifacts.
 *
 * `validateClarifyAssessArtifact`: all five H2 headings present in this
 *   exact order, and the Acceptance section contains at least one
 *   non-whitespace bullet.
 *
 * `validateCodeReviewArtifact`: an `## Decision` H2 exists and its body,
 *   trimmed, is exactly `proceed` or `skip-improve` (single line,
 *   case-sensitive). Everything above is freeform skill output.
 *
 * `parseReviewDecision`: returns the trimmed Decision body, narrowed to
 *   the union. Caller is expected to have validated first.
 */
const REQUIRED_H2 = [
  "Intent",
  "Assumptions",
  "Gaps",
  "Plan",
  "Acceptance",
] as const;

export function validateClarifyAssessArtifact(
  text: string,
): { ok: true } | { ok: false; reason: string } {
  const headings = extractH2Headings(text);

  // Missing or out-of-order headings.
  for (let i = 0; i < REQUIRED_H2.length; i++) {
    const expected = REQUIRED_H2[i];
    const actual = headings[i];
    if (actual === undefined) {
      return { ok: false, reason: `missing required H2: ${expected}` };
    }
    if (actual !== expected) {
      return {
        ok: false,
        reason: `H2 headings out of order: expected ${expected} at position ${i + 1}, got ${actual}`,
      };
    }
  }

  // Acceptance bullets check — at least one non-whitespace bullet.
  const acceptanceBody = extractSectionBody(text, "Acceptance");
  if (!hasNonEmptyBullet(acceptanceBody)) {
    return {
      ok: false,
      reason: "Acceptance section must contain at least one non-empty bullet",
    };
  }

  return { ok: true };
}

export function parseReviewDecision(text: string): "proceed" | "skip-improve" {
  const body = extractSectionBody(text, "Decision").trim();
  return body as "proceed" | "skip-improve";
}

export function validateCodeReviewArtifact(
  text: string,
): { ok: true } | { ok: false; reason: string } {
  const headings = extractH2Headings(text);
  if (!headings.includes("Decision")) {
    return { ok: false, reason: "missing required H2: Decision" };
  }
  const body = extractSectionBody(text, "Decision").trim();
  if (body !== "proceed" && body !== "skip-improve") {
    return {
      ok: false,
      reason: `Decision body must be 'proceed' or 'skip-improve', got: ${body}`,
    };
  }
  return { ok: true };
}

function extractH2Headings(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

function extractSectionBody(text: string, heading: string): string {
  const lines = text.split("\n");
  let inSection = false;
  const collected: string[] = [];
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (inSection) break;
      if (m[1] === heading) inSection = true;
      continue;
    }
    if (inSection) collected.push(line);
  }
  return collected.join("\n");
}

function hasNonEmptyBullet(body: string): boolean {
  for (const line of body.split("\n")) {
    const m = /^\s*-\s+(.*)$/.exec(line);
    if (m && m[1].trim().length > 0) return true;
  }
  return false;
}
