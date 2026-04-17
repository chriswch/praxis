import type {
  CampaignFinding,
  CampaignLedgerRecord,
  FindingSeverity,
  GapAssessmentResult,
  RemediationMapRecord,
  RemediationSliceRecord
} from "../../contracts/model.js";
import { buildPassId } from "./identity.js";
import { compareSeverity, isAtOrAboveSeverity } from "./severity.js";
import { listActiveFindings } from "./ledger.js";

type PlannerInput = {
  campaignId: string;
  passNumber: number;
  reviewId: string;
  latestAssessment: GapAssessmentResult;
  ledger: CampaignLedgerRecord;
  severityThreshold: FindingSeverity;
  maxFindingsPerPass: number;
  maxStoriesPerPass: number;
  minimumConfidence?: number;
  generatedAt: string;
};

type RiskLevel = "high" | "medium" | "low";

type RankedCandidate = {
  finding: CampaignFinding;
  risk: RiskLevel;
  dependsOnFindingIds: string[];
  priorityScore: number;
  selectionReason: string;
};

const SEVERITY_SCORE: Record<FindingSeverity, number> = {
  critical: 400,
  high: 300,
  medium: 200,
  low: 100
};

const RISK_SCORE: Record<RiskLevel, number> = {
  high: 40,
  medium: 20,
  low: 5
};

function formatStoryTitle(finding: CampaignFinding): string {
  return `${finding.severity.toUpperCase()}: ${finding.title}`;
}

function overlapsAffectedPath(left: CampaignFinding, right: CampaignFinding): boolean {
  if (left.affected_paths.length === 0 || right.affected_paths.length === 0) {
    return false;
  }
  const rightPaths = new Set(right.affected_paths);
  return left.affected_paths.some((path) => rightPaths.has(path));
}

function classifyRisk(finding: CampaignFinding): RiskLevel {
  if (finding.severity === "critical") {
    return "high";
  }
  if (finding.severity === "high") {
    return finding.confidence < 0.65 ? "high" : "medium";
  }
  if (finding.severity === "medium") {
    return finding.confidence < 0.5 ? "high" : "medium";
  }
  return finding.confidence < 0.4 ? "medium" : "low";
}

function buildSelectionReason(candidate: RankedCandidate): string {
  const dependencyPart = candidate.dependsOnFindingIds.length > 0
    ? `depends on ${candidate.dependsOnFindingIds.join(", ")}`
    : "no explicit dependency";
  return [
    `severity=${candidate.finding.severity}`,
    `risk=${candidate.risk}`,
    `confidence=${candidate.finding.confidence.toFixed(2)}`,
    dependencyPart
  ].join("; ");
}

function rankCandidates(candidates: CampaignFinding[]): RankedCandidate[] {
  return candidates
    .map((finding) => {
      const dependsOnFindingIds = candidates
        .filter((candidate) => candidate.finding_id !== finding.finding_id)
        .filter((candidate) => compareSeverity(candidate.severity, finding.severity) < 0)
        .filter((candidate) => overlapsAffectedPath(candidate, finding))
        .map((candidate) => candidate.finding_id)
        .sort();
      const risk = classifyRisk(finding);
      const priorityScore =
        SEVERITY_SCORE[finding.severity]
        + (dependsOnFindingIds.length * 30)
        + Math.round(finding.confidence * 50)
        + RISK_SCORE[risk];

      const ranked: RankedCandidate = {
        finding,
        risk,
        dependsOnFindingIds,
        priorityScore,
        selectionReason: ""
      };
      ranked.selectionReason = buildSelectionReason(ranked);
      return ranked;
    })
    .sort((left, right) => {
      const severityOrder = compareSeverity(left.finding.severity, right.finding.severity);
      if (severityOrder !== 0) {
        return severityOrder;
      }
      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }
      if (right.finding.confidence !== left.finding.confidence) {
        return right.finding.confidence - left.finding.confidence;
      }
      return left.finding.finding_id.localeCompare(right.finding.finding_id);
    });
}

function buildAssessmentDrivenCandidates(
  assessment: GapAssessmentResult,
  ledger: CampaignLedgerRecord
): CampaignFinding[] {
  const activeByFingerprint = new Map(
    listActiveFindings(ledger).map((finding) => [finding.fingerprint, finding] as const)
  );

  const picked: CampaignFinding[] = [];
  const seenFindingIds = new Set<string>();
  for (const assessedFinding of assessment.findings) {
    const ledgerFinding = activeByFingerprint.get(assessedFinding.fingerprint);
    if (!ledgerFinding || seenFindingIds.has(ledgerFinding.finding_id)) {
      continue;
    }
    seenFindingIds.add(ledgerFinding.finding_id);
    picked.push(ledgerFinding);
  }
  return picked;
}

