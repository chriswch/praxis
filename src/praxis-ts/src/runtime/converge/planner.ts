import type {
  CampaignFinding,
  CampaignLedgerRecord,
  FindingSeverity,
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

export function planRemediation(input: PlannerInput): {
  passId: string;
  remediationMap: RemediationMapRecord;
  remediationMarkdown: string;
  confidenceGate: number;
  confidenceDeferredFindingIds: string[];
} {
  const passId = buildPassId(input.passNumber);
  const confidenceGate = Math.max(0, Math.min(1, input.minimumConfidence ?? 0));
  const candidatesAtSeverity = listActiveFindings(input.ledger)
    .filter((finding) => isAtOrAboveSeverity(finding.severity, input.severityThreshold));
  const confidenceEligible = candidatesAtSeverity
    .filter((finding) => finding.confidence >= confidenceGate);
  const confidenceDeferred = candidatesAtSeverity
    .filter((finding) => finding.confidence < confidenceGate)
    .sort((left, right) => {
      const severityOrder = compareSeverity(left.severity, right.severity);
      if (severityOrder !== 0) {
        return severityOrder;
      }
      return left.finding_id.localeCompare(right.finding_id);
    });

  const rankedCandidates = rankCandidates(confidenceEligible);
  const maxSelection = Math.min(input.maxFindingsPerPass, input.maxStoriesPerPass);
  const selected = rankedCandidates.slice(0, maxSelection);
  const deferredByBatchLimit = rankedCandidates.slice(maxSelection);

  const slices: RemediationSliceRecord[] = selected.map((candidate, index) => ({
    slice_id: `S-${String(index + 1).padStart(3, "0")}`,
    finding_ids: [candidate.finding.finding_id],
    title: formatStoryTitle(candidate.finding),
    objective: candidate.finding.summary,
    scope: candidate.finding.affected_paths.length > 0 ? [...candidate.finding.affected_paths] : ["src/runtime/converge"],
    non_goals: [
      "Do not widen scope beyond selected findings for this pass.",
      "Record newly discovered out-of-scope risks for reassessment instead of implementing them now."
    ],
    dependencies: candidate.dependsOnFindingIds,
    done_condition: `Finding ${candidate.finding.finding_id} is resolved and reassessment confirms no regression.`
  }));

  const remediationMap: RemediationMapRecord = {
    version: 1,
    campaign_id: input.campaignId,
    pass_id: passId,
    pass_number: input.passNumber,
    review_id: input.reviewId,
    selected_finding_ids: selected.map((candidate) => candidate.finding.finding_id),
    deferred_finding_ids: [
      ...deferredByBatchLimit.map((candidate) => candidate.finding.finding_id),
      ...confidenceDeferred.map((candidate) => candidate.finding_id)
    ],
    selection: {
      policy: [
        "Severity-first ordering",
        "Dependency ordering where affected paths overlap",
        `Confidence gate (>= ${confidenceGate.toFixed(2)}) before remediation selection`,
        "Bounded by max findings and max stories",
        "Risk and confidence inform tie-breaks"
      ],
      selected: selected.map((candidate) => ({
        finding_id: candidate.finding.finding_id,
        priority_score: candidate.priorityScore,
        risk: candidate.risk,
        depends_on_finding_ids: candidate.dependsOnFindingIds,
        reason: candidate.selectionReason
      })),
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
      const selectedMeta = remediationMap.selection.selected.find((item) => item.finding_id === slice.finding_ids[0]);
      lines.push(`### ${slice.slice_id} ${slice.title}`);
      lines.push(`- Target findings: ${slice.finding_ids.join(", ")}`);
      lines.push(`- Objective: ${slice.objective}`);
      lines.push(`- Scope: ${slice.scope.join(", ")}`);
      lines.push(`- Dependencies: ${slice.dependencies.length > 0 ? slice.dependencies.join(", ") : "(none)"}`);
      lines.push(`- Done condition: ${slice.done_condition}`);
      lines.push(`- Selection reason: ${selectedMeta?.reason ?? "n/a"}`);
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
