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
   *
   * Optional only to keep round-trip compatibility with pre-S-1 state.json
   * files — fresh runs always populate it via `buildInitialState` (AC-1).
   * The advance / retry resume paths fall back to a one-shot `currentHead`
   * when this is missing on a legacy file and persist the resolved SHA back
   * via `writeState` so subsequent reads stay on the fast path.
   */
  baselineSha?: string;
  /**
   * S-002: chain-id stamped on every iteration's state.json when the run is
   * part of a `praxis run --iterations <N>` chain. Matches
   * `<cwd>/.praxis/chains/<chainId>.json`. Absent on standalone runs (back-
   * compat with single-iteration `praxis run`).
   */
  chainId?: string;
  /**
   * S-002: 1-based monotonic position of this run within its chain. Matches
   * the `iterations[].index` entry in the chain ledger. Absent on standalone
   * runs (paired with `chainId`).
   */
  iterationIndex?: number;
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
  /** S-002: chainId for chain-member runs; omitted for standalone. */
  chainId?: string;
  /** S-002: 1-based iteration index for chain-member runs. */
  iterationIndex?: number;
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
  const state: State = {
    runId: input.runId,
    intent: input.intent,
    startedAt: input.startedAt,
    baselineSha: input.baselineSha,
    currentStage: input.currentStage,
    cost: { totalTokens: 0, totalUsd: 0 },
    stages,
  };
  // S-002: stamp chain context on the state only when both fields are
  // supplied. `JSON.stringify` drops `undefined`-valued keys so the
  // standalone-run shape on disk stays byte-identical to pre-S-002 runs.
  if (input.chainId !== undefined) state.chainId = input.chainId;
  if (input.iterationIndex !== undefined) {
    state.iterationIndex = input.iterationIndex;
  }
  return state;
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
  // M-2: `baselineSha` is optional in `readState` so pre-S-1 state.json files
  // (where the field is absent entirely) can still be advanced/retried — the
  // resume path will resolve it via `currentHead(cwd)` and persist it back.
  // A *present-but-non-string* value is still rejected with a baselineSha-
  // specific reason so the schema-bad case stays distinguishable from the
  // legacy-missing case.
  if ("baselineSha" in parsed && typeof parsed.baselineSha !== "string") {
    return {
      ok: false,
      reason: "state.json is missing or invalid field: baselineSha",
    };
  }
  // S-002: `chainId` and `iterationIndex` are optional (absent on standalone
  // runs and on every pre-S-002 state.json); a *present-but-wrong-type* value
  // is rejected with a field-specific reason — same shape as the baselineSha
  // legacy-missing-vs-bad split above.
  if ("chainId" in parsed && typeof parsed.chainId !== "string") {
    return {
      ok: false,
      reason: "state.json is missing or invalid field: chainId",
    };
  }
  if (
    "iterationIndex" in parsed &&
    typeof parsed.iterationIndex !== "number"
  ) {
    return {
      ok: false,
      reason: "state.json is missing or invalid field: iterationIndex",
    };
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
