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
  readJsonFile,
  runAdapterSubprocess,
} from "./adapter-subprocess.js";
import { buildDispatchPrompt, stageDispatchInput } from "../../dispatch/index.js";

// Inline JSON shape for gap.json, so the agent receives the schema in the
// prompt instead of reading a SKILL.md file. Keep this narrow — the full
// contract lives in src/contracts/model.ts; this is what the worker needs to
// see at dispatch time.
const GAP_OUTPUT_SHAPE = `{
  "version": 1,
  "profile": "<campaign profile>",
  "review_id": "<review id supplied in the input envelope>",
  "target_spec_path": ".praxis/target-spec.md",
  "findings": [
    {
      "finding_id": "G-001",
      "fingerprint": "",
      "title": "...",
      "kind": "missing | partial | wrong",
      "severity": "critical | high | medium | low",
      "category": "<short tag>",
      "summary": "...",
      "expected_behavior": "...",
      "current_behavior": "...",
      "evidence": ["path:line — snippet"],
      "objective_refs": ["R-xxx:acceptance-criterion"],
      "affected_paths": ["src/..."],
      "recommended_direction": "...",
      "recommended_action": "...",
      "confidence": 0.0
    }
  ],
  "generated_at": "<ISO8601 UTC>"
}`;

const ASSESSING_GAPS_INSTRUCTIONS: readonly string[] = [
  "Read .praxis/target-spec.md as the authoritative target; also consult .praxis/objective.md and .praxis/clarification.json for intent.",
  "Bound the repo scan to the Scope listed in the input envelope. Skip .git, .praxis, node_modules, dist, build, coverage.",
  "For each Acceptance Criterion classify a finding as missing, partial, or wrong with severity (critical/high/medium/low) and a 0–1 confidence.",
  "Collect evidence as `path:line — snippet` (≤160 chars per snippet) for every finding. Leave `fingerprint` as an empty string; the host computes it.",
  "Write .praxis/gap.md (human-readable, severity-ordered), .praxis/gap.json (the shape below), and .praxis/results/assessing-gaps.json.",
  "For the stage result: route.kind=proceed with data.next_stage=planning-remediation when findings_count>0; route.kind=done when findings_count===0.",
  "Do not modify implementation code. Do not ask the user — if the spec is ambiguous, emit a finding describing the ambiguity and keep going.",
];

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

    const envelope = {
      campaign_id: context.campaign.campaign_id,
      profile: context.campaign.profile,
      pass_number: context.passNumber,
      review_id: context.reviewId,
      severity_threshold: context.campaign.severity_threshold,
      scope: context.campaign.objective.scope,
      objective_path: context.campaign.objective.normalized_path,
      target_spec_path: ".praxis/target-spec.md",
    };
    const inputEnvelopePath = await stageDispatchInput(
      context.repoRoot,
      "assessing-gaps",
      envelope,
    );

    const contract = context.dispatch.contract;
    const prompt = buildDispatchPrompt({
      stage: "assessing-gaps",
      workflow: context.dispatch.workflow,
      stageGoal: contract.stage_goal,
      stageInstructions: [...contract.stage_instructions, ...ASSESSING_GAPS_INSTRUCTIONS],
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
      expectedOutputShape: GAP_OUTPUT_SHAPE,
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
