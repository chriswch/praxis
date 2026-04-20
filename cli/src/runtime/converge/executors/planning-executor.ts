import { BlockedStateError } from "../../../contracts/errors.js";
import { buildConvergeStageResult } from "../stage-runtime.js";
import { planRemediation } from "../planner.js";
import type {
  ConvergeStageExecutor,
  ConvergeStageExecutorContext,
  ConvergeStageExecutorOutput,
} from "../stage-executor.js";

// In-process executor for planning-remediation. Reads the latest gap assessment
// from the repository and computes the remediation map/slice plan without any
// adapter involvement — pure planning logic.
export class PlanningRemediationExecutor implements ConvergeStageExecutor {
  readonly stage = "planning-remediation" as const;

  async execute(context: ConvergeStageExecutorContext): Promise<ConvergeStageExecutorOutput> {
    if (!context.reviewId) {
      throw new BlockedStateError("Cannot plan remediation without an assessment review id.");
    }
    const latestAssessment = await context.repo.loadGapAssessment();
    if (!latestAssessment) {
      throw new BlockedStateError(
        "Cannot plan remediation without .praxis/gap.json from assessing-gaps.",
      );
    }

    const batchPlan = planRemediation({
      campaignId: context.campaign.campaign_id,
      passNumber: context.passNumber,
      reviewId: context.reviewId,
      latestAssessment,
      severityThreshold: context.campaign.severity_threshold,
      maxFindingsPerPass: context.campaign.max_findings_per_pass,
      maxStoriesPerPass: context.campaign.max_stories_per_pass,
      generatedAt: context.generatedAt,
    });

    const stageResult = buildConvergeStageResult({
      stage: "planning-remediation",
      outcomeCode:
        batchPlan.remediationMap.slices.length === 0 ? "no_selection" : "remediation_map_ready",
      data: {
        selected_findings_count: batchPlan.remediationMap.selected_finding_ids.length,
        deferred_findings_count: batchPlan.remediationMap.deferred_finding_ids.length,
        slices_count: batchPlan.remediationMap.slices.length,
      },
    });

    return {
      stageResult,
      artifactsWritten: [
        ".praxis/remediation-map.md",
        ".praxis/remediation-map.json",
        ".praxis/results/planning-remediation.json",
      ],
      remediationMap: batchPlan.remediationMap,
      remediationMarkdown: batchPlan.remediationMarkdown,
    };
  }
}
