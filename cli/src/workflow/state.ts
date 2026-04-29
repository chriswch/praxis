import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
  /**
   * S-006 AC-4: SHA of the commit produced by the auto-commit stage. Only
   * populated for the `auto-commit` stage on a successful real commit; absent
   * when the stage was skipped (clean tree) or failed. Surfaced by
   * `summarize()` onto `RunSummary.commitSha` for the run-done line.
   */
  commitSha?: string;
  /**
   * S-005: number of `praxis retry <run-id>` invocations against this stage.
   * Only meaningful for the `code-improving` stage today. Incremented BEFORE
   * the SDK call so a SIGINT mid-stream still leaves the count accurate.
   * Absent until the first retry attempt.
   */
  retryAttempts?: number;
}

export interface State {
  runId: string;
  intent: string;
  startedAt: string;
  /**
   * S-1: 40-hex SHA captured by `git rev-parse HEAD` at run start. Persisted
   * here so `advanceWorkflow` and `retryWorkflow` resume with the original
   * baseline (no second shell-out) and the `{{baselineSha}}` token expands
   * identically across the run.
   */
  baselineSha: string;
  currentStage: string;
  cost: { totalTokens: number; totalUsd: number };
  stages: Record<string, StageState>;
}

export interface InitialStateInput {
  runId: string;
  intent: string;
  startedAt: string;
  baselineSha: string;
  stageIds: readonly string[];
  currentStage: string;
}

/**
 * Build the state.json structure for a freshly-started run.
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
    baselineSha: input.baselineSha,
    currentStage: input.currentStage,
    cost: { totalTokens: 0, totalUsd: 0 },
    stages,
  };
}

/** Persist `state.json` (pretty-printed, trailing newline) to the run dir. */
export function writeState(runDir: string, state: State): void {
  writeFileSync(
    join(runDir, "state.json"),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );
}

export type ReadStateResult =
  | { ok: true; state: State }
  | { ok: false; reason: string };

const VALID_STAGE_STATUSES: ReadonlySet<string> = new Set<StageStatus>([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

/**
 * Hand-written structural validator for `<runDir>/state.json` (S-004 AC-2).
 *
 * Used by `praxis advance` to fail fast on missing/corrupt/schema-bad state
 * before any downstream logic runs. Returns `{ ok, reason }` to mirror
 * `runPreflight` so callers can render a single-line CLI error.
 *
 * Checks performed:
 *   - file exists and parses as JSON;
 *   - top-level shape (string/object fields) matches `State`;
 *   - every entry in `stages` carries a known `StageStatus` string.
 *
 * Deeper field validation (e.g. token shape) is intentionally light — the
 * runner that wrote the file owns its full schema; advance only needs enough
 * to navigate the resume-point algorithm safely.
 */
export function readState(runDir: string): ReadStateResult {
  const path = join(runDir, "state.json");
  if (!existsSync(path)) {
    return { ok: false, reason: `state.json not found at ${path}` };
  }
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    return { ok: false, reason: `failed to read state.json: ${errMsg(err)}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      reason: `state.json is not valid JSON: ${errMsg(err)}`,
    };
  }
  if (!isObject(parsed)) {
    return { ok: false, reason: "state.json is not an object" };
  }
  const requiredStrings: Array<keyof State> = [
    "runId",
    "intent",
    "startedAt",
    "baselineSha",
    "currentStage",
  ];
  for (const key of requiredStrings) {
    if (typeof parsed[key] !== "string") {
      return {
        ok: false,
        reason: `state.json is missing or invalid field: ${String(key)}`,
      };
    }
  }
  const cost = parsed.cost;
  if (
    !isObject(cost) ||
    typeof cost.totalTokens !== "number" ||
    typeof cost.totalUsd !== "number"
  ) {
    return {
      ok: false,
      reason: "state.json is missing or invalid field: cost",
    };
  }
  const stages = parsed.stages;
  if (!isObject(stages)) {
    return { ok: false, reason: "state.json field stages is not an object" };
  }
  for (const [id, entry] of Object.entries(stages)) {
    if (!isObject(entry)) {
      return {
        ok: false,
        reason: `state.json stage entry ${id} is not an object`,
      };
    }
    if (
      typeof entry.status !== "string" ||
      !VALID_STAGE_STATUSES.has(entry.status)
    ) {
      return {
        ok: false,
        reason: `state.json stage entry ${id} has invalid status: ${String(
          entry.status,
        )}`,
      };
    }
  }
  return { ok: true, state: parsed as unknown as State };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
