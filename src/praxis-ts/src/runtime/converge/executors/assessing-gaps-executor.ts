import { BlockedStateError } from "../../../contracts/errors.js";
import type {
  ConvergeStageResultRecord,
  GapAssessmentResult,
} from "../../../contracts/model.js";
import {
  validateConvergeStageResult,
  validateGapAssessmentResult,
} from "../../../contracts/validators.js";
import type {
  ConvergeStageExecutor,
  ConvergeStageExecutorContext,
  ConvergeStageExecutorOutput,
} from "../stage-executor.js";
import {
  absolutePath,
  buildAdapterPrompt,
  readJsonFile,
  runAdapterSubprocess,
} from "./adapter-subprocess.js";

// Dispatch assessing-gaps to the active adapter. The adapter reads
// target-spec.md, explores the repo, and writes gap.md + gap.json. This
// executor validates and parses those artifacts. No fallback heuristic —
// agent failure fails the pass.
export class AgentAssessingGapsExecutor implements ConvergeStageExecutor {
  readonly stage = "assessing-gaps" as const;

  async execute(context: ConvergeStageExecutorContext): Promise<ConvergeStageExecutorOutput> {
    if (!context.reviewId) {
      throw new BlockedStateError("Cannot assess gaps without a review id.");
    }

    const prompt = buildAdapterPrompt(context.dispatch, context.campaign.adapter, {
      campaign_id: context.campaign.campaign_id,
      profile: context.campaign.profile,
      pass_number: context.passNumber,
      review_id: context.reviewId,
      severity_threshold: context.campaign.severity_threshold,
      scope: context.campaign.objective.scope,
      objective_path: context.campaign.objective.normalized_path,
      target_spec_path: ".praxis/target-spec.md",
    });

    const result = await runAdapterSubprocess({
      adapter: context.campaign.adapter,
      prompt,
      repoRoot: context.repoRoot,
    });

    if (result.exitCode !== 0) {
      throw new BlockedStateError(
        `Assessing-gaps adapter (${context.campaign.adapter}) exited ${String(result.exitCode)}: ${result.stderr.trim() || "no stderr"}.`,
      );
    }

    const gapJsonPath = absolutePath(context.repoRoot, ".praxis/gap.json");
    const stageResultPath = absolutePath(context.repoRoot, ".praxis/results/assessing-gaps.json");

    let gap: GapAssessmentResult;
    try {
      gap = await readJsonFile<GapAssessmentResult>(gapJsonPath);
      validateGapAssessmentResult(gap);
    } catch (error) {
      throw new BlockedStateError(
        `Assessing-gaps adapter produced invalid or missing .praxis/gap.json: ${stringifyError(error)}`,
      );
    }

    // Override review_id so the loop stays authoritative even if the agent set it.
    if (gap.review_id !== context.reviewId) {
      gap.review_id = context.reviewId;
    }

    let stageResult: ConvergeStageResultRecord;
    try {
      stageResult = await readJsonFile<ConvergeStageResultRecord>(stageResultPath);
      validateConvergeStageResult(stageResult);
      if (stageResult.stage !== "assessing-gaps") {
        throw new Error(`Expected stage assessing-gaps, received ${stageResult.stage}.`);
      }
    } catch (error) {
      // Synthesise stage result from the gap payload when the agent omits it.
      const { buildConvergeStageResult } = await import("../stage-runtime.js");
      stageResult = buildConvergeStageResult({
        stage: "assessing-gaps",
        profile: context.campaign.profile,
        reviewId: context.reviewId,
        outcomeCode: gap.findings.length === 0 ? "no_gaps" : "findings_recorded",
        data: {
          findings_count: gap.findings.length,
          synthesized: true,
          synthesis_reason: stringifyError(error),
        },
      });
    }

    return {
      stageResult,
      artifactsWritten: [
        ".praxis/gap.md",
        ".praxis/gap.json",
        ".praxis/results/assessing-gaps.json",
      ],
      gap,
    };
  }
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
