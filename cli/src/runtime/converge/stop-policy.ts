import type { CampaignRecord, PassSummaryRecord } from "../../contracts/model.js";

export type PostAssessmentDecision =
  | "continue"
  | "converged"
  | "stalled"
  | "no_new_findings";
export type TerminalStopReason = Exclude<
  PassSummaryRecord["outcome"],
  "continue" | "needs_operator"
>;

const NO_PROGRESS_STALL_THRESHOLD = 2;

// Campaign-level stop decisions. Isolated so that changes to convergence criteria
// (what counts as converged, how many idle passes mean stalled, when we detect
// "no new findings", budget policy) do not require touching the orchestration loop.
export class CampaignStopPolicy {
  decidePostAssessment(
    campaign: CampaignRecord,
    unresolvedAtThreshold: number,
    currentFingerprints: string[] = [],
  ): PostAssessmentDecision {
    if (unresolvedAtThreshold === 0) {
      return "converged";
    }
    // G-07: if the finding set is identical to the previous pass's and no new
    // fingerprint appeared, stop with `no_new_findings`. This beats the stall
    // path for idle-identical passes — the agent has nothing new to report.
    if (this.fingerprintsMatchPrevious(campaign, currentFingerprints)) {
      return "no_new_findings";
    }
    if (campaign.metrics.no_progress_passes >= NO_PROGRESS_STALL_THRESHOLD) {
      return "stalled";
    }
    return "continue";
  }

  isBudgetExhausted(campaign: CampaignRecord, nextPassNumber: number): boolean {
    return nextPassNumber > campaign.max_passes;
  }

  stopReasonMessage(reason: TerminalStopReason): string {
    if (reason === "converged") {
      return "No unresolved findings remain at or above the configured threshold.";
    }
    if (reason === "stalled") {
      return "Campaign stalled: repeated passes did not reduce unresolved findings.";
    }
    if (reason === "no_new_findings") {
      return "Campaign stopped: the assessment produced the same finding set as the prior pass with no new fingerprints.";
    }
    return "Campaign reached the configured max pass budget.";
  }

  private fingerprintsMatchPrevious(
    campaign: CampaignRecord,
    currentFingerprints: string[],
  ): boolean {
    const previous = campaign.metrics.previous_assessed_fingerprints;
    if (!previous) {
      return false;
    }
    if (previous.length !== currentFingerprints.length) {
      return false;
    }
    const sortedPrevious = [...previous].sort();
    const sortedCurrent = [...currentFingerprints].sort();
    return sortedPrevious.every((fp, index) => fp === sortedCurrent[index]);
  }
}
