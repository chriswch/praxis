import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Deps, StageContext } from "./stage.js";
import { runStage } from "./stage.js";
import { formatRunId } from "./run-id.js";
import { writeArtifact, writeIntent } from "./artifacts.js";
import {
  buildInitialState,
  writeState,
  type State,
  type StageState,
} from "./state.js";
import { runPreflight, appendPraxisToGitignore } from "./preflight.js";
import { defaultWorkflow } from "../config/defaults.js";
import type { PraxisConfig, StageConfig } from "../config/schema.js";
import { LineReporter } from "../ui/line-reporter.js";
import type { Reporter } from "../ui/reporter.js";

export type RunWorkflowContext = {
  intent: string;
  cwd: string;
  allowDirty?: boolean;
  /** Override the default 3-stage workflow (tests). */
  config?: PraxisConfig;
  /** Override the default LineReporter (tests). */
  reporter?: Reporter;
};

export type RunWorkflowSuccess = {
  ok: true;
  runId: string;
  runDir: string;
  /** True when the run stopped on a `pauseAfter: true` stage. */
  paused: boolean;
  /** When `paused`, the stage id we paused after. */
  pausedStageId?: string;
  /** When `paused`, the absolute artifact path written for the pausing stage. */
  artifactPath?: string;
};

export type RunWorkflowFailure = {
  ok: false;
  reason: string;
  remediation?: string;
  runId?: string;
  runDir?: string;
  failedStageId?: string;
};

export type RunWorkflowResult = RunWorkflowSuccess | RunWorkflowFailure;

/**
 * Bootstrap and execute a Praxis run end-to-end through the configured stage
 * loop. Pre-flight failures leave no orphan run-dir on disk (AC-12).
 */
export async function runWorkflow(
  ctx: RunWorkflowContext,
  deps: Deps,
): Promise<RunWorkflowResult> {
  const config = ctx.config ?? defaultWorkflow;
  const reporter = ctx.reporter ?? new LineReporter();

  const preflight = runPreflight(ctx.cwd, {
    allowDirty: ctx.allowDirty ?? false,
  });
  if (!preflight.ok) {
    return {
      ok: false,
      reason: preflight.reason,
      remediation: preflight.remediation,
    };
  }

  appendPraxisToGitignore(ctx.cwd);

  const startedAt = deps.clock();
  const runId = formatRunId(startedAt, deps.rng(2));
  const runDir = join(ctx.cwd, ".praxis", "runs", runId);
  mkdirSync(runDir, { recursive: true });

  writeIntent(runDir, ctx.intent);

  const stageIds = config.workflow.map((s) => s.id);
  const state: State = buildInitialState({
    runId,
    intent: ctx.intent,
    startedAt: toIsoSeconds(startedAt),
    stageIds,
    currentStage: stageIds[0],
  });
  writeState(runDir, state);

  return executeStages(state, config, ctx, deps, reporter, runDir, runId);
}

async function executeStages(
  state: State,
  config: PraxisConfig,
  ctx: RunWorkflowContext,
  deps: Deps,
  reporter: Reporter,
  runDir: string,
  runId: string,
): Promise<RunWorkflowResult> {
  const artifactPaths: Record<string, string> = {};
  const abort = new AbortController();

  for (let i = 0; i < config.workflow.length; i++) {
    const stage = config.workflow[i];
    state.currentStage = stage.id;
    state.stages[stage.id] = { status: "running" };
    writeState(runDir, state);
    reporter.stageStart(stage, i, config.workflow.length);

    const stageCtx: StageContext = {
      intent: ctx.intent,
      runDir,
      runId,
      reporter,
      signal: abort.signal,
      artifactPaths: { ...artifactPaths },
    };

    const result = await runStage(stage, stageCtx, {
      createQueryFn: deps.createQueryFn,
    });

    // Always write whatever the agent emitted — even on validator failure
    // (product.md §5.2 "partial output is still written").
    const artifactPath = writeArtifact(
      runDir,
      stage.outputArtifact,
      result.finalText,
    );
    artifactPaths[stage.id] = artifactPath;

    const endedAt = toIsoSeconds(deps.clock());
    const failed = result.stopReason === "validator_failed";
    const stageState: StageState = {
      status: failed ? "failed" : "completed",
      endedAt,
      stopReason: result.stopReason,
      sessionId: result.sessionId,
      tokens: result.tokens,
      usd: result.usd,
    };
    if (failed) {
      stageState.error = describeValidatorFailure(stage, result.finalText);
    }
    state.stages[stage.id] = stageState;
    state.cost.totalTokens += result.tokens.input + result.tokens.output;
    state.cost.totalUsd += result.usd;
    writeState(runDir, state);

    reporter.stageEnd(stage, {
      ok: !failed,
      artifactPath,
      sessionId: result.sessionId,
      error: failed ? stageState.error : undefined,
    });

    if (failed) {
      return {
        ok: false,
        reason: stageState.error ?? "stage failed",
        runId,
        runDir,
        failedStageId: stage.id,
      };
    }

    if (stage.pauseAfter) {
      const nextStage = config.workflow[i + 1];
      if (nextStage) {
        state.currentStage = nextStage.id;
        writeState(runDir, state);
      }
      reporter.paused(runId, stage.id, artifactPath);
      // Pause hint to stdout — surfaces independently of the Reporter so the
      // CLI shell can print the canonical hint even with a no-op reporter.
      process.stdout.write(
        `praxis: paused after ${stage.id}. Review ${artifactPath} then run: praxis advance ${runId}\n`,
      );
      return {
        ok: true,
        runId,
        runDir,
        paused: true,
        pausedStageId: stage.id,
        artifactPath,
      };
    }
  }

  return {
    ok: true,
    runId,
    runDir,
    paused: false,
  };
}

/** Re-run the stage's validator against the partial text to surface a reason. */
function describeValidatorFailure(stage: StageConfig, text: string): string {
  if (!stage.validate) return "stage failed";
  const v = stage.validate(text);
  if (!v.ok) return v.reason;
  return "stage failed";
}

/** ISO-8601 UTC string truncated to whole seconds, e.g. `2026-04-25T14:30:12Z`. */
function toIsoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