function shouldGroupCandidate(candidate: RankedCandidate, group: RankedCandidate[]): boolean {
  if (group.length === 0) {
    return false;
  }
  return group.some((entry) => overlapsAffectedPath(entry.finding, candidate.finding))
    || group[0].finding.category === candidate.finding.category;
}

function preferredGroupSize(input: PlannerInput): number {
  if (input.maxStoriesPerPass >= input.maxFindingsPerPass) {
    return 1;
  }
  const ratio = Math.ceil(input.maxFindingsPerPass / input.maxStoriesPerPass);
  return Math.max(1, Math.min(3, ratio));
}

function groupRelatedCandidates(rankedCandidates: RankedCandidate[], maxGroupSize: number): RankedCandidate[][] {
  const groups: RankedCandidate[][] = [];

  for (const candidate of rankedCandidates) {
    let placed = false;
    for (const group of groups) {
      if (group.length >= maxGroupSize) {
        continue;
      }
      if (!shouldGroupCandidate(candidate, group)) {
        continue;
      }
      group.push(candidate);
      placed = true;
      break;
    }

    if (!placed) {
      groups.push([candidate]);
    }
  }

  return groups;
}

function groupedSliceTitle(candidates: RankedCandidate[]): string {
  if (candidates.length === 1) {
    return formatStoryTitle(candidates[0].finding);
  }

  const mostSevere = [...candidates].sort((left, right) =>
    compareSeverity(left.finding.severity, right.finding.severity)
  )[0];
  const category = candidates[0].finding.category.replace(/-/g, " ");
  return `${mostSevere.finding.severity.toUpperCase()}: ${category} remediation bundle (${candidates.length} findings)`;
}

function groupedSliceObjective(candidates: RankedCandidate[]): string {
  const summaries = candidates.map((candidate) => candidate.finding.summary);
  if (summaries.length === 1) {
    return summaries[0];
  }
  return `Resolve grouped findings: ${summaries.slice(0, 3).join(" | ")}`;
}

