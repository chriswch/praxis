import { readFile } from "node:fs/promises";
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
import { stringifyError } from "../campaign-support.js";
import { canonicalizeGapFingerprints } from "../gap-fingerprints.js";
import { buildConvergeStageResult } from "../stage-runtime.js";

// Inline JSON shape for gap.json AND results/assessing-gaps.json, so the agent
// receives both schemas in the prompt instead of reading a SKILL.md file.
// Kept narrow — the full contract lives in src/contracts/model.ts; this is what
// the worker needs to see at dispatch time.
const GAP_OUTPUT_SHAPE = `// .praxis/gap.json
{
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
}

// .praxis/results/assessing-gaps.json
{
  "version": 1,
  "stage": "assessing-gaps",
  "status": "completed | blocked | failed | skipped",
  "profile": "<campaign profile>",
  "review_id": "<review id supplied in the input envelope>",
  "route": {
    "kind": "proceed | done"
  },
  "data": {
    "outcome_code": "findings_recorded | no_gaps",
    "next_stage": "planning-remediation | null",
    "findings_count": 0
  }
}`;

const ASSESSING_GAPS_INSTRUCTIONS: readonly string[] = [
  "You ARE the reviewer for this pass. The `review_id` in the input envelope (e.g. R-001) names the review your gap.json/gap.md will produce — it is not a pointer to a pre-existing artifact. Do not flag the absence of `.praxis/reviews/<review_id>/` as a gap; that directory is populated when this stage completes.",
  "Read .praxis/target-spec.md as the authoritative target; also consult .praxis/objective.md and .praxis/clarification.json for intent.",
  "Bound the repo scan to the Scope listed in the input envelope. Skip .git, .praxis, node_modules, dist, build, coverage.",
  "For each Acceptance Criterion classify a finding as missing, partial, or wrong with severity (critical/high/medium/low) and a 0–1 confidence.",
  "Collect evidence as `path:line — snippet` (≤160 chars per snippet) for every finding. Leave `fingerprint` as an empty string; the host computes it.",
  "Write .praxis/gap.md (human-readable, severity-ordered), .praxis/gap.json (the shape below), and .praxis/results/assessing-gaps.json.",
  "For the stage result: route.kind=proceed with data.outcome_code=findings_recorded and data.next_stage=planning-remediation when findings_count>0; route.kind=done with data.outcome_code=no_gaps and data.next_stage=null when findings_count===0.",
  "Do not modify implementation code. Do not ask the user — if the spec is ambiguous, emit a finding describing the ambiguity and keep going.",
];

// Dispatch assessing-gaps to the active adapter. The adapter reads
// target-spec.md, explores the repo, and writes gap.md + gap.json. This
// executor validates the agent payloads and then routes them through
// saveGapArtifacts so .praxis/results/assessing-gaps.json and
// .praxis/reviews/<review_id>/ stay aligned with the in-memory record. No
// fallback heuristic — agent failure fails the pass.
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
    const gapMdPath = absolutePath(context.repoRoot, ".praxis/gap.md");
    const stageResultPath = absolutePath(context.repoRoot, ".praxis/results/assessing-gaps.json");

    let gap: GapAssessmentResult;
    try {
      gap = await readJsonFile<GapAssessmentResult>(gapJsonPath);
      // Backfill fingerprints before validation — the agent is instructed to
      // leave them empty, and validateGapAssessmentResult rejects empty strings.
      canonicalizeGapFingerprints(gap);
      validateGapAssessmentResult(gap);
    } catch (error) {
      throw new BlockedStateError(
        `Assessing-gaps adapter produced invalid or missing .praxis/gap.json: ${stringifyError(error)}`,
      );
    }

    let gapMarkdown: string;
    try {
      gapMarkdown = await readFile(gapMdPath, "utf8");
    } catch (error) {
      throw new BlockedStateError(
        `Assessing-gaps adapter produced no .praxis/gap.md: ${stringifyError(error)}`,
      );
    }

    // Override review_id so the loop stays authoritative even if the agent set
    // it. saveGapArtifacts derives the .praxis/reviews/<review_id>/ mirror path
    // from this field, so it must match the campaign-owned reviewId before the
    // write.
    if (gap.review_id !== context.reviewId) {
      gap.review_id = context.reviewId;
    }

    let stageResult: ConvergeStageResultRecord & { stage: "assessing-gaps" };
    try {
      const parsed = await readJsonFile<ConvergeStageResultRecord>(stageResultPath);
      validateConvergeStageResult(parsed);
      if (parsed.stage !== "assessing-gaps") {
        throw new Error(`Expected stage assessing-gaps, received ${parsed.stage}.`);
      }
      stageResult = parsed as ConvergeStageResultRecord & { stage: "assessing-gaps" };
      // Mirror the gap.review_id override above. The campaign owns the review
      // id; if the agent set a different value, force it back to the
      // campaign-owned id so the on-disk gap and stage-result records cannot
      // disagree on which review they belong to.
      if (stageResult.review_id !== context.reviewId) {
        stageResult.review_id = context.reviewId;
      }
    } catch (error) {
      // Synthesise stage result from the gap payload when the agent omits or
      // corrupts it. saveGapArtifacts persists this synthesised record below
      // so the on-disk source of truth and the in-memory record agree.
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

    // Single durable-write contract. saveGapArtifacts canonicalises
    // fingerprints, validates gap + stageResult, mirrors them to
    // .praxis/reviews/<review_id>/ FIRST, and then writes the root .praxis
    // artifacts — same contract the fixture executor honours. Returns every
    // path it wrote so the stage-history audit trail mirrors disk.
    const artifactsWritten = await context.repo.saveGapArtifacts({
      gapMarkdown,
      gap,
      stageResult,
    });

    return {
      stageResult,
      artifactsWritten,
      gap,
    };
  }
}

// The agent is instructed to leave `fingerprint` empty because the host
// owns the hashing scheme (`buildFindingFingerprint`). The generic validator
// rejects empty strings, so backfill before validation. Re-exported here so
// unit tests can exercise the canonicalisation in isolation.
export { canonicalizeGapFingerprints as backfillGapFingerprints } from "../gap-fingerprints.js";
