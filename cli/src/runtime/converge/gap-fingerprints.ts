import type { GapAssessmentResult, ObjectiveFinding } from "../../contracts/model.js";
import { buildFindingFingerprint } from "./identity.js";

// Agents are instructed to leave finding fingerprints empty; the host owns the
// canonical fingerprint algorithm. Recompute fingerprints in-process before any
// validation/consumption so downstream stages never read empty values.
export function canonicalizeGapFingerprints(gap: GapAssessmentResult): boolean {
  if (!Array.isArray(gap.findings)) {
    return false;
  }

  let changed = false;
  for (const finding of gap.findings) {
    if (!isFingerprintMaterial(finding)) {
      continue;
    }
    const fingerprint = buildFindingFingerprint(gap.profile, finding);
    if (finding.fingerprint !== fingerprint) {
      changed = true;
      finding.fingerprint = fingerprint;
    }
  }

  return changed;
}

function isFingerprintMaterial(
  finding: unknown,
): finding is Pick<
  ObjectiveFinding,
  "fingerprint" | "category" | "objective_refs" | "affected_paths" | "title" | "summary"
> {
  if (!finding || typeof finding !== "object") {
    return false;
  }
  const candidate = finding as Record<string, unknown>;
  return (
    typeof candidate.fingerprint === "string" &&
    typeof candidate.category === "string" &&
    Array.isArray(candidate.objective_refs) &&
    Array.isArray(candidate.affected_paths) &&
    typeof candidate.title === "string" &&
    typeof candidate.summary === "string"
  );
}
