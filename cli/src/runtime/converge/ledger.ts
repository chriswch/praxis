import type {
  CampaignFinding,
  CampaignLedgerRecord,
  FindingSeverity,
  FindingStatus,
  GapAssessmentResult,
} from "../../contracts/model.js";
import { nextFindingId } from "./identity.js";
import { compareSeverity, isAtOrAboveSeverity } from "./severity.js";

const ACTIVE_FINDING_STATUSES: FindingStatus[] = [
  "open",
  "batched",
  "in_progress",
  "still_open",
  "regressed",
  "escalated",
];

function findingIsActive(status: FindingStatus): boolean {
  return ACTIVE_FINDING_STATUSES.includes(status);
}

function unresolvedStatusFromPrevious(previousStatus: FindingStatus): FindingStatus {
  if (previousStatus === "fixed") {
    return "regressed";
  }
  if (previousStatus === "waived" || previousStatus === "duplicate") {
    return previousStatus;
  }
  if (previousStatus === "batched" || previousStatus === "in_progress") {
    return "still_open";
  }
  return previousStatus === "regressed" ? "regressed" : "still_open";
}

export function createEmptyCampaignLedger(
  campaignId: string,
  profile: CampaignLedgerRecord["profile"],
  updatedAt: string,
): CampaignLedgerRecord {
  return {
    version: 1,
    campaign_id: campaignId,
    profile,
    findings: {},
    finding_order: [],
    timestamps: {
      updated_at: updatedAt,
    },
  };
}

export function mergeAssessmentIntoLedger(
  ledger: CampaignLedgerRecord,
  assessment: GapAssessmentResult,
  passNumber: number,
  updatedAt: string,
): {
  ledger: CampaignLedgerRecord;
  activeFindingIds: string[];
  introducedFindingIds: string[];
  fixedFindingIds: string[];
} {
  const byFingerprint = new Map<string, CampaignFinding>();
  for (const findingId of ledger.finding_order) {
    const finding = ledger.findings[findingId];
    byFingerprint.set(finding.fingerprint, finding);
  }

  const seenInPass = new Set<string>();
  const introducedFindingIds: string[] = [];

  for (const assessedFinding of assessment.findings) {
    const existing = byFingerprint.get(assessedFinding.fingerprint);
    if (existing) {
      existing.title = assessedFinding.title;
      existing.kind = assessedFinding.kind;
      existing.severity = assessedFinding.severity;
      existing.category = assessedFinding.category;
      existing.summary = assessedFinding.summary;
      existing.expected_behavior = assessedFinding.expected_behavior;
      existing.current_behavior = assessedFinding.current_behavior;
      existing.evidence = assessedFinding.evidence;
      existing.objective_refs = assessedFinding.objective_refs;
      existing.affected_paths = assessedFinding.affected_paths;
      existing.recommended_direction = assessedFinding.recommended_direction;
      existing.recommended_action = assessedFinding.recommended_action;
      existing.confidence = assessedFinding.confidence;
      existing.status = unresolvedStatusFromPrevious(existing.status);
      existing.last_seen_pass = passNumber;
      existing.resolved_in_pass = null;
      seenInPass.add(existing.finding_id);
      continue;
    }

    const findingId = nextFindingId(ledger);
    const created: CampaignFinding = {
      finding_id: findingId,
      fingerprint: assessedFinding.fingerprint,
      title: assessedFinding.title,
      kind: assessedFinding.kind,
      severity: assessedFinding.severity,
      category: assessedFinding.category,
      summary: assessedFinding.summary,
      expected_behavior: assessedFinding.expected_behavior,
      current_behavior: assessedFinding.current_behavior,
      evidence: assessedFinding.evidence,
      objective_refs: assessedFinding.objective_refs,
      affected_paths: assessedFinding.affected_paths,
      recommended_direction: assessedFinding.recommended_direction,
      recommended_action: assessedFinding.recommended_action,
      status: "open",
      confidence: assessedFinding.confidence,
      introduced_in_pass: passNumber,
      resolved_in_pass: null,
      child_run_ids: [],
      story_ids: [],
      commit_refs: [],
      last_seen_pass: passNumber,
    };
    ledger.findings[findingId] = created;
    ledger.finding_order.push(findingId);
    byFingerprint.set(created.fingerprint, created);
    seenInPass.add(findingId);
    introducedFindingIds.push(findingId);
  }

  const fixedFindingIds: string[] = [];
  for (const findingId of ledger.finding_order) {
    const finding = ledger.findings[findingId];
    if (!findingIsActive(finding.status)) {
      continue;
    }
    if (seenInPass.has(findingId)) {
      continue;
    }
    finding.status = "fixed";
    finding.resolved_in_pass = passNumber;
    fixedFindingIds.push(findingId);
  }

  ledger.timestamps.updated_at = updatedAt;

  return {
    ledger,
    activeFindingIds: listActiveFindings(ledger).map((finding) => finding.finding_id),
    introducedFindingIds,
    fixedFindingIds,
  };
}

export function listActiveFindings(ledger: CampaignLedgerRecord): CampaignFinding[] {
  return ledger.finding_order
    .map((findingId) => ledger.findings[findingId])
    .filter((finding) => findingIsActive(finding.status))
    .sort((left, right) => {
      const severityOrder = compareSeverity(left.severity, right.severity);
      if (severityOrder !== 0) {
        return severityOrder;
      }
      return right.confidence - left.confidence;
    });
}

export function countUnresolvedAtOrAboveThreshold(
  ledger: CampaignLedgerRecord,
  threshold: FindingSeverity,
): number {
  let count = 0;
  for (const finding of listActiveFindings(ledger)) {
    if (isAtOrAboveSeverity(finding.severity, threshold)) {
      count += 1;
    }
  }
  return count;
}

export function markFindingsBatched(ledger: CampaignLedgerRecord, findingIds: string[]): void {
  for (const findingId of findingIds) {
    if (!(findingId in ledger.findings)) {
      continue;
    }
    const finding = ledger.findings[findingId];
    if (
      finding.status === "open" ||
      finding.status === "still_open" ||
      finding.status === "regressed"
    ) {
      finding.status = "batched";
    }
  }
}

export function markFindingsInProgress(
  ledger: CampaignLedgerRecord,
  findingIds: string[],
  childRunId: string,
  storyIds: string[],
): void {
  for (const findingId of findingIds) {
    if (!(findingId in ledger.findings)) {
      continue;
    }
    const finding = ledger.findings[findingId];
    finding.status = "in_progress";
    if (!finding.child_run_ids.includes(childRunId)) {
      finding.child_run_ids.push(childRunId);
    }
    for (const storyId of storyIds) {
      if (!finding.story_ids.includes(storyId)) {
        finding.story_ids.push(storyId);
      }
    }
  }
}

export function attachCommitRefsToFindings(
  ledger: CampaignLedgerRecord,
  findingIds: string[],
  commitRefs: string[],
): void {
  for (const findingId of findingIds) {
    if (!(findingId in ledger.findings)) {
      continue;
    }
    const finding = ledger.findings[findingId];
    for (const commitRef of commitRefs) {
      if (!finding.commit_refs.includes(commitRef)) {
        finding.commit_refs.push(commitRef);
      }
    }
  }
}
