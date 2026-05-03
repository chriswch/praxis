import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  AUTO_COMMIT_ID,
  CODE_IMPROVING_ID,
  CODE_REVIEWING_ID,
  defaultWorkflow,
  VERIFYING_AND_ADAPTING_ID,
} from "../config/defaults.js";
import type { PraxisConfig, StageConfig } from "../config/schema.js";
import { currentHead } from "../git/status.js";
import type { Reporter, RunStatus, RunSummary } from "../ui/reporter.js";
import { writeArtifact, writeIntent } from "./artifacts.js";
import {
  appendIteration,
  buildInitialChainLedger,
  type ChainFlags,
  readChainLedger,
  updateIteration,
  writeChainLedger,
} from "./chain.js";
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
import { parseReviewDecision } from "./validator.js";

/**
 * S-002: per-iteration chain context threaded onto `RunWorkflowContext` when
 * `praxis run --iterations <N>` is in flight. The CLI generates a `chainId`
 * once at chain start, computes the per-iteration `iterationIndex`, and
 * passes the same `iterationsTotal` / `flags` along with each iteration's
 * `runWorkflow` call. The runner owns all on-disk ledger I/O — when present,
 * it writes the initial empty-iterations ledger and the iter-K entry in one
 * shot before stage 1 dispatches (spec AC-5), then patches the entry to
 * `completed` (with `commitSha` from the auto-commit stage when available)
 * on the success-return path. Absence keeps the standalone `praxis run` flow
 * untouched.
 */
