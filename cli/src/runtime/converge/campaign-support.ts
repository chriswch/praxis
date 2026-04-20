import { isAbsolute, join, relative } from "node:path";
import { InvalidInputError } from "../../contracts/errors.js";
import type {
  CampaignLedgerRecord,
  CampaignRecord,
  FindingStatus,
  RunRecord,
  StoryLedgerRecord,
} from "../../contracts/model.js";

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled"]);

function findingIsActive(status: FindingStatus): boolean {
  return ["open", "batched", "in_progress", "still_open", "regressed", "escalated"].includes(
    status,
  );
}

export function normalizeRepoPath(repoRoot: string, candidatePath: string): string {
  const absolute = isAbsolute(candidatePath) ? candidatePath : join(repoRoot, candidatePath);
  const normalized = relative(repoRoot, absolute).replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("../")) {
    throw new InvalidInputError(`Objective path must be inside repo root: ${candidatePath}`);
  }
  return normalized;
}

export function applyWaivePolicy(campaign: CampaignRecord, ledger: CampaignLedgerRecord): void {
  if (!campaign.allow_waive) {
    return;
  }

  for (const findingId of ledger.finding_order) {
    const finding = ledger.findings[findingId];
    if (!findingIsActive(finding.status)) {
      continue;
    }
    if (finding.severity !== "low") {
      continue;
    }
    if (finding.confidence >= 0.4) {
      continue;
    }
    finding.status = "waived";
  }
}

export function formatObjectiveMarkdown(campaign: CampaignRecord): string {
  return [
    "# Converge Objective",
    "",
    `- Campaign: ${campaign.campaign_id}`,
    `- Workflow: ${campaign.workflow}`,
    `- Adapter: ${campaign.adapter}`,
    `- Objective path: ${campaign.objective.normalized_path}`,
    `- Profile: ${campaign.profile}`,
    `- Severity threshold: ${campaign.severity_threshold}`,
    `- Max passes: ${String(campaign.max_passes)}`,
    `- Max findings per pass: ${String(campaign.max_findings_per_pass)}`,
    `- Max stories per pass: ${String(campaign.max_stories_per_pass)}`,
    `- Commit per story: ${campaign.commit_per_story ? "enabled" : "disabled"}`,
    `- Auto continue: ${campaign.auto_continue ? "enabled" : "disabled"}`,
    `- Allow waive: ${campaign.allow_waive ? "enabled" : "disabled"}`,
    `- Scope: ${campaign.objective.scope.length > 0 ? campaign.objective.scope.join(", ") : "(repo root)"}`,
    "",
  ].join("\n");
}

// Target-spec formatting lives in target-spec-formatter.ts (M2 extraction).
// Re-exported here for callers that still import from campaign-support.js; new callers
// should import directly from target-spec-formatter.
export {
  formatTargetSpecMarkdown,
  type TargetSpecDraft,
  type ClarificationDecisionRecord,
} from "./target-spec-formatter.js";

export function parseReviewOrdinal(reviewId: string | null): number {
  if (!reviewId) {
    return 0;
  }
  const match = /^R-(\d+)$/.exec(reviewId);
  if (!match) {
    return 0;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isNaN(value) ? 0 : value;
}

export function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isRunTerminal(status: RunRecord["status"]): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

export function readOptionalString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function listCompletedStoryIds(ledger: StoryLedgerRecord | null): string[] {
  if (!ledger) {
    return [];
  }
  return ledger.stories.order.filter(
    (storyId) => ledger.stories.items[storyId].status === "completed",
  );
}

export function requiredCommitsForCompletion(completedStoryIds: string[]): number {
  return completedStoryIds.length > 0 ? completedStoryIds.length : 1;
}

export function buildConvergeClarifyingArtifacts(briefPath: string): string[] {
  return [
    briefPath,
    ".praxis/target-spec.md",
    ".praxis/clarification.json",
    ".praxis/gap.md",
    ".praxis/gap.json",
    ".praxis/remediation-map.md",
    ".praxis/remediation-map.json",
  ];
}