export function planRemediation(input: PlannerInput): {
  passId: string;
  remediationMap: RemediationMapRecord;
  remediationMarkdown: string;
  confidenceGate: number;
  confidenceDeferredFindingIds: string[];
} {
  const passId = buildPassId(input.passNumber);
  const confidenceGate = Math.max(0, Math.min(1, input.minimumConfidence ?? 0));

  const assessmentDrivenCandidates = buildAssessmentDrivenCandidates(input.latestAssessment, input.ledger)
    .filter((finding) => isAtOrAboveSeverity(finding.severity, input.severityThreshold));

  const confidenceEligible = assessmentDrivenCandidates
    .filter((finding) => finding.confidence >= confidenceGate);
  const confidenceDeferred = assessmentDrivenCandidates
    .filter((finding) => finding.confidence < confidenceGate)
    .sort((left, right) => {
      const severityOrder = compareSeverity(left.severity, right.severity);
      if (severityOrder !== 0) {
        return severityOrder;
      }
      return left.finding_id.localeCompare(right.finding_id);
    });

  const rankedCandidates = rankCandidates(confidenceEligible);
  const groupedCandidates = groupRelatedCandidates(rankedCandidates, preferredGroupSize(input));

  const selectedGroups: RankedCandidate[][] = [];
  const deferredByBatchLimit: RankedCandidate[] = [];
  let selectedFindingCount = 0;

  for (const group of groupedCandidates) {
    const exceedsStoryBudget = selectedGroups.length >= input.maxStoriesPerPass;
    const exceedsFindingBudget = selectedFindingCount + group.length > input.maxFindingsPerPass;
    if (exceedsStoryBudget || exceedsFindingBudget) {
      deferredByBatchLimit.push(...group);
      continue;
    }

    selectedGroups.push(group);
    selectedFindingCount += group.length;
  }

  const slices: RemediationSliceRecord[] = selectedGroups.map((group, index) => {
    const selectedFindingIds = group.map((candidate) => candidate.finding.finding_id);
    const dependencies = Array.from(new Set(group
      .flatMap((candidate) => candidate.dependsOnFindingIds)
      .filter((findingId) => !selectedFindingIds.includes(findingId))));
    const scope = Array.from(new Set(group.flatMap((candidate) => candidate.finding.affected_paths)));

    return {
      slice_id: `S-${String(index + 1).padStart(3, "0")}`,
      finding_ids: selectedFindingIds,
      title: groupedSliceTitle(group),
      objective: groupedSliceObjective(group),
      scope: scope.length > 0 ? scope : ["src/runtime/converge"],
      non_goals: [
        "Do not widen scope beyond selected findings for this pass.",
        "Record newly discovered out-of-scope risks for reassessment instead of implementing them now."
      ],
      dependencies,
      done_condition: selectedFindingIds.length === 1
        ? `Finding ${selectedFindingIds[0]} is resolved and reassessment confirms no regression.`
        : `Findings ${selectedFindingIds.join(", ")} are resolved and reassessment confirms no regression.`
    };
  });

  const selectedByFindingId = new Map<string, { priority: number; risk: RiskLevel; reason: string; groupedIn: string }>();
  slices.forEach((slice, index) => {
    const group = selectedGroups[index];
    for (const candidate of group) {
      selectedByFindingId.set(candidate.finding.finding_id, {
        priority: candidate.priorityScore,
        risk: candidate.risk,
        reason: candidate.selectionReason,
        groupedIn: slice.slice_id
      });
    }
  });

  const selectedFindingIds = slices.flatMap((slice) => slice.finding_ids);
  const remediationMap: RemediationMapRecord = {
    version: 1,
    campaign_id: input.campaignId,
    pass_id: passId,
    pass_number: input.passNumber,
    review_id: input.reviewId,
    selected_finding_ids: selectedFindingIds,
    deferred_finding_ids: [
      ...deferredByBatchLimit.map((candidate) => candidate.finding.finding_id),
      ...confidenceDeferred.map((candidate) => candidate.finding_id)
    ],
    selection: {
      policy: [
        "Assessment-driven candidate pool from latest gap.json",
        "Severity-first ordering",
        "Dependency ordering where affected paths overlap",
        `Confidence gate (>= ${confidenceGate.toFixed(2)}) before remediation selection`,
        "Grouped related findings by shared affected paths or category",
        "Bounded by max findings and max stories"
      ],
      selected: selectedFindingIds.map((findingId) => {
        const selected = selectedByFindingId.get(findingId);
        return {
          finding_id: findingId,
          priority_score: selected?.priority ?? 0,
          risk: selected?.risk ?? "low",
          depends_on_finding_ids: selectedGroups
            .flatMap((group) => group)
            .find((candidate) => candidate.finding.finding_id === findingId)
            ?.dependsOnFindingIds ?? [],
          reason: `${selected?.reason ?? "selected"}; grouped_in=${selected?.groupedIn ?? "n/a"}`
        };
      }),
      deferred: [
        ...deferredByBatchLimit.map((candidate) => ({
          finding_id: candidate.finding.finding_id,
          reason: "deferred_by_batch_limit"
        })),
        ...confidenceDeferred.map((candidate) => ({
          finding_id: candidate.finding_id,
          reason: "deferred_low_confidence"
        }))
      ]
    },
    slices,
    generated_at: input.generatedAt
  };

  const lines: string[] = [
    "# Remediation Map",
    "",
    `- Pass: ${passId}`,
    `- Review: ${input.reviewId}`,
    `- Severity threshold: ${input.severityThreshold}`,
    `- Candidate source: .praxis/gap.json (${input.latestAssessment.findings.length} finding(s))`,
    `- Confidence gate: ${confidenceGate.toFixed(2)}`,
    `- Selected findings: ${remediationMap.selected_finding_ids.length}`,
    `- Deferred findings: ${remediationMap.deferred_finding_ids.length}`,
    "",
    "## Selection Policy",
    "",
    ...remediationMap.selection.policy.map((line) => `- ${line}`),
    ""
  ];

  if (slices.length === 0) {
    lines.push("No eligible findings selected for remediation in this pass.");
    lines.push("");
  } else {
    lines.push("## Slices");
    lines.push("");
    for (const slice of slices) {
      const selectedMeta = remediationMap.selection.selected
        .filter((item) => slice.finding_ids.includes(item.finding_id));
      lines.push(`### ${slice.slice_id} ${slice.title}`);
      lines.push(`- Target findings: ${slice.finding_ids.join(", ")}`);
      lines.push(`- Objective: ${slice.objective}`);
      lines.push(`- Scope: ${slice.scope.join(", ")}`);
      lines.push(`- Dependencies: ${slice.dependencies.length > 0 ? slice.dependencies.join(", ") : "(none)"}`);
      lines.push(`- Done condition: ${slice.done_condition}`);
      lines.push(`- Selection reason: ${selectedMeta.map((item) => item.reason).join(" | ")}`);
      lines.push(`- Non-goals: ${slice.non_goals.join(" ")}`);
      lines.push("");
    }
  }

  if (remediationMap.selection.deferred.length > 0) {
    lines.push("## Deferred Findings");
    lines.push("");
    for (const deferredFinding of remediationMap.selection.deferred) {
      lines.push(`- ${deferredFinding.finding_id}: ${deferredFinding.reason}`);
    }
    lines.push("");
  }

  return {
    passId,
    remediationMap,
    remediationMarkdown: lines.join("\n"),
    confidenceGate,
    confidenceDeferredFindingIds: confidenceDeferred.map((finding) => finding.finding_id)
  };
}

export const planPassBatch = planRemediation;
