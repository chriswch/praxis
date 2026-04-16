import { createHash } from "node:crypto";
import type { CampaignLedgerRecord, ConvergeProfile, ObjectiveFinding } from "../../contracts/model.js";

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildFindingFingerprint(
  profile: ConvergeProfile,
  finding: Pick<ObjectiveFinding, "category" | "objective_refs" | "affected_paths" | "title" | "summary">
): string {
  const material = [
    profile,
    normalizeText(finding.category),
    finding.objective_refs.map(normalizeText).sort().join(","),
    finding.affected_paths.map(normalizeText).sort().join(","),
    normalizeText(finding.title),
    normalizeText(finding.summary)
  ].join("|");

  return createHash("sha1").update(material).digest("hex").slice(0, 16);
}

export function nextFindingId(ledger: CampaignLedgerRecord): string {
  let max = 0;
  for (const findingId of ledger.finding_order) {
    const match = /^F-(\d+)$/.exec(findingId);
    if (!match) {
      continue;
    }
    const value = Number.parseInt(match[1], 10);
    if (!Number.isNaN(value)) {
      max = Math.max(max, value);
    }
  }

  return `F-${String(max + 1).padStart(3, "0")}`;
}

export function buildPassId(passNumber: number): string {
  return `P-${String(passNumber).padStart(3, "0")}`;
}

export function buildReviewId(reviewCounter: number): string {
  return `R-${String(reviewCounter).padStart(3, "0")}`;
}
