import { mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { Deps, StageContext, StageResult } from "./stage.js";
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
import type { Reporter, RunStatus, RunSummary } from "../ui/reporter.js";

export type RunWorkflowContext = {
  intent: string;
  cwd: string;
  allowDirty?: boolean;
  /**
   * Disable all pause gates (product.md §4 `--no-pause`). When set,
   * `pauseAfter: true` stages still run + commit their artifact but the
   * runner advances to the next stage instead of returning paused.
   */
  noPause?: boolean;
  /** Override the default 3-stage workflow (tests). */
  config?: PraxisConfig;
  /**
   * Parent abort signal — when fired, the in-flight stage is aborted as
   * `sigint` per spec §11. The CLI wires this to a SIGINT listener; tests
   * inject directly to exercise cancellation.
   */
  signal?: AbortSignal;
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
  /** "cancelled" when SIGINT aborted the run; "failed" otherwise (spec §11). */
  status?: "failed" | "cancelled";
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
  const reporter = deps.reporter;

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

  const intentPath = writeIntent(runDir, ctx.intent);

  const stageIds = config.workflow.map((s) => s.id);
  const state: State = buildInitialState({
    runId,
    intent: ctx.intent,
    startedAt: toIsoSeconds(startedAt),
    stageIds,
    currentStage: stageIds[0],
  });
  writeState(runDir, state);

  // AC-3: synthetic stage-0 line `[0/N intent] captured → 00-intent.txt`.
  // Optional on the Reporter interface (no StageConfig for the agentless
  // intent capture); Reporters that don't implement it simply skip it.
  reporter.stage0?.(config.workflow.length, basename(intentPath));

  return executeStages(state, config, ctx, deps, reporter, runDir, runId);
}

type StepOutcome =
  | { kind: "continue" }
  | { kind: "paused"; stageId: string; artifactPath: string }
  | {
      kind: "failed";
      stageId: string;
      reason: string;
      status: "failed" | "cancelled";
    };

async function executeStages(
  state: State,
  config: PraxisConfig,
  ctx: RunWorkflowContext,
  deps: Deps,
  reporter: Reporter,
  runDir: string,
  runId: string,
): Promise<RunWorkflowResult> {
  for (let i = 0; i < config.workflow.length; i++) {
    const outcome = await runOneStage(
      config.workflow[i],
      i,
      config,
      state,
      ctx,
      deps,
      reporter,
      runDir,
      runId,
    );
    if (outcome.kind === "paused") {
      reporter.paused(runId, outcome.stageId, outcome.artifactPath);
      reporter.runDone(runId, summarize(state, "paused"));
      return {
        ok: true,
        runId,
        runDir,
        paused: true,
        pausedStageId: outcome.stageId,
        artifactPath: outcome.artifactPath,
      };
    }
    if (outcome.kind === "failed") {
      reporter.runDone(runId, summarize(state, outcome.status));
      return {
        ok: false,
        reason: outcome.reason,
        runId,
        runDir,
        failedStageId: outcome.stageId,
        status: outcome.status,
      };
    }
  }

  reporter.runDone(runId, summarize(state, "completed"));
  return { ok: true, runId, runDir, paused: false };
}

async function runOneStage(
  stage: StageConfig,
  index: number,
  config: PraxisConfig,
  state: State,
  ctx: RunWorkflowContext,
  deps: Deps,
  reporter: Reporter,
  runDir: string,
  runId: string,
): Promise<StepOutcome> {
  state.currentStage = stage.id;
  state.stages[stage.id] = { status: "running" };
  writeState(runDir, state);
  // 1-based index per §8 (`[1/3 ...]`).
  reporter.stageStart(stage, index + 1, config.workflow.length);

  const stageCtx: StageContext = {
    intent: ctx.intent,
    runDir,
    runId,
    reporter,
    signal: ctx.signal ?? new AbortController().signal,
    artifactPaths: collectArtifactPaths(state, config, runDir, stage.id),
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

  const { stageStatus, errorMessage } = classifyOutcome(result);
  const failed = stageStatus !== "completed";

  const stageState: StageState = {
    status: stageStatus,
    endedAt: toIsoSeconds(deps.clock()),
    stopReason: result.stopReason,
    sessionId: result.sessionId,
    tokens: result.tokens,
    usd: result.usd,
  };
  if (errorMessage) stageState.error = errorMessage;
  state.stages[stage.id] = stageState;
  state.cost.totalTokens += result.tokens.input + result.tokens.output;
  state.cost.totalUsd += result.usd;
  writeState(runDir, state);

  reporter.stageEnd(stage, {
    ok: !failed,
    artifactPath,
    sessionId: result.sessionId,
    error: errorMessage,
  });

  if (failed) {
    return {
      kind: "failed",
      stageId: stage.id,
      reason: errorMessage ?? "stage failed",
      status: stageStatus === "cancelled" ? "cancelled" : "failed",
    };
  }

  // AC-13: --no-pause overrides every `pauseAfter` so autopilot runs end-
  // to-end. The stage's artifact + state still land identically; we just
  // skip the paused short-circuit.
  if (stage.pauseAfter && !ctx.noPause) {
    const nextStage = config.workflow[index + 1];
    if (nextStage) {
      state.currentStage = nextStage.id;
      writeState(runDir, state);
    }
    return { kind: "paused", stageId: stage.id, artifactPath };
  }

  return { kind: "continue" };
}

/**
 * Translate the SDK / harness signals on `StageResult` into the §9 stage
 * status + a human-readable error message (when applicable).
 *
 * Per spec §11:
 *   - SIGINT (`cancelReason === "sigint"`) → `cancelled`
 *   - timeout (`cancelReason === "timeout"`) → `failed`
 *   - validator failure (`stopReason === "validator_failed"`) → `failed`
 *   - otherwise → `completed`
 *
 * Validator failure messages are taken straight off `result.validatorReason`
 * — runStage already ran the validator and captured the verdict, so the
 * runner does not re-run it here.
 */
function classifyOutcome(
  result: StageResult,
): { stageStatus: StageState["status"]; errorMessage?: string } {
  if (result.cancelReason === "sigint") {
    return { stageStatus: "cancelled", errorMessage: "cancelled by user (SIGINT)" };
  }
  if (result.cancelReason === "timeout") {
    return { stageStatus: "failed", errorMessage: "stage timed out" };
  }
  if (result.stopReason === "validator_failed") {
    return {
      stageStatus: "failed",
      errorMessage: result.validatorReason ?? "stage failed",
    };
  }
  return { stageStatus: "completed" };
}

/**
 * Resolve artifact paths for stages already completed in this run. Derived
 * straight from `state.stages[id].status === "completed"` plus the on-disk
 * filename so the runner doesn't keep a parallel cache.
 */
function collectArtifactPaths(
  state: State,
  config: PraxisConfig,
  runDir: string,
  currentStageId: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of config.workflow) {
    if (s.id === currentStageId) break;
    if (state.stages[s.id]?.status === "completed") {
      out[s.id] = join(runDir, s.outputArtifact);
    }
  }
  return out;
}

/**
 * Build the `RunSummary` from the current `state.json` shape so `runDone`
 * has the totals + per-stage rows to print. Unstarted stages are skipped.
 *
 * `status` is the run's terminal outcome — passed straight through to the
 * formatter so the headline reads "done" / "paused" / "failed" / "cancelled"
 * (H-1).
 */
function summarize(state: State, status: RunStatus): RunSummary {
  const perStage: RunSummary["perStage"] = {};
  for (const [id, s] of Object.entries(state.stages)) {
    if (!s.tokens) continue;
    perStage[id] = {
      tokens: s.tokens.input + s.tokens.output,
      usd: s.usd ?? 0,
      sessionId: s.sessionId ?? "",
    };
  }
  return {
    // state.cost.totalTokens excludes cache tokens by design (S-002, M-2);
    // input + output only, matching what we accumulate per stage.
    cost: { ...state.cost },
    perStage,
    status,
  };
}

/** ISO-8601 UTC string truncated to whole seconds, e.g. `2026-04-25T14:30:12Z`. */
function toIsoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
