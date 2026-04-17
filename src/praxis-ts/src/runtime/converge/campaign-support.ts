import { isAbsolute, join, relative } from "node:path";
import { InvalidInputError } from "../../contracts/errors.js";
import type { CampaignLedgerRecord, CampaignRecord, FindingStatus, RunRecord, StoryLedgerRecord } from "../../contracts/model.js";

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled"]);

function findingIsActive(status: FindingStatus): boolean {
  return ["open", "batched", "in_progress", "still_open", "regressed", "escalated"].includes(status);
}

export function normalizeRepoPath(repoRoot: string, candidatePath: string): string {
  const absolute = isAbsolute(candidatePath)
    ? candidatePath
    : join(repoRoot, candidatePath);
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
    `- Max passes: ${campaign.max_passes}`,
    `- Max findings per pass: ${campaign.max_findings_per_pass}`,
    `- Max stories per pass: ${campaign.max_stories_per_pass}`,
    `- Commit per story: ${campaign.commit_per_story ? "enabled" : "disabled"}`,
    `- Auto continue: ${campaign.auto_continue ? "enabled" : "disabled"}`,
    `- Allow waive: ${campaign.allow_waive ? "enabled" : "disabled"}`,
    `- Scope: ${campaign.objective.scope.length > 0 ? campaign.objective.scope.join(", ") : "(repo root)"}`,
    ""
  ].join("\n");
}

export function formatTargetSpecMarkdown(campaign: CampaignRecord, objectiveText: string): string {
  const trimmed = objectiveText.trim();
  const objectiveLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const listItems = objectiveLines
    .map((line) => /^(?:[-*]|\d+\.)\s+(.+)$/.exec(line)?.[1]?.trim())
    .filter((line): line is string => Boolean(line && line.length > 0));
  const headings = objectiveLines
    .map((line) => /^#{1,6}\s+(.+)$/.exec(line)?.[1]?.trim())
    .filter((line): line is string => Boolean(line && line.length > 0));
  const candidateGoal = headings.find((heading) => !/^objective$/i.test(heading))
    ?? listItems[0]
    ?? objectiveLines.find((line) => !/^#{1,6}\s+/.test(line))
    ?? "Close the identified remediation scope against an explicit target.";
  const acceptanceCriteria = listItems.length > 0
    ? listItems
    : [
        "Target behavior is specific enough for repo-level gap assessment.",
        "Scope and non-goals are explicit enough to reject out-of-scope noise.",
        "Success criteria are testable for bounded remediation slices."
      ];

  return [
    "# Target Spec",
    "",
    "## Goal",
    "",
    candidateGoal,
    "",
    "## Scope",
    "",
    ...(campaign.objective.scope.length > 0
      ? campaign.objective.scope.map((path) => `- ${path}`)
      : ["- (repo root)"]),
    "",
    "## Non-Goals",
    "",
    "- Do not expand beyond the current converge campaign scope.",
    "- Do not merge unrelated findings into a single broad remediation task.",
    "",
    "## Constraints",
    "",
    "- Keep remediation bounded to selected findings for each pass.",
    "- Preserve fresh-session execution boundaries for child stories.",
    "- Keep stage contracts stable for future skill-swappable stage workers.",
    "",
    "## Acceptance Criteria",
    "",
    ...acceptanceCriteria.map((criterion) => `- ${criterion}`),
    "",
    "## References",
    "",
    `- Campaign: ${campaign.campaign_id}`,
    `- Source objective: ${campaign.objective.normalized_path}`,
    `- Profile: ${campaign.profile}`,
    "",
    "## Imported Objective Content",
    "",
    trimmed.length > 0 ? trimmed : "(empty objective source)",
    ""
  ].join("\n");
}

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
  return ledger.stories.order.filter((storyId) => ledger.stories.items[storyId]?.status === "completed");
}

export function requiredCommitsForCompletion(completedStoryIds: string[]): number {
  return completedStoryIds.length > 0 ? completedStoryIds.length : 1;
}

export function buildConvergeClarifyingArtifacts(briefPath: string): string[] {
  return [
    briefPath,
    ".praxis/target-spec.md",
    ".praxis/gap.md",
    ".praxis/gap.json",
    ".praxis/remediation-map.md",
    ".praxis/remediation-map.json"
  ];
}
