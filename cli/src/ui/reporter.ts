import type { StageConfig } from "../config/schema.js";
import type { AgentEvent } from "../workflow/stage.js";

/**
 * Terminal outcome of a run, used by `runDone` to pick the right verb in the
 * summary headline ("done" | "paused" | "failed" | "cancelled"). Defaults to
 * `"completed"` when omitted so older callers keep printing "done".
 */
export type RunStatus = "completed" | "paused" | "failed" | "cancelled";

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
}
