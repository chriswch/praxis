import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { AUTO_COMMIT_ID, defaultWorkflow } from "../config/defaults.js";
import type { PraxisConfig, StageConfig } from "../config/schema.js";
import type { Reporter, RunStatus, RunSummary } from "../ui/reporter.js";
import { writeArtifact, writeIntent } from "./artifacts.js";
import { appendPraxisToGitignore, runPreflight } from "./preflight.js";
import { formatRunId } from "./run-id.js";
import type { Deps, StageContext, StageResult } from "./stage.js";
import { runStage } from "./stage.js";
import {
  buildInitialState,
  readState,
  type StageState,
  type State,
  writeState,
} from "./state.js";

export type RunWorkflowContext = {
  intent: string;
  cwd: string;
  allowDirty?: boolean;
  /**
   * Disable all pause gates (`--no-pause`). When set,
   * `pauseAfter: true` stages still run + commit their artifact but the
   * runner advances to the next stage instead of returning paused.
   */
  noPause?: boolean;
  /** Override the default 5-stage workflow (tests). */
  config?: PraxisConfig;
  /**
   * Parent abort signal — when fired, the in-flight stage is aborted as
   * `sigint`. The CLI wires this to a SIGINT listener; tests
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
  /** "cancelled" when SIGINT aborted the run; "failed" otherwise. */
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

  const loopCtx: LoopContext = {
    intent: ctx.intent,
    cwd: ctx.cwd,
    noPause: ctx.noPause,
    signal: ctx.signal,
  };
  return executeStages(
    state,
    config,
    loopCtx,
    deps,
    reporter,
    runDir,
    runId,
    0,
  );
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

/**
 * Internal loop context shared by `executeStages` / `runOneStage`. Both entry
 * points (`runWorkflow`, `advanceWorkflow`) resolve `intent` at their own
 * boundary so the per-stage code reads `ctx.intent` unconditionally — no
 * runtime shape check inside the loop.
 */
type LoopContext = {
  intent: string;
  cwd: string;
  noPause?: boolean;
  signal?: AbortSignal;
};

async function executeStages(
  state: State,
  config: PraxisConfig,
  ctx: LoopContext,
  deps: Deps,
  reporter: Reporter,
  runDir: string,
  runId: string,
  startIndex: number,
): Promise<RunWorkflowResult> {
  for (let i = startIndex; i < config.workflow.length; i++) {
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
  ctx: LoopContext,
  deps: Deps,
  reporter: Reporter,
  runDir: string,
  runId: string,
): Promise<StepOutcome> {
  state.currentStage = stage.id;
  state.stages[stage.id] = { status: "running" };
  writeState(runDir, state);
  // 1-based index (`[1/3 ...]`).
  reporter.stageStart(stage, index + 1, config.workflow.length);

  // S-006 AC-5: skip the auto-commit SDK call when the working tree is clean.
  // Implement may have made no edits, or recovered to baseline; either way,
  // there is nothing to commit and no message to draft. Synthesize a
  // completed stage with stopReason "skipped" — no sessionId/tokens/usd, no
  // 05-commit.txt, no deps.commit hand-off.
  if (stage.id === AUTO_COMMIT_ID && isWorkingTreeClean(ctx.cwd)) {
    const skipped: StageState = {
      status: "completed",
      endedAt: toIsoSeconds(deps.clock()),
      stopReason: "skipped",
    };
    state.stages[stage.id] = skipped;
    writeState(runDir, state);
    reporter.stageEnd(stage, { ok: true });
    return { kind: "continue" };
  }

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

  const { stageStatus, errorMessage } = classifyOutcome(result);
  const failed = stageStatus !== "completed";

  // AC-4/5: when a stage was cancelled by timeout or SIGINT, the SDK's own
  // stop_reason is meaningless — surface the harness's cancelReason as the
  // canonical persisted token. Validator-failed already wins because runStage
  // sets stopReason to "validator_failed" before returning, and the validator
  // path doesn't set cancelReason. Recovered is set in recoverFailedStage,
  // not here. One place owns the precedence.
  const persistedStopReason = result.cancelReason ?? result.stopReason;

  const stageState: StageState = {
    status: stageStatus,
    endedAt: toIsoSeconds(deps.clock()),
    stopReason: persistedStopReason,
    sessionId: result.sessionId,
    tokens: result.tokens,
    usd: result.usd,
  };
  if (errorMessage) stageState.error = errorMessage;
  state.cost.totalTokens += result.tokens.input + result.tokens.output;
  state.cost.totalUsd += result.usd;

  // M-2: compose the artifact's final content BEFORE the first write so each
  // terminal path performs at most one writeFileSync. The auto-commit stage
  // is special — its final 05-commit.txt is the SHA-prefixed form ONLY when
  // the commit lands; we therefore defer the write past `deps.commit()` and
  // pass through one of three branches:
  //
  //   - validator/timeout/cancel failed → write verbatim agent message (AC-6
  //     for partial output);
  //   - commit_failed → write verbatim agent message (so the user can inspect
  //     what the agent emitted), then failStage();
  //   - commit succeeded with sha → write `${sha}\n\n${message}\n`, stamp
  //     commitSha onto the stage, write state, emit stageEnd, return continue;
  //   - commit returned `skipped:true` → no artifact written (the agent's
  //     message is meaningless without a real commit) and the stage remains
  //     `completed`.
  //
  // Non-auto-commit stages always write their finalText verbatim (partial
  // output is still written even on validator failure).

  if (failed) {
    const artifactPath = writeArtifact(
      runDir,
      stage.outputArtifact,
      result.finalText,
    );
    return failStage(state, runDir, stage, stageState, reporter, {
      artifactPath,
      sessionId: result.sessionId,
      reason: errorMessage ?? "stage failed",
      status: stageStatus === "cancelled" ? "cancelled" : "failed",
    });
  }

  // S-006 AC-4/AC-6: hand the message (verbatim finalText) to the git seam.
  // On {ok:true, sha}, the SHA is prepended onto 05-commit.txt and stamped on
  // the stage state. On {ok:false}, the stage is flipped to failed/
  // commit_failed; 05-commit.txt keeps the agent message only (no SHA prefix).
  // Skip path (clean tree pre-stage) is handled at the top of this fn.
  let artifactPath: string;
  if (stage.id === AUTO_COMMIT_ID) {
    const commitOutcome = deps.commit(ctx.cwd, result.finalText);
    if (!commitOutcome.ok) {
      const verbatimPath = writeArtifact(
        runDir,
        stage.outputArtifact,
        result.finalText,
      );
      stageState.status = "failed";
      stageState.stopReason = "commit_failed";
      stageState.error = commitOutcome.reason;
      return failStage(state, runDir, stage, stageState, reporter, {
        artifactPath: verbatimPath,
        sessionId: result.sessionId,
        reason: commitOutcome.reason,
        status: "failed",
      });
    }
    if ("sha" in commitOutcome) {
      const sha = commitOutcome.sha;
      artifactPath = writeArtifact(
        runDir,
        stage.outputArtifact,
        `${sha}\n\n${result.finalText}\n`,
      );
      stageState.commitSha = sha;
    } else {
      // commitOutcome.skipped === true: commit() saw a clean tree mid-stage.
      // No SHA, no artifact — the agent's message is meaningless without a
      // real commit, and there is no path through which a downstream consumer
      // expects 05-commit.txt to exist in this state.
      artifactPath = join(runDir, stage.outputArtifact);
    }
    state.stages[stage.id] = stageState;
    writeState(runDir, state);
  } else {
    artifactPath = writeArtifact(
      runDir,
      stage.outputArtifact,
      result.finalText,
    );
    state.stages[stage.id] = stageState;
    writeState(runDir, state);
  }

  reporter.stageEnd(stage, {
    ok: true,
    artifactPath,
    sessionId: result.sessionId,
    error: errorMessage,
  });

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
 * M-3: shared exit shape for any stage that ends in failure (validator,
 * timeout, SIGINT, commit_failed). Owns the strict order — set state, persist
 * state.json, emit stageEnd, return — so the validator and commit_failed
 * branches can no longer drift apart on operation order.
 */
function failStage(
  state: State,
  runDir: string,
  stage: StageConfig,
  stageState: StageState,
  reporter: Reporter,
  fail: {
    artifactPath: string;
    sessionId?: string;
    reason: string;
    status: "failed" | "cancelled";
  },
): StepOutcome {
  state.stages[stage.id] = stageState;
  writeState(runDir, state);
  reporter.stageEnd(stage, {
    ok: false,
    artifactPath: fail.artifactPath,
    sessionId: fail.sessionId,
    error: fail.reason,
  });
  return {
    kind: "failed",
    stageId: stage.id,
    reason: fail.reason,
    status: fail.status,
  };
}

/**
 * Translate the SDK / harness signals on `StageResult` into the persisted
 * stage status + a human-readable error message (when applicable).
 *
 * Mapping:
 *   - SIGINT (`cancelReason === "sigint"`) → `cancelled`
 *   - timeout (`cancelReason === "timeout"`) → `failed`
 *   - validator failure (`stopReason === "validator_failed"`) → `failed`
 *   - otherwise → `completed`
 *
 * Validator failure messages are taken straight off `result.validatorReason`
 * — runStage already ran the validator and captured the verdict, so the
 * runner does not re-run it here.
 */
function classifyOutcome(result: StageResult): {
  stageStatus: StageState["status"];
  errorMessage?: string;
} {
  if (result.cancelReason === "sigint") {
    return {
      stageStatus: "cancelled",
      errorMessage: "cancelled by user (SIGINT)",
    };
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
    // S-006 AC-7: surface the auto-commit SHA onto RunSummary so the reporter
    // can print it on the run-done line. Undefined when the stage was skipped
    // (clean tree) or failed (commit_failed) — the formatter handles both.
    commitSha: state.stages[AUTO_COMMIT_ID]?.commitSha,
  };
}

/** ISO-8601 UTC string truncated to whole seconds, e.g. `2026-04-25T14:30:12Z`. */
function toIsoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * S-006 AC-5 pre-check: returns true when `git status --porcelain` is empty
 * inside `cwd`. A non-zero git exit conservatively returns false so the
 * normal auto-commit path runs and surfaces the underlying error through the
 * commit() result rather than a silent skip.
 */
function isWorkingTreeClean(cwd: string): boolean {
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd,
    encoding: "utf8",
  });
  if (status.status !== 0) return false;
  return status.stdout.trim() === "";
}

// ---------------------------------------------------------------------------
// Advance
// ---------------------------------------------------------------------------

export type AdvanceWorkflowContext = {
  cwd: string;
  /** Disable pause gates (same semantics as `runWorkflow`'s `--no-pause`). */
  noPause?: boolean;
  /** Override the default 5-stage workflow (tests). */
  config?: PraxisConfig;
  /** Parent abort signal — wired to SIGINT by the CLI. */
  signal?: AbortSignal;
};

/**
 * Resume a paused or recover a failed/cancelled run from disk.
 *
 * Distinct entry point from `runWorkflow` — does NOT run pre-flight, does NOT
 * touch `.gitignore`, and reads its intent + cost + per-stage state straight
 * from `<cwd>/.praxis/runs/<runId>/state.json`.
 *
 * Branches on the first non-completed stage's status:
 *   - paused (prior stage completed with `pauseAfter: true`) → log
 *     `resuming approved plan`, dispatch `executeStages` from there.
 *   - failed or cancelled → log `recovering …; re-validating`, validate the
 *     on-disk artifact, on success flip the entry to completed/recovered (no
 *     SDK call) and dispatch `executeStages` from the next index.
 *   - running → exit 1 "not in a resumable state".
 *   - all completed → exit 1 "already complete".
 */
export async function advanceWorkflow(
  runId: string,
  ctx: AdvanceWorkflowContext,
  deps: Deps,
): Promise<RunWorkflowResult> {
  const config = ctx.config ?? defaultWorkflow;
  const reporter = deps.reporter;
  const runDir = join(ctx.cwd, ".praxis", "runs", runId);

  const read = readState(runDir);
  if (!read.ok) {
    return { ok: false, reason: read.reason, runId, runDir };
  }
  const state = read.state;

  // M-2: resolve `intent` once at the advance boundary. The original run
  // captured it in state.json; downstream `runOneStage` reads it off the
  // loop context unconditionally — no per-stage shape check.
  const loopCtx: LoopContext = {
    intent: state.intent,
    cwd: ctx.cwd,
    noPause: ctx.noPause,
    signal: ctx.signal,
  };

  // Resume-point scan: first non-completed stage in workflow order. Hand-
  // edited non-monotonic statuses are tolerated — we always pick the first
  // non-completed entry.
  const idx = config.workflow.findIndex(
    (s) => state.stages[s.id]?.status !== "completed",
  );
  if (idx === -1) {
    return {
      ok: false,
      reason: "run is already complete",
      runId,
      runDir,
    };
  }

  const stage = config.workflow[idx];
  const stageState = state.stages[stage.id];
  const rawStatus = stageState?.status ?? "pending";
  // The `findIndex` above guaranteed `rawStatus !== "completed"`, but TS
  // can't see across the boundary. Narrow here so the `assertNever` at the
  // bottom catches genuine future StageStatus additions, not this case.
  if (rawStatus === "completed") {
    return {
      ok: false,
      reason: "run is already complete",
      runId,
      runDir,
    };
  }
  const status: Exclude<typeof rawStatus, "completed"> = rawStatus;

  if (status === "running") {
    return {
      ok: false,
      reason: `stage ${stage.id} is not in a resumable state (status=running)`,
      runId,
      runDir,
      failedStageId: stage.id,
    };
  }

  if (status === "pending") {
    // Paused path: the prior stage must be `completed` AND have `pauseAfter:
    // true`. A bare-pending current stage with no paused predecessor is the
    // same shape as a freshly-bootstrapped run that never started — not
    // something `advance` should kick off.
    const prev = idx > 0 ? config.workflow[idx - 1] : undefined;
    const prevState = prev ? state.stages[prev.id] : undefined;
    if (prev && prevState?.status === "completed" && prev.pauseAfter === true) {
      reporter.resuming?.("approved", runId, prev.id);
      // L-1: do NOT pre-write `currentStage` here — `runOneStage` rewrites it
      // on entry (line ~185), and the recovery branch below skips this same
      // pre-write. Harmonize both branches.
      return executeStages(
        state,
        config,
        loopCtx,
        deps,
        reporter,
        runDir,
        runId,
        idx,
      );
    }
    return {
      ok: false,
      reason: `stage ${stage.id} is not in a resumable state (status=pending)`,
      runId,
      runDir,
      failedStageId: stage.id,
    };
  }

  // failed / cancelled → recovery path. AC-7: cancelled is treated identically.
  if (status === "failed" || status === "cancelled") {
    reporter.resuming?.("recovering", runId, stage.id);
    const recovery = recoverFailedStage(stage, state, runDir, deps);
    if (!recovery.ok) {
      // Status is intentionally NOT mutated on recovery failure (AC-5/6).
      reporter.runDone(runId, summarize(state, "failed"));
      return {
        ok: false,
        reason: recovery.reason,
        runId,
        runDir,
        failedStageId: stage.id,
        status: "failed",
      };
    }
    return executeStages(
      state,
      config,
      loopCtx,
      deps,
      reporter,
      runDir,
      runId,
      idx + 1,
    );
  }

  // L-2: exhaustiveness guard — TS narrows `status` to `never` here when every
  // StageStatus union member is handled above. If the union grows, the call
  // becomes a compile error pointing at this site.
  return assertNever(status);
}

function assertNever(x: never): never {
  throw new Error(`unreachable stage status: ${String(x)}`);
}

/**
 * Recovery sub-routine for `advanceWorkflow`. Mirrors the state-mutation
 * block of `runOneStage` but skips the SDK call: the prior run already
 * captured `sessionId`, `tokens`, and `usd`, and the user has hand-edited
 * the on-disk artifact. We only flip `status` → `completed`, set
 * `stopReason: "recovered"`, and refresh `endedAt`. Cost totals are NOT
 * incremented — recovery does not spend tokens (AC-14).
 *
 * Returns `{ ok: false, reason }` when the artifact is missing (AC-6) or the
 * stage's optional `validate` rejects the file (AC-5). On both failures,
 * `state.json` is left untouched so the user can re-edit and retry.
 */
function recoverFailedStage(
  stage: StageConfig,
  state: State,
  runDir: string,
  deps: Deps,
): { ok: true } | { ok: false; reason: string } {
  const artifactPath = join(runDir, stage.outputArtifact);
  if (!existsSync(artifactPath)) {
    return {
      ok: false,
      reason: `artifact missing for stage ${stage.id}: ${artifactPath}`,
    };
  }
  if (stage.validate) {
    const text = readFileSync(artifactPath, "utf8");
    const verdict = stage.validate(text);
    if (!verdict.ok) {
      return {
        ok: false,
        reason: `validator rejected ${stage.id} artifact: ${verdict.reason}`,
      };
    }
  }
  const prior = state.stages[stage.id] ?? {};
  state.stages[stage.id] = {
    ...prior,
    status: "completed",
    stopReason: "recovered",
    endedAt: toIsoSeconds(deps.clock()),
  };
  delete state.stages[stage.id].error;
  // M-1 invariant: cost.totalTokens / totalUsd already include this stage's
  // spend from the original failed run; do NOT re-add — recovery is a no-op
  // for cost (AC-14). The per-stage `tokens` / `usd` on `prior` are likewise
  // preserved via the spread.
  writeState(runDir, state);
  return { ok: true };
}
