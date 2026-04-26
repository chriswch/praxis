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
   * Resume / recover headline emitted by `praxis advance`. `kind` is
   * `"approved"` for the paused → resume path (the user reviewed the artifact
   * and is letting the workflow continue) and `"recovering"` for the failed /
   * cancelled → recover path (the user hand-edited the artifact and wants the
   * validator to re-check it). Optional so non-CLI Reporters (tests) can skip
   * it; the runner invokes via `reporter.resuming?.(...)`.
   */
  resuming?(
    kind: "approved" | "recovering",
    runId: string,
    stageId: string,
  ): void;
}
