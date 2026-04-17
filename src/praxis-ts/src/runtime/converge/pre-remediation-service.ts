import { nowIsoUtc } from "../common/time.js";
import type {
  CampaignRecord,
  ConvergeStageResultRecord,
  GapAssessmentResult
} from "../../contracts/model.js";
import type { PraxisStateRepository } from "../state/repository.js";
import { assessGaps } from "./assessment.js";
import { formatTargetSpecMarkdown, type TargetSpecDraft } from "./campaign-support.js";
import { buildConvergeStageResult } from "./stage-runtime.js";

export class ConvergePreRemediationService {
  constructor(private readonly repo: PraxisStateRepository) {}

  async runClarifyingIntent(
    campaign: CampaignRecord,
    objectiveText: string
  ): Promise<{
    targetSpecText: string;
    draft: TargetSpecDraft;
    stageResult: ConvergeStageResultRecord & { stage: "clarifying-intent" };
  }> {
    const draft = formatTargetSpecMarkdown(campaign, objectiveText);
    const outcomeCode = draft.needsClarification ? "clarification_needed" : "target_spec_ready";
    const stageResult = buildConvergeStageResult({
      stage: "clarifying-intent",
      profile: campaign.profile,
      outcomeCode,
      data: {
        clarification_issues: draft.clarificationIssues,
        acceptance_criteria_count: draft.acceptanceCriteriaCount,
        clarification_approval_status: draft.clarificationRecord.approval.status
      }
    });

    await this.repo.saveTargetSpecArtifacts({
      targetSpecMarkdown: draft.markdown,
      clarificationRecord: draft.clarificationRecord,
      stageResult
    });

    return {
      targetSpecText: draft.markdown,
      draft,
      stageResult
    };
  }

  async runAssessingGaps(
    campaign: CampaignRecord,
    targetSpecText: string,
    reviewId: string
  ): Promise<{
    stageResult: ConvergeStageResultRecord & { stage: "assessing-gaps" };
    gap: GapAssessmentResult;
    findingsCount: number;
  }> {
    const generatedAt = nowIsoUtc();
    const { gap, gapMarkdown } = await assessGaps({
      repoRoot: this.repo.paths.root,
      profile: campaign.profile,
      targetSpecPath: ".praxis/target-spec.md",
      targetSpecText,
      scope: campaign.objective.scope,
      reviewId,
      generatedAt
    });

    const stageResult = buildConvergeStageResult({
      stage: "assessing-gaps",
      profile: campaign.profile,
      reviewId,
      outcomeCode: gap.findings.length === 0 ? "no_gaps" : "findings_recorded",
      data: {
        findings_count: gap.findings.length
      }
    });
    await this.repo.saveGapArtifacts({ gapMarkdown, gap, stageResult });

    return {
      stageResult,
      gap,
      findingsCount: gap.findings.length
    };
  }
}
