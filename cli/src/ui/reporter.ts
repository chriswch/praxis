import type { StageConfig } from "../config/schema.js";
import type { AgentEvent } from "../workflow/stage.js";

/**
 * Terminal outcome of a run, used by `runDone` to pick the right verb in the
 * summary headline ("done" | "paused" | "failed" | "cancelled"). Defaults to
 * `"completed"` when omitted so older callers keep printing "done".
 */
export type RunStatus = "completed" | "paused" | "failed" | "cancelled";

/**
 * S-007: terminal status surfaced on the chain-end Reporter line. Mirrors the
 * subset of `ChainStatus` (workflow/chain.ts) that a chain can land on at
 * stop time — `in_progress` is not a terminal value, so it is excluded.
 */
export type ChainTerminalStatus =
  | "completed"
  | "completed-early"
  | "aborted"
  | "cancelled";

export interface RunSummary {
  commitSha?: string;
  cost: { totalTokens: number; totalUsd: number };
  perStage: Record<string, { tokens: number; usd: number; sessionId: string }>;
  /** Defaults to `"completed"` for back-compat with callers that pre-date H-1. */
  status?: RunStatus;
}

export interface StageEndResult {
  ok: boolean;
  artifactPath?: string;
  sessionId?: string;
  error?: string;
  /**
   * Persisted `stopReason` from the stage's StageState (e.g. "skipped-trivial",
   * "skipped", "end_turn"). Optional — the formatter only reacts to specific
   * values (currently `"skipped-trivial"` for the decision-driven skip on
   * `code-improving`). Plain success / failure paths leave this undefined.
   */
  stopReason?: string;
}

export interface Reporter {
  stageStart(stage: StageConfig, idx: number, total: number): void;
  stageEvent(e: AgentEvent): void;
  stageEnd(stage: StageConfig, result: StageEndResult): void;
  paused(runId: string, stageId: string, artifactPath: string): void;
  runDone(runId: string, summary: RunSummary): void;
  /**
   * Synthesised pre-stage line for the agentless intent capture (`[0/N intent]
   * captured → 00-intent.txt`). Optional because Stage 0 has no `StageConfig`
   * and not every Reporter cares about it — runner calls `reporter.stage0?.()`
   * so absent implementations simply skip the line.
   */
  stage0?(total: number, intentFilename: string): void;
  /**
   * Resume / recover / retry headline. `kind` is:
   *   - `"approved"`   — paused → resume path (the user reviewed the artifact
   *     and is letting the workflow continue); emitted by `praxis advance`.
   *   - `"recovering"` — failed/cancelled → recover path (the user hand-edited
   *     the artifact and wants the validator to re-check it); emitted by
   *     `praxis advance`.
   *   - `"retrying"`   — failed/cancelled `code-improving` → retry path
   *     (resume the prior SDK session with the literal prompt `continue`);
   *     emitted by `praxis retry`. The `sessionId` argument is the prior
   *     session being resumed and is required for this kind only.
   *
   * Optional so non-CLI Reporters (tests) can skip it; the runner invokes via
   * `reporter.resuming?.(...)`.
   */
  resuming?(
    kind: "approved" | "recovering" | "retrying",
    runId: string,
    stageId: string,
    sessionId?: string,
  ): void;
  /**
   * S-007: chain banner emitted once per iteration of a `praxis run --iterations <N>`
   * chain, between the per-iteration `writeState` and the first stage dispatch.
   * Optional so non-CLI Reporters (tests, alternative surfaces) can skip it;
   * the runner invokes via `reporter.chainStart?.(...)`. The runner only emits
   * this on its entry path (`runWorkflow`), NOT inside `executeStages` —
   * advance/retry resume paths re-enter `executeStages` directly and must not
   * re-emit the banner on every continuation.
   */
  chainStart?(
    chainId: string,
    iterationIndex: number,
    iterationsTotal: number,
    runId: string,
  ): void;
  /**
   * S-007: chain-end line emitted once per chain when its lifecycle reaches a
   * terminal status. Fired from `cli.ts` (the chain-loop policy lives in the
   * CLI) immediately after the corresponding `setChainStatus` ledger write
   * lands successfully — read-failure paths do not emit. Optional on the
   * Reporter interface so non-CLI Reporters can skip it.
   */
  chainEnd?(
    chainId: string,
    status: ChainTerminalStatus,
    iterationsCompleted: number,
    iterationsTotal: number,
  ): void;
}
