import type { CampaignRecord } from "../../contracts/model.js";

export interface TargetSpecDraft {
  markdown: string;
  needsClarification: boolean;
  clarificationIssues: string[];
  acceptanceCriteriaCount: number;
  clarificationRecord: ClarificationDecisionRecord;
}

export interface ClarificationDecisionRecord {
  version: 1;
  campaign_id: string;
  source_objective_path: string;
  decisions: {
    goal: {
      text: string;
      source: string;
    };
    scope: {
      items: string[];
      source: string;
    };
    non_goals: {
      items: string[];
      source: string;
    };
    constraints: {
      items: string[];
      source: string;
    };
    acceptance_criteria: {
      items: string[];
      source: string;
    };
  };
  approval: {
    status: "approved" | "needs_operator";
    reasons: string[];
  };
}

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
    let bucket = sections.get(current);
    if (!bucket) {
      bucket = [];
      sections.set(current, bucket);
    }
    bucket.push(line);
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

export function formatTargetSpecMarkdown(
  campaign: CampaignRecord,
  objectiveText: string,
): TargetSpecDraft {
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
      .slice(0, 1),
  ]);
  const goal = goalCandidates[0] ?? "";

  const explicitScope = unique([
    ...campaign.objective.scope,
    ...pickSectionItems(sections, /scope|boundary|in scope/),
  ]);
  const inferredScopeFromPaths = objectiveLines
    .flatMap((line) => [...line.matchAll(/(?:^|\s)(src\/[A-Za-z0-9_./-]+)/g)])
    .map((match) => match[1]);
  const scopeItems =
    explicitScope.length > 0
      ? explicitScope
      : unique(inferredScopeFromPaths).length > 0
        ? unique(inferredScopeFromPaths)
        : ["(repo root)"];
  const scopeSource =
    explicitScope.length > 0
      ? "objective_declared"
      : unique(inferredScopeFromPaths).length > 0
        ? "inferred_from_paths"
        : "fallback_default";

  const nonGoals = unique([
    ...pickSectionItems(sections, /non-?goals?|out of scope/),
    ...listItems.filter((item) => /\b(do not|don't|out of scope|exclude|defer)\b/i.test(item)),
  ]);
  const scopedNonGoals =
    nonGoals.length > 0
      ? nonGoals
      : [`Limit remediation to the declared scope (${scopeItems.join(", ")}).`];
  const nonGoalsSource = nonGoals.length > 0 ? "objective_declared" : "fallback_default";

  const constraints = unique([
    ...pickSectionItems(sections, /constraint|guardrail|policy/),
    ...listItems.filter((item) => /\b(must|required|bounded|preserve|commit)\b/i.test(item)),
  ]);
  const scopedConstraints =
    constraints.length > 0
      ? constraints
      : [
          "Keep remediation bounded to selected findings for each pass.",
          "Preserve fresh-session execution boundaries for child stories.",
        ];
  const constraintsSource = constraints.length > 0 ? "objective_declared" : "fallback_default";

  const explicitAcceptanceCriteria = unique([
    ...pickSectionItems(sections, /acceptance|success|criteria|definition of done/),
    ...listItems.filter((item) =>
      /\b(must|should|shall|verify|ensure|confirm|required|keep|maintain)\b/i.test(item),
    ),
  ]);
  const acceptanceCriteria = explicitAcceptanceCriteria;
  const acceptanceSource = explicitAcceptanceCriteria.length > 0 ? "objective_declared" : "missing";

  const clarificationIssues: string[] = [];
  const approvalReasons: string[] = [];
  if (goal.length < 20) {
    clarificationIssues.push("Objective goal is too short or ambiguous for reliable comparison.");
  }
  if (acceptanceCriteria.length < 1) {
    clarificationIssues.push(
      "At least one explicit normative acceptance criterion is required for dependable gap assessment.",
    );
    approvalReasons.push(
      "Acceptance criteria could not be derived from explicit normative objective content.",
    );
  }
  if (listItems.length < 1 && objectiveLines.length < 3) {
    clarificationIssues.push(
      "Objective source is too sparse; add concrete requirements before assessment.",
    );
  }
  if (scopeSource === "inferred_from_paths") {
    approvalReasons.push("Scope was inferred from source paths and should be operator-confirmed.");
  }
  if (nonGoalsSource === "fallback_default") {
    approvalReasons.push("Non-goals are using defaults and should be operator-confirmed.");
  }
  const needsClarification = clarificationIssues.length > 0;
  const approvalStatus: "approved" | "needs_operator" =
    needsClarification || approvalReasons.length > 0 ? "needs_operator" : "approved";

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
    `- Approval status: ${approvalStatus}`,
    ...(approvalReasons.length > 0
      ? approvalReasons.map((reason) => `- Approval note: ${reason}`)
      : []),
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
    "",
  ].join("\n");

  return {
    markdown,
    needsClarification,
    clarificationIssues,
    acceptanceCriteriaCount: acceptanceCriteria.length,
    clarificationRecord: {
      version: 1,
      campaign_id: campaign.campaign_id,
      source_objective_path: campaign.objective.normalized_path,
      decisions: {
        goal: {
          text: goal,
          source: goal.length > 0 ? "objective_or_summary" : "missing",
        },
        scope: {
          items: scopeItems,
          source: scopeSource,
        },
        non_goals: {
          items: scopedNonGoals,
          source: nonGoalsSource,
        },
        constraints: {
          items: scopedConstraints,
          source: constraintsSource,
        },
        acceptance_criteria: {
          items: acceptanceCriteria,
          source: acceptanceSource,
        },
      },
      approval: {
        status: approvalStatus,
        reasons: approvalReasons,
      },
    },
  };
}
