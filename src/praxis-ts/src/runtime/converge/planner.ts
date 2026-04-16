import type {
  CampaignFinding,
  CampaignLedgerRecord,
  FindingSeverity,
  PassBatchRecord
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
  generatedAt: string;
};

function formatStoryTitle(finding: CampaignFinding): string {
  return `${finding.severity.toUpperCase()}: ${finding.title}`;
}

export function planPassBatch(input: PlannerInput): {
  passId: string;
  batch: PassBatchRecord;
  batchMarkdown: string;
} {
  const passId = buildPassId(input.passNumber);
  const candidates = listActiveFindings(input.ledger)
    .filter((finding) => isAtOrAboveSeverity(finding.severity, input.severityThreshold))
    .sort((left, right) => {
      const severityOrder = compareSeverity(left.severity, right.severity);
      if (severityOrder !== 0) {
        return severityOrder;
      }
      return right.confidence - left.confidence;
    });

  const maxSelection = Math.min(input.maxFindingsPerPass, input.maxStoriesPerPass);
  const selected = candidates.slice(0, maxSelection);
  const deferred = candidates.slice(maxSelection);

  const stories = selected.map((finding, index) => ({
    story_id: `S-${String(index + 1).padStart(3, "0")}`,
    title: formatStoryTitle(finding),
    finding_ids: [finding.finding_id],
    objective_context: finding.summary,
    non_goals: [
      "Do not widen scope beyond selected findings for this pass.",
      "Record newly discovered out-of-scope risks for reassessment instead of implementing them now."
    ]
  }));

  const batch: PassBatchRecord = {
    version: 1,
    campaign_id: input.campaignId,
    pass_id: passId,
    pass_number: input.passNumber,
    review_id: input.reviewId,
    selected_finding_ids: selected.map((finding) => finding.finding_id),
    deferred_finding_ids: deferred.map((finding) => finding.finding_id),
    stories,
    generated_at: input.generatedAt
  };

  const lines: string[] = [
    "# Remediation Batch",
    "",
    `- Pass: ${passId}`,
    `- Review: ${input.reviewId}`,
    `- Severity threshold: ${input.severityThreshold}`,
    `- Selected findings: ${batch.selected_finding_ids.length}`,
    `- Deferred findings: ${batch.deferred_finding_ids.length}`,
    ""
  ];

  if (stories.length === 0) {
    lines.push("No eligible findings selected for remediation in this pass.");
    lines.push("");
  } else {
    lines.push("## Stories");
    lines.push("");
    for (const story of stories) {
      lines.push(`### ${story.story_id} ${story.title}`);
      lines.push(`- Finding IDs: ${story.finding_ids.join(", ")}`);
      lines.push(`- Objective context: ${story.objective_context}`);
      lines.push(`- Non-goals: ${story.non_goals.join(" ")}`);
      lines.push("");
    }
  }

  return {
    passId,
    batch,
    batchMarkdown: lines.join("\n")
  };
}
