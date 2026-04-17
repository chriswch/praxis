import type { CampaignRecord, PassSummaryRecord } from "../../contracts/model.js";

export type PostAssessmentDecision = "continue" | "converged" | "stalled";
export type TerminalStopReason = Exclude<PassSummaryRecord["outcome"], "continue" | "needs_operator">;

const NO_PROGRESS_STALL_THRESHOLD = 2;

// Campaign-level stop decisions. Isolated so that changes to convergence criteria
// (what counts as converged, how many idle passes mean stalled, budget policy) do not
// require touching the orchestration loop.
export class CampaignStopPolicy {
  decidePostAssessment(
    campaign: CampaignRecord,
    unresolvedAtThreshold: number
  ): PostAssessmentDecision {
    if (unresolvedAtThreshold === 0) {
      return "converged";
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
    return "Campaign reached the configured max pass budget.";
  }
}
