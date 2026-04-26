import { writeFileSync } from "node:fs";
import { join } from "node:path";

export type StageStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface StageState {
  status: StageStatus;
  endedAt?: string;
  stopReason?: string;
  sessionId?: string;
  tokens?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheCreate: number;
  };
  usd?: number;
  error?: string;
}

export interface State {
  runId: string;
  intent: string;
  startedAt: string;
  currentStage: string;
  cost: { totalTokens: number; totalUsd: number };
  stages: Record<string, StageState>;
}

export interface InitialStateInput {
  runId: string;
  intent: string;
  startedAt: string;
  stageIds: readonly string[];
  currentStage: string;
}

/**
 * Build the §9 state.json structure for a freshly-started run.
 * Every stage is initialized as `{ status: "pending" }`.
 */
export function buildInitialState(input: InitialStateInput): State {
  const stages: Record<string, StageState> = {};
  for (const id of input.stageIds) {
    stages[id] = { status: "pending" };
  }
  return {
    runId: input.runId,
    intent: input.intent,
    startedAt: input.startedAt,
    currentStage: input.currentStage,
    cost: { totalTokens: 0, totalUsd: 0 },
    stages,
  };
}

/** Write `state.json` (pretty-printed, trailing newline) to the run dir. */
export function writeInitialState(runDir: string, state: State): void {
  const path = join(runDir, "state.json");
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n", "utf8");
}
