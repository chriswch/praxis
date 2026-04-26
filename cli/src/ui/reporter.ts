import type { StageConfig } from "../config/schema.js";
import type { AgentEvent } from "../workflow/stage.js";

export interface RunSummary {
  commitSha?: string;
  cost: { totalTokens: number; totalUsd: number };
  perStage: Record<string, { tokens: number; usd: number; sessionId: string }>;
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
