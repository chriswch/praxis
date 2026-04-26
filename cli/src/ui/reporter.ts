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
}