export type RunChainContext = {
  chainId: string;
  /** 1-based monotonic position of this iteration within the chain. */
  iterationIndex: number;
  /** Total iterations the chain was started with (matches the ledger). */
  iterationsTotal: number;
  flags: ChainFlags;
};

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
  /** Override the default 7-stage workflow (tests). */
  config?: PraxisConfig;
  /**
   * Parent abort signal — when fired, the in-flight stage is aborted as
   * `sigint`. The CLI wires this to a SIGINT listener; tests
   * inject directly to exercise cancellation.
   */
  signal?: AbortSignal;
  /**
   * S-002: chain context for `praxis run --iterations <N>`. When set, the
   * runner stamps `chainId` + `iterationIndex` onto state.json, writes the
   * chain ledger before stage 1 runs, and patches the iteration entry on
   * success. Absent on standalone runs (back-compat).
   */
  chain?: RunChainContext;
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

  // S-003 AC-S3-5/AC-S3-7: skip preflight + .gitignore touch on iter 2+. The
  // tree is clean by construction (post-commit) and .gitignore was already
  // touched up by iter 1 via the same `runWorkflow` entry. Iter 1 (and every
  // standalone, no-chain run) always goes through both gates.
  const isMidChainIteration =
    ctx.chain !== undefined && ctx.chain.iterationIndex > 1;

  if (!isMidChainIteration) {
    const preflight = deps.runPreflight(ctx.cwd, {
      allowDirty: ctx.allowDirty ?? false,
    });
    if (!preflight.ok) {
      return {
        ok: false,
        reason: preflight.reason,
        remediation: preflight.remediation,
      };
    }
  }

  // S-1 AC-3/AC-4: capture `git rev-parse HEAD` exactly once, AFTER preflight
  // (so the not-a-repo / dirty-tree messages still take precedence) and
  // BEFORE any disk write tied to the run-dir. An empty-repo failure here
  // returns the failure shape without creating .praxis/runs/<id>/.
  const head = currentHead(ctx.cwd);
  if (!head.ok) {
    return {
      ok: false,
      reason: head.reason,
      remediation:
        "Create a baseline commit first, e.g. 'git commit --allow-empty -m init'.",
    };
  }

  if (!isMidChainIteration) {
    deps.appendPraxisToGitignore(ctx.cwd);
  }

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
    baselineSha: head.sha,
    stageIds,
    currentStage: stageIds[0],
    // S-002: stamp chain context on state when present so an external
    // observer reading state.json mid-iteration can correlate it to the
    // ledger. `buildInitialState` drops the keys when undefined, keeping
    // the on-disk shape byte-identical for standalone runs.
    chainId: ctx.chain?.chainId,
    iterationIndex: ctx.chain?.iterationIndex,
  });
  writeState(runDir, state);

  // S-002 AC-S2-10 (spec AC-5): write the chain ledger AFTER the run-dir +
  // state.json land but BEFORE the first stage dispatches. The runner owns
  // the on-disk ledger — CLI only generates the chainId and computes flags.
  // One shot writes both the initial empty-iterations ledger AND the iter-K
  // entry so a SIGINT during stage 1 leaves a self-consistent file with one
  // running entry.
  if (ctx.chain) {
    bootstrapChainOnIterationStart(ctx.cwd, ctx.chain, ctx.intent, runId, deps);
  }

  // AC-3: synthetic stage-0 line `[0/N intent] captured → 00-intent.txt`.
  // Optional on the Reporter interface (no StageConfig for the agentless
  // intent capture); Reporters that don't implement it simply skip it.
  reporter.stage0?.(config.workflow.length, basename(intentPath));

  const loopCtx: LoopContext = {
    intent: ctx.intent,
    cwd: ctx.cwd,
    // M-2: `state.baselineSha` is optional on the type to allow legacy
    // pre-S-1 state.json files to load on advance/retry, but fresh runs
    // always populate it via `buildInitialState` — read straight from `head`
    // so the type check stays tight without a non-null assertion.
    baselineSha: head.sha,
    noPause: ctx.noPause,
    signal: ctx.signal,
    chain: ctx.chain,
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

/**
 * S-002 AC-S2-9 + AC-S2-10: write the chain ledger on iteration start. Called
 * once between `writeState(runDir, state)` and `reporter.stage0()` so a
 * SIGINT during stage 1 (clarify-assess) leaves the ledger with one
 * `running` entry on disk — matching the spec's AC-5 chronology.
 *
 * For iter 1, builds the initial ledger and appends the iter-1 entry in a
 * single write. Future iterations (S-3) will append against the existing
 * ledger; the helper stays single-purpose for this slice (S-002 ships only
 * the N=1 path end-to-end).
 */
function bootstrapChainOnIterationStart(
  cwd: string,
  chain: RunChainContext,
  intent: string,
  runId: string,
  deps: Deps,
): void {
  const now = toIsoSeconds(deps.clock());
  const initial = buildInitialChainLedger({
    chainId: chain.chainId,
    intent,
    iterationsTotal: chain.iterationsTotal,
    flags: chain.flags,
    createdAt: now,
  });
  const withIteration = appendIteration(
    initial,
    {
      index: chain.iterationIndex,
      runId,
      status: "running",
    },
    now,
  );
  writeChainLedger(cwd, withIteration);
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
  /**
   * S-1: baseline commit SHA captured at run start (or read back from
   * `state.baselineSha` on the resume paths). Threaded onto every
   * `StageContext` so prompts can reference `{{baselineSha}}`.
   */
  baselineSha: string;
  noPause?: boolean;
  signal?: AbortSignal;
  /**
   * S-002: chain context, propagated from `runWorkflow`. `executeStages`
   * patches the iteration entry on success-return; advance/retry resume
   * paths leave it undefined for the moment (later slices wire those in).
   */
  chain?: RunChainContext;
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

  // S-002 AC-S2-12 / AC-S2-13: on success-return, patch the iteration entry
  // to `completed`, carrying the auto-commit SHA when the stage produced
  // one. Cascade-skip leaves `state.stages[AUTO_COMMIT_ID]?.commitSha`
  // undefined; `updateIteration` accepts a partial patch and the ledger
  // shape leaves `commitSha` optional, so omitting it is the right shape
  // for the no-real-commit path.
  if (ctx.chain) {
    recordChainIterationOnSuccess(ctx.cwd, ctx.chain, state, deps);
  }
  reporter.runDone(runId, summarize(state, "completed"));
  return { ok: true, runId, runDir, paused: false };
}

/**
 * S-002 AC-S2-12 + AC-S2-13: patch the in-flight iteration entry to
 * `completed` on the runner's success-return path. Reads the chain ledger
 * back from disk (the only other writer in this iteration's lifetime is the
 * runner itself, so the read-modify-write is safe within one CLI process per
 * the spec's §9 note), patches the entry via `updateIteration`, and writes
 * back.
 *
 * Pulls `commitSha` off `state.stages[AUTO_COMMIT_ID]` when present —
 * cascade-skip and other no-real-commit paths leave it undefined and
 * `commitSha` is optional on the entry.
 */
function recordChainIterationOnSuccess(
  cwd: string,
  chain: RunChainContext,
  state: State,
  deps: Deps,
): void {
  const read = readChainLedger(cwd, chain.chainId);
  if (!read.ok) {
    // Defensive: the ledger was written by us at iteration start. If it's
    // somehow gone, surface the read failure on stderr but do not throw —
    // the run itself succeeded and the chain status is recoverable by hand.
    process.stderr.write(
      `praxis: failed to update chain ledger ${chain.chainId}: ${read.reason}\n`,
    );
    return;
  }
  const commitSha = state.stages[AUTO_COMMIT_ID]?.commitSha;
  const patch: Parameters<typeof updateIteration>[2] = { status: "completed" };
  if (commitSha !== undefined) patch.commitSha = commitSha;
  const next = updateIteration(
    read.ledger,
    chain.iterationIndex,
    patch,
    toIsoSeconds(deps.clock()),
  );
  writeChainLedger(cwd, next);
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

  const cleanTreeSkip = maybeSkipCleanTree(
    stage,
    ctx,
    deps,
    runDir,
    state,
    reporter,
  );
  if (cleanTreeSkip) return cleanTreeSkip;

  const decisionSkip = maybeDecisionSkipOrFailMissing(
    stage,
    config,
    runDir,
    state,
    deps,
    reporter,
  );
  if (decisionSkip) return decisionSkip;

  const stageCtx: StageContext = {
    intent: ctx.intent,
    runDir,
    runId,
    reporter,
    signal: ctx.signal ?? new AbortController().signal,
    baselineSha: ctx.baselineSha,
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
  // is special — its final 07-commit.txt is the SHA-prefixed form ONLY when
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
  // On {ok:true, sha}, the SHA is prepended onto 07-commit.txt and stamped on
  // the stage state. On {ok:false}, the stage is flipped to failed/
  // commit_failed; 07-commit.txt keeps the agent message only (no SHA prefix).
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
      // expects 07-commit.txt to exist in this state.
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
 * S-006 AC-5 + S-003 AC-1/AC-2 + S-3 AC-5 + S-4 AC-5: skip the SDK call for
 * any of the four trailing stages (code-reviewing, code-improving,
 * verifying-and-adapting, auto-commit) when driving-tdd produced no commits
 * — i.e. HEAD has not advanced past the baseline captured at run start. The
 * skill commits per AC, so HEAD is the canonical signal that work landed; a
 * dirty working tree without a commit is noise (the skill discarded a red
 * test, dropped a stray file, etc.) and the trailing stages have nothing
 * real to review, improve, verify, or commit.
 *
 * Synthesize a completed stage with stopReason "skipped" — no sessionId/
 * tokens/usd, no artifact written, no deps.commit hand-off. Once
 * code-reviewing skips on the unchanged HEAD, the trailing stages see the
 * same unchanged HEAD on entry and skip too, producing the cascading
 * "skipped" stopReason for all four.
 *
 * Returns `null` when the stage is not eligible for clean-tree skip OR when
 * `currentHead` cannot be resolved — in the unresolvable case we fall through
 * to the normal SDK dispatch so the underlying git failure surfaces through
 * the stage rather than a silent skip.
 */
function maybeSkipCleanTree(
  stage: StageConfig,
  ctx: LoopContext,
  deps: Deps,
  runDir: string,
  state: State,
  reporter: Reporter,
): StepOutcome | null {
  if (
    stage.id !== AUTO_COMMIT_ID &&
    stage.id !== CODE_REVIEWING_ID &&
    stage.id !== CODE_IMPROVING_ID &&
    stage.id !== VERIFYING_AND_ADAPTING_ID
  ) {
    return null;
  }
  const head = currentHead(ctx.cwd);
  if (!head.ok || head.sha !== ctx.baselineSha) return null;
  const skipped: StageState = {
    status: "completed",
    endedAt: toIsoSeconds(deps.clock()),
    stopReason: "skipped",
  };
  state.stages[stage.id] = skipped;
  writeState(runDir, state);
  reporter.stageEnd(stage, { ok: true, stopReason: "skipped" });
  return { kind: "continue" };
}

/**
 * S-003 AC-4/AC-13: decision-driven skip on code-improving entry.
 * The code-reviewing stage already validated its `## Decision` H2 (the
 * validator runs there, not here), so the artifact body is one of "proceed"
 * / "skip-improve" by construction. Read it, branch, and either short-
 * circuit code-improving with stopReason "skipped-trivial" (skip-improve) or return
 * `null` (proceed) so the caller falls through to a normal SDK dispatch. If
 * the artifact is missing on disk we fail the stage rather than implicitly
 * proceed — the run had a code-reviewing pass and its artifact must exist by
 * AC-13.
 *
 * No guard for `codeReviewingStage` being absent: the default workflow
 * always contains it, and the user prompt template references
 * `{{artifacts.code-reviewing.path}}`. If the stage were missing, falling
 * through to the SDK dispatch would yield a broken prompt and a confusing
 * failure mode. Throwing here is loud rather than silent.
 *
 * Returns `null` when the stage is not `code-improving` or when the decision
 * is "proceed" — both cases continue to the SDK dispatch.
 */
function maybeDecisionSkipOrFailMissing(
  stage: StageConfig,
  config: PraxisConfig,
  runDir: string,
  state: State,
  deps: Deps,
  reporter: Reporter,
): StepOutcome | null {
  if (stage.id !== CODE_IMPROVING_ID) return null;
  const codeReviewingStage = config.workflow.find(
    (s) => s.id === CODE_REVIEWING_ID,
  );
  if (!codeReviewingStage) {
    throw new Error(
      `code-improving stage requires a preceding ${CODE_REVIEWING_ID} stage in the workflow`,
    );
  }
  const reviewArtifactPath = join(runDir, codeReviewingStage.outputArtifact);
  if (!existsSync(reviewArtifactPath)) {
    return failStage(
      state,
      runDir,
      stage,
      {
        status: "failed",
        endedAt: toIsoSeconds(deps.clock()),
        stopReason: "missing_review_artifact",
        error: `code-reviewing artifact missing: ${reviewArtifactPath}`,
      },
      reporter,
      {
        artifactPath: reviewArtifactPath,
        reason: `code-reviewing artifact missing: ${reviewArtifactPath}`,
        status: "failed",
      },
    );
  }
  const reviewText = readFileSync(reviewArtifactPath, "utf8");
  const decision = parseReviewDecision(reviewText);
  if (decision === "skip-improve") {
    const skipped: StageState = {
      status: "completed",
      endedAt: toIsoSeconds(deps.clock()),
      stopReason: "skipped-trivial",
    };
    state.stages[stage.id] = skipped;
    writeState(runDir, state);
    reporter.stageEnd(stage, { ok: true, stopReason: "skipped-trivial" });
    return { kind: "continue" };
  }
  // decision === "proceed" → caller falls through to SDK dispatch.
  return null;
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
 *
 * Exported for use by `retryWorkflow`, which builds a `StageContext` for the
 * resumed `code-improving` stage and needs the same upstream-artifact map the
 * normal loop derives.
 */
export function collectArtifactPaths(
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
 * M-2: legacy back-fill for `state.baselineSha`. Pre-S-1 state.json files
 * have no `baselineSha` field; `readState` permits the absence on purpose
 * (so `advance` / `retry` can resume in-flight legacy runs) and this helper
 * resolves the missing value once via `currentHead(cwd)`, persists it back
 * via `writeState`, and emits a one-line stderr warning so the migration is
 * visible.
 *
 * Returns the resolved SHA on success. On the (very unlikely) `currentHead`
 * failure — the original run started from a non-empty repo, so this only
 * fires if HEAD has been wound back since — returns the same `{ ok: false,
 * reason, remediation }` shape `runWorkflow` uses for empty-repo failures so
 * the CLI can render an identical error.
 *
 * Mutates `state.baselineSha` in place when back-filling so the caller's
 * `LoopContext` and downstream `StageContext` see the resolved SHA without
 * a second `readState`.
 */
function ensureBaselineSha(
  state: State,
  cwd: string,
  runDir: string,
):
  | { ok: true; sha: string }
  | { ok: false; reason: string; remediation?: string } {
  if (typeof state.baselineSha === "string" && state.baselineSha.length > 0) {
    return { ok: true, sha: state.baselineSha };
  }
  const head = currentHead(cwd);
  if (!head.ok) {
    return {
      ok: false,
      reason: head.reason,
      remediation:
        "Create a baseline commit first, e.g. 'git commit --allow-empty -m init'.",
    };
  }
  state.baselineSha = head.sha;
  writeState(runDir, state);
  process.stderr.write(
    `praxis: legacy state.json migrated — back-filled baselineSha=${head.sha}\n`,
  );
  return { ok: true, sha: head.sha };
}

// ---------------------------------------------------------------------------
// Advance
// ---------------------------------------------------------------------------

export type AdvanceWorkflowContext = {
  cwd: string;
  /** Disable pause gates (same semantics as `runWorkflow`'s `--no-pause`). */
  noPause?: boolean;
  /** Override the default 7-stage workflow (tests). */
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

  // M-2: legacy pre-S-1 state.json files have no `baselineSha` field. Resolve
  // it once via `currentHead(cwd)`, persist back via `writeState` so
  // subsequent reads see it, and emit a one-line stderr warning so the
  // migration is visible. If `currentHead` fails (extremely unlikely on a
  // resume — the original run started from a non-empty repo), return the
  // same failure shape `runWorkflow` does.
  const baselineSha = ensureBaselineSha(state, ctx.cwd, runDir);
  if (!baselineSha.ok) {
    return {
      ok: false,
      reason: baselineSha.reason,
      remediation: baselineSha.remediation,
      runId,
      runDir,
    };
  }

  // M-2: resolve `intent` once at the advance boundary. The original run
  // captured it in state.json; downstream `runOneStage` reads it off the
  // loop context unconditionally — no per-stage shape check.
  // S-1 AC-5: read `baselineSha` straight off state — advance does NOT
  // shell out to `git rev-parse HEAD` again on the happy path.
  const loopCtx: LoopContext = {
    intent: state.intent,
    cwd: ctx.cwd,
    baselineSha: baselineSha.sha,
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
    // S-003 AC-11/AC-12: a failed or cancelled code-improving stage cannot be
    // recovered via `praxis advance`. Stage 4 is allowed to mutate the working
    // tree (bypassPermissions, no validator), so a hand-edit + re-validate
    // path doesn't exist — the code on disk and the partial 05-code-improve.md
    // can be out of sync, and re-validating the artifact tells us nothing
    // about what the stage actually did. Recovery requires a fresh SDK call,
    // which is the `praxis retry` flow. Surface a precise error and leave
    // state.json untouched so the user can run retry without losing context.
    if (stage.id === CODE_IMPROVING_ID) {
      reporter.runDone(runId, summarize(state, "failed"));
      return {
        ok: false,
        reason:
          "code-improving failed/cancelled is recoverable only via 'praxis retry <run-id>'",
        runId,
        runDir,
        failedStageId: stage.id,
        status: "failed",
      };
    }
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

// ---------------------------------------------------------------------------
// Retry (S-005)
// ---------------------------------------------------------------------------

export type RetryWorkflowContext = {
  cwd: string;
  /** Disable pause gates (same semantics as `runWorkflow`'s `--no-pause`). */
  noPause?: boolean;
  /** Override the default 7-stage workflow (tests). */
  config?: PraxisConfig;
  /** Parent abort signal — wired to SIGINT by the CLI. */
  signal?: AbortSignal;
};

/**
 * Shared retry-failure exit shape used by both the up-front
 * `session_unresumable` guard and the post-SDK failure branch in
 * {@link retryWorkflow}. Persists the merged stage state, emits the
 * canonical `stageEnd` + `runDone` lifecycle, and returns the matching
 * {@link RunWorkflowFailure}.
 */
function finalizeRetryFailure(
  state: State,
  runDir: string,
  stage: StageConfig,
  stageState: StageState,
  reporter: Reporter,
  runId: string,
  reason: string,
  status: "failed" | "cancelled",
  failedStageId: string,
  artifactPath?: string,
): RunWorkflowFailure {
  state.stages[stage.id] = stageState;
  writeState(runDir, state);
  reporter.stageEnd(stage, {
    ok: false,
    artifactPath,
    sessionId: stageState.sessionId,
    error: stageState.error ?? reason,
  });
  reporter.runDone(runId, summarize(state, status));
  return {
    ok: false,
    reason,
    runId,
    runDir,
    failedStageId,
    status,
  };
}

/**
 * Resume a failed/cancelled `code-improving` SDK session with the literal
 * user prompt `continue`. Scoped narrowly to one stage for the milestone:
 *
 *   - first non-completed stage MUST be `code-improving`;
 *   - its status MUST be `failed` or `cancelled`;
 *   - its `sessionId` MUST be non-empty (otherwise resume is impossible).
 *
 * On success: tokens/usd/sessionId merge onto the existing per-stage entry,
 * `retryAttempts` increments by 1, the stage flips to `completed`, and the
 * remaining workflow (typically just `auto-commit`) executes via `executeStages`.
 *
 * On failure: tokens/usd accumulate, `retryAttempts` is preserved (it was
 * incremented BEFORE the SDK call so SIGINT mid-stream still counts), the
 * stage status is set per the harness signal, and the partial finalText is
 * written to `05-code-improve.md` so the user can inspect what came back.
 */
export async function retryWorkflow(
  runId: string,
  ctx: RetryWorkflowContext,
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

  // M-2: same legacy back-fill as `advanceWorkflow`. Resolve the missing
  // baseline once, persist it, and warn — so downstream stage contexts
  // (including the {{baselineSha}} expansion in auto-commit's prompt) see
  // a real SHA instead of `undefined`.
  const baselineSha = ensureBaselineSha(state, ctx.cwd, runDir);
  if (!baselineSha.ok) {
    return {
      ok: false,
      reason: baselineSha.reason,
      remediation: baselineSha.remediation,
      runId,
      runDir,
    };
  }

  // Resume-point scan: first non-completed stage in workflow order.
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
  if (stage.id !== CODE_IMPROVING_ID) {
    return {
      ok: false,
      reason: `retry only supports code-improving (first non-completed stage is ${stage.id}); use praxis advance for that stage or start a fresh praxis run`,
      runId,
      runDir,
      failedStageId: stage.id,
    };
  }

  const prior = state.stages[stage.id];
  if (!prior) {
    return {
      ok: false,
      reason: `stage ${stage.id} has no state.json entry`,
      runId,
      runDir,
      failedStageId: stage.id,
    };
  }
  if (prior.status !== "failed" && prior.status !== "cancelled") {
    return {
      ok: false,
      reason: `stage ${stage.id} is not in a retryable state (status=${prior.status})`,
      runId,
      runDir,
      failedStageId: stage.id,
    };
  }

  if (!prior.sessionId || prior.sessionId.length === 0) {
    // No SDK session to resume → record the unresumable terminal state and
    // surface a hint to start fresh. Costs are NOT touched (no SDK call).
    const unresumableState: StageState = {
      ...prior,
      status: "failed",
      stopReason: "session_unresumable",
      endedAt: toIsoSeconds(deps.clock()),
    };
    reporter.stageStart(stage, idx + 1, config.workflow.length);
    return finalizeRetryFailure(
      state,
      runDir,
      stage,
      unresumableState,
      reporter,
      runId,
      "code-improving session is unresumable; reset the working tree (e.g. git stash or git reset) and start a fresh praxis run",
      "failed",
      stage.id,
    );
  }

  // Increment retryAttempts BEFORE the SDK call so a SIGINT mid-stream still
  // leaves the count accurate. Flip the stage to running while the call is in
  // flight so a concurrent reader sees the in-progress state.
  const priorRetryAttempts = prior.retryAttempts ?? 0;
  state.stages[stage.id] = {
    ...prior,
    status: "running",
    retryAttempts: priorRetryAttempts + 1,
  };
  writeState(runDir, state);

  reporter.stageStart(stage, idx + 1, config.workflow.length);
  // S-006: emit the retry headline AFTER stageStart and BEFORE the SDK
  // dispatch so terminal output reads
  //   [5/7 code-improving] starting…
  //   praxis: retrying code-improving (resume <sess>) — sending "continue" (run <id>)
  // The session id surfaced is the *prior* (failed) one — that is what the
  // SDK is actually being asked to resume.
  reporter.resuming?.("retrying", runId, stage.id, prior.sessionId);

  const stageCtx: StageContext = {
    intent: state.intent,
    runDir,
    runId,
    reporter,
    signal: ctx.signal ?? new AbortController().signal,
    // S-1 AC-5: retry reads baselineSha from state; no second shell-out on
    // the happy path. (Legacy back-fill happens once at the top of
    // retryWorkflow via `ensureBaselineSha`.)
    baselineSha: baselineSha.sha,
    artifactPaths: collectArtifactPaths(state, config, runDir, stage.id),
  };

  const result = await runStage(
    stage,
    stageCtx,
    { createQueryFn: deps.createQueryFn },
    { resume: prior.sessionId, initialUserPrompt: "continue" },
  );

  // Mid-stream unresumable heuristic: when the SDK rejects the resume seed,
  // the stream tears down before any `result` message lands — no tokens, no
  // finalText, no cancelReason. Treat that shape as a session_unresumable
  // failure so the user gets the same actionable error as the up-front guard.
  const midStreamUnresumable =
    result.cancelReason === undefined &&
    result.stopReason === "" &&
    result.finalText === "" &&
    result.tokens.input === 0;

  const { stageStatus: classifiedStatus, errorMessage } =
    classifyOutcome(result);

  // Merge the new attempt's spend onto the prior entry. SessionId reflects
  // the latest attempt — on a successful resume the SDK rotates to a new id.
  const mergedTokens = {
    input: (prior.tokens?.input ?? 0) + result.tokens.input,
    output: (prior.tokens?.output ?? 0) + result.tokens.output,
    cacheRead: (prior.tokens?.cacheRead ?? 0) + result.tokens.cacheRead,
    cacheCreate: (prior.tokens?.cacheCreate ?? 0) + result.tokens.cacheCreate,
  };
  const mergedUsd = (prior.usd ?? 0) + result.usd;

  // Cost totals only get the *new* attempt's spend — prior is already in the
  // running totals from the original run + any prior retries.
  state.cost.totalTokens += result.tokens.input + result.tokens.output;
  state.cost.totalUsd += result.usd;

  const stageStatus = midStreamUnresumable ? "failed" : classifiedStatus;
  const persistedStopReason = midStreamUnresumable
    ? "session_unresumable"
    : (result.cancelReason ?? result.stopReason);

  const mergedStageState: StageState = {
    status: stageStatus,
    endedAt: toIsoSeconds(deps.clock()),
    stopReason: persistedStopReason,
    sessionId: result.sessionId || prior.sessionId,
    tokens: mergedTokens,
    usd: mergedUsd,
    retryAttempts: priorRetryAttempts + 1,
    error:
      errorMessage ??
      (midStreamUnresumable
        ? "code-improving session is unresumable"
        : undefined),
  };

  const failed = stageStatus !== "completed";
  if (failed) {
    // Preserve partial output for inspection, then go through the same
    // failStage shape used by the main loop.
    const artifactPath = writeArtifact(
      runDir,
      stage.outputArtifact,
      result.finalText,
    );
    const runStatus =
      classifiedStatus === "cancelled" && !midStreamUnresumable
        ? "cancelled"
        : "failed";
    return finalizeRetryFailure(
      state,
      runDir,
      stage,
      mergedStageState,
      reporter,
      runId,
      mergedStageState.error ?? "stage failed",
      runStatus,
      stage.id,
      artifactPath,
    );
  }

  // Success: write the artifact, persist state, emit stageEnd, then dispatch
  // the remaining stages. executeStages owns runDone for the success path.
  const artifactPath = writeArtifact(
    runDir,
    stage.outputArtifact,
    result.finalText,
  );
  state.stages[stage.id] = mergedStageState;
  writeState(runDir, state);
  reporter.stageEnd(stage, {
    ok: true,
    artifactPath,
    sessionId: mergedStageState.sessionId,
    error: undefined,
  });

  const loopCtx: LoopContext = {
    intent: state.intent,
    cwd: ctx.cwd,
    baselineSha: baselineSha.sha,
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
    idx + 1,
  );
}
