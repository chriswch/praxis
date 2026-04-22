import { readFile } from "node:fs/promises";
import { BlockedStateError } from "../../../contracts/errors.js";
import type { ConvergeStageResultRecord } from "../../../contracts/model.js";
import {
  validateClarificationDecision,
  validateConvergeStageResult,
  type ClarificationDecisionPayload,
} from "../../../contracts/validators.js";
import { buildConvergeStageResult } from "../stage-runtime.js";
import { stringifyError } from "../campaign-support.js";
import type {
  ConvergeStageExecutor,
  ConvergeStageExecutorContext,
  ConvergeStageExecutorOutput,
} from "../stage-executor.js";
import {
  absolutePath,
  readJsonFile,
  runAdapterSubprocess,
} from "./adapter-subprocess.js";
import { buildDispatchPrompt, stageDispatchInput } from "../../dispatch/index.js";

// Inline shapes for the two JSON artifacts the agent is expected to write.
// Keeping the schemas here (not in a SKILL.md) means the worker sees the
// exact contract at dispatch time — including the allowed status enum that
// previously drifted (e.g. agents writing `status: "ok"`).
export const CLARIFICATION_OUTPUT_SHAPE = `// .praxis/clarification.json
{
  "approval": {
    "status": "approved | needs_operator",
    "reasons": ["..."]
  },
  "clarification_issues": ["..."],
  "decisions": {
    "acceptance_criteria": { "items": ["..."] }
  }
}

// .praxis/results/clarifying-intent.json
{
  "version": 1,
  "stage": "clarifying-intent",
  "status": "completed | blocked | failed | skipped",
  "profile": "<campaign profile>",
  "route": {
    "kind": "proceed | ask_user | done | rework | escalate"
  },
  "data": {
    "outcome_code": "target_spec_ready | clarification_needed",
    "next_stage": "assessing-gaps | null",
    "clarification_issues": ["..."],
    "acceptance_criteria_count": 0,
    "clarification_approval_status": "approved | needs_operator"
  }
}`;

export const CLARIFYING_INTENT_INSTRUCTIONS: readonly string[] = [
  "Write .praxis/target-spec.md as the authoritative, human-readable target.",
  "Write .praxis/clarification.json with the exact keys shown below; approval.status must be one of: approved, needs_operator.",
  "Write .praxis/results/clarifying-intent.json; status must be one of: completed, blocked, failed, skipped (not `ok`).",
  "Use outcome_code=target_spec_ready with route.kind=proceed and data.next_stage=assessing-gaps when the spec is ready.",
  "Use outcome_code=clarification_needed with route.kind=ask_user when blocking questions remain.",
];

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

    const contract = context.dispatch.contract;
    const prompt = buildDispatchPrompt({
      stage: "clarifying-intent",
      workflow: context.dispatch.workflow,
      stageGoal: contract.stage_goal,
      stageInstructions: [...contract.stage_instructions, ...CLARIFYING_INTENT_INSTRUCTIONS],
      inputs: {
        requiredArtifacts: context.dispatch.inputs.required_artifacts,
        inputEnvelopePath,
      },
      outputs: {
        expectedArtifacts: contract.expected_output_artifacts,
        primaryOutput: contract.primary_output,
        outputEnvelopePath: null,
      },
      extraContext: envelope,
      expectedOutputShape: CLARIFICATION_OUTPUT_SHAPE,
    });

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
      validateClarificationDecision(clarificationPayload);
    } catch (error) {
      throw new BlockedStateError(
        `Clarifying-intent adapter produced invalid or missing .praxis/clarification.json: ${stringifyError(error)}`,
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
      // Mirror FixtureClarifyingIntentExecutor's contract so the consumer in
      // ConvergePreRemediationService never has to fall back to re-reading
      // .praxis/clarification.json from disk for the in-process record.
      clarificationRecord: clarificationPayload as unknown as Record<string, unknown>,
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

