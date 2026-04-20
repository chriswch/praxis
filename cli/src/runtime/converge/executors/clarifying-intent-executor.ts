import { readFile } from "node:fs/promises";
import { BlockedStateError } from "../../../contracts/errors.js";
import type {
  ConvergeStageResultRecord,
  GapAssessmentResult,
} from "../../../contracts/model.js";
import { validateConvergeStageResult } from "../../../contracts/validators.js";
import { buildConvergeStageResult } from "../stage-runtime.js";
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
import { stageDispatchInput } from "../../dispatch/index.js";

interface ClarificationDecisionPayload {
  approval?: {
    status?: string;
    reasons?: string[];
  };
  clarification_issues?: string[];
  decisions?: {
    acceptance_criteria?: {
      items?: string[];
    };
  };
}

// Dispatch clarifying-intent to the active adapter. The adapter reads
// .praxis/objective.md, explores the repo, and writes target-spec.md +
// clarification.json. The executor validates and parses those artifacts.
export class AgentClarifyingIntentExecutor implements ConvergeStageExecutor {
  readonly stage = "clarifying-intent" as const;

  async execute(context: ConvergeStageExecutorContext): Promise<ConvergeStageExecutorOutput> {
    const envelope = {
      campaign_id: context.campaign.campaign_id,
      profile: context.campaign.profile,
      pass_number: context.passNumber,
      review_id: context.reviewId,
      objective_scope: context.campaign.objective.scope,
      objective_path: context.campaign.objective.normalized_path,
    };
    const inputEnvelopePath = await stageDispatchInput(
      context.repoRoot,
      "clarifying-intent",
      envelope,
    );
    const prompt = buildAdapterPrompt(
      context.dispatch,
      context.campaign.adapter,
      envelope,
      { inputEnvelopePath },
    );

    const result = await runAdapterSubprocess({
      adapter: context.campaign.adapter,
      prompt,
      repoRoot: context.repoRoot,
    });

    if (result.exitCode !== 0) {
      throw new BlockedStateError(
        `Clarifying-intent adapter (${context.campaign.adapter}) exited ${result.exitCode.toString()}: ${result.stderr.trim() || "no stderr"}.`,
      );
    }

    const targetSpecPath = absolutePath(context.repoRoot, ".praxis/target-spec.md");
    const clarificationJsonPath = absolutePath(context.repoRoot, ".praxis/clarification.json");
    const stageResultPath = absolutePath(
      context.repoRoot,
      ".praxis/results/clarifying-intent.json",
    );

    let targetSpecText: string;
    try {
      targetSpecText = await readFile(targetSpecPath, "utf8");
    } catch (error) {
      throw new BlockedStateError(
        `Clarifying-intent adapter did not produce .praxis/target-spec.md: ${stringifyError(error)}`,
      );
    }

    let clarificationPayload: ClarificationDecisionPayload;
    try {
      clarificationPayload = await readJsonFile<ClarificationDecisionPayload>(clarificationJsonPath);
    } catch (error) {
      throw new BlockedStateError(
        `Clarifying-intent adapter did not produce .praxis/clarification.json: ${stringifyError(error)}`,
      );
    }

    let stageResult: ConvergeStageResultRecord;
    try {
      stageResult = await readJsonFile<ConvergeStageResultRecord>(stageResultPath);
      validateConvergeStageResult(stageResult);
      if (stageResult.stage !== "clarifying-intent") {
        throw new Error(
          `Expected stage clarifying-intent, received ${stageResult.stage}.`,
        );
      }
    } catch (error) {
      // Fall back to synthesising the stage result from the clarification
      // payload when the agent forgot the results file.
      const issues = Array.isArray(clarificationPayload.clarification_issues)
        ? clarificationPayload.clarification_issues
        : [];
      const outcomeCode = issues.length > 0 ? "clarification_needed" : "target_spec_ready";
      stageResult = buildConvergeStageResult({
        stage: "clarifying-intent",
        profile: context.campaign.profile,
        outcomeCode,
        data: {
          clarification_issues: issues,
          acceptance_criteria_count:
            clarificationPayload.decisions?.acceptance_criteria?.items?.length ?? 0,
          clarification_approval_status:
            clarificationPayload.approval?.status ?? "needs_operator",
          synthesized: true,
          synthesis_reason: stringifyError(error),
        },
      });
    }

    const issues = extractIssues(clarificationPayload, stageResult);
    const needsClarification = issues.length > 0 || stageResult.route.kind === "ask_user";

    return {
      stageResult,
      artifactsWritten: [
        ".praxis/target-spec.md",
        ".praxis/clarification.json",
        ".praxis/results/clarifying-intent.json",
      ],
      targetSpecText,
      needsClarification,
      clarificationIssues: issues,
    };
  }
}

function extractIssues(
  payload: ClarificationDecisionPayload,
  stageResult: ConvergeStageResultRecord,
): string[] {
  if (Array.isArray(payload.clarification_issues) && payload.clarification_issues.length > 0) {
    return payload.clarification_issues;
  }
  const dataIssues = stageResult.data.clarification_issues;
  if (Array.isArray(dataIssues)) {
    return dataIssues.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Re-export GapAssessmentResult so the file does not depend on unused imports.
export type { GapAssessmentResult };
