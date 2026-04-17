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

export type TargetSpecDraft = {
  markdown: string;
  needsClarification: boolean;
  clarificationIssues: string[];
  acceptanceCriteriaCount: number;
};

function isListItem(line: string): boolean {
  return /^(?:[-*]|\d+\.)\s+/.test(line);
}

function normalizeListItem(line: string): string {
  return line.replace(/^(?:[-*]|\d+\.)\s+/, "").trim();
}

function collectSections(objectiveLines: string[]): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current = "objective";

  for (const line of objectiveLines) {
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading) {
      current = heading[1].trim().toLowerCase();
      if (!sections.has(current)) {
        sections.set(current, []);
      }
      continue;
    }
    if (!sections.has(current)) {
      sections.set(current, []);
    }
    sections.get(current)!.push(line);
  }

  return sections;
}

function pickSectionItems(sections: Map<string, string[]>, matcher: RegExp): string[] {
  const selected: string[] = [];
  for (const [heading, lines] of sections.entries()) {
    if (!matcher.test(heading)) {
      continue;
    }
    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }
      selected.push(isListItem(line) ? normalizeListItem(line) : line.trim());
    }
  }
  return selected;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

export function formatTargetSpecMarkdown(campaign: CampaignRecord, objectiveText: string): TargetSpecDraft {
  const trimmed = objectiveText.trim();
  const objectiveLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const sections = collectSections(objectiveLines);
  const listItems = objectiveLines
    .map((line) => /^(?:[-*]|\d+\.)\s+(.+)$/.exec(line)?.[1]?.trim())
    .filter((line): line is string => Boolean(line && line.length > 0));
  const goalCandidates = unique([
    ...pickSectionItems(sections, /goal|objective|summary|outcome/),
    ...listItems.slice(0, 1),
    ...objectiveLines
      .filter((line) => !line.startsWith("#"))
      .filter((line) => !isListItem(line))
      .slice(0, 1)
  ]);
  const goal = goalCandidates[0] ?? "";

  const explicitScope = unique([
    ...campaign.objective.scope,
    ...pickSectionItems(sections, /scope|boundary|in scope/)
  ]);
  const inferredScopeFromPaths = objectiveLines
    .flatMap((line) => [...line.matchAll(/(?:^|\s)(src\/[A-Za-z0-9_./-]+)/g)])
    .map((match) => match[1]);
  const scopeItems = explicitScope.length > 0
    ? explicitScope
    : unique(inferredScopeFromPaths).length > 0
      ? unique(inferredScopeFromPaths)
      : ["(repo root)"];
  const scopeSource = explicitScope.length > 0
    ? "objective_declared"
    : unique(inferredScopeFromPaths).length > 0
      ? "inferred_from_paths"
      : "fallback_default";

  const nonGoals = unique([
    ...pickSectionItems(sections, /non-?goals?|out of scope/),
    ...listItems.filter((item) => /\b(do not|don't|out of scope|exclude|defer)\b/i.test(item))
  ]);
  const scopedNonGoals = nonGoals.length > 0
    ? nonGoals
    : [`Limit remediation to the declared scope (${scopeItems.join(", ")}).`];
  const nonGoalsSource = nonGoals.length > 0 ? "objective_declared" : "fallback_default";

  const constraints = unique([
    ...pickSectionItems(sections, /constraint|guardrail|policy/),
    ...listItems.filter((item) => /\b(must|required|bounded|preserve|commit)\b/i.test(item))
  ]);
  const scopedConstraints = constraints.length > 0
    ? constraints
    : [
        "Keep remediation bounded to selected findings for each pass.",
        "Preserve fresh-session execution boundaries for child stories."
      ];
  const constraintsSource = constraints.length > 0 ? "objective_declared" : "fallback_default";

  const explicitAcceptanceCriteria = unique([
    ...pickSectionItems(sections, /acceptance|success|criteria|definition of done/),
    ...listItems.filter((item) => /\b(must|should|verify|ensure|confirm)\b/i.test(item))
  ]);
  const acceptanceCriteria = explicitAcceptanceCriteria.length > 0
    ? explicitAcceptanceCriteria
    : listItems;
  const acceptanceSource = explicitAcceptanceCriteria.length > 0 ? "objective_declared" : "fallback_from_list_items";

  const clarificationIssues: string[] = [];
  if (goal.length < 20) {
    clarificationIssues.push("Objective goal is too short or ambiguous for reliable comparison.");
  }
  if (acceptanceCriteria.length < 1) {
    clarificationIssues.push("At least one acceptance criterion is required for dependable gap assessment.");
  }
  if (listItems.length < 1 && objectiveLines.length < 3) {
    clarificationIssues.push("Objective source is too sparse; add concrete requirements before assessment.");
  }
  const needsClarification = clarificationIssues.length > 0;

  const markdown = [
    "# Target Spec",
    "",
    "## Goal",
    "",
    goal.length > 0 ? goal : "(missing: provide a concrete objective goal)",
    "",
    "## Scope",
    "",
    ...scopeItems.map((path) => `- ${path}`),
    "",
    "## Non-Goals",
    "",
    ...scopedNonGoals.map((item) => `- ${item}`),
    "",
    "## Constraints",
    "",
    ...scopedConstraints.map((item) => `- ${item}`),
    "",
    "## Acceptance Criteria",
    "",
    ...(acceptanceCriteria.length > 0
      ? acceptanceCriteria.map((criterion) => `- ${criterion}`)
      : ["- (missing: add acceptance criteria to the objective source)"]),
    "",
    "## Clarified Target Decisions",
    "",
    "- The following sections are the authoritative remediation target for assessment and planning.",
    `- Goal source: ${goal.length > 0 ? "objective_or_summary" : "missing"}`,
    `- Scope source: ${scopeSource}`,
    `- Non-goals source: ${nonGoalsSource}`,
    `- Constraints source: ${constraintsSource}`,
    `- Acceptance criteria source: ${acceptanceSource}`,
    "",
    "## Clarification Status",
    "",
    `- Needs clarification: ${needsClarification ? "yes" : "no"}`,
    ...clarificationIssues.map((issue) => `- ${issue}`),
    "",
    "## References",
    "",
    `- Campaign: ${campaign.campaign_id}`,
    `- Source objective: ${campaign.objective.normalized_path}`,
    `- Profile: ${campaign.profile}`,
    "",
    "## Imported Objective Source (read-only context)",
    "",
    trimmed.length > 0 ? trimmed : "(empty objective source)",
    ""
  ].join("\n");

  return {
    markdown,
    needsClarification,
    clarificationIssues,
    acceptanceCriteriaCount: acceptanceCriteria.length
  };
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
