import type { FindingSeverity } from "../../contracts/model.js";

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

export function compareSeverity(a: FindingSeverity, b: FindingSeverity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}

export function isAtOrAboveSeverity(
  severity: FindingSeverity,
  threshold: FindingSeverity
): boolean {
  return SEVERITY_RANK[severity] <= SEVERITY_RANK[threshold];
}
