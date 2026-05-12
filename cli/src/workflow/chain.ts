import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { formatRunId } from "./run-id.js";

/**
 * Lifecycle status of a chain (`praxis run --iterations <N>`).
 *
 * Mirrors the "Iteration chains → Termination" table in `docs/features.md`:
 *   - `in_progress`     — chain is mid-flight; iter K may be running or paused.
 *   - `completed`       — every iteration up to `iterationsTotal` succeeded.
 *   - `completed-early` — an iteration's auto-commit cascade-skipped, so the
 *                         chain stops with iters 3–N never starting.
 *   - `aborted`         — an iteration ended `failed` and the user gave up
 *                         (i.e., did not recover via `advance`/`retry`).
 *   - `cancelled`       — SIGINT or non-SIGINT cancel mid-iteration.
 */
export type ChainStatus =
  | "in_progress"
  | "completed"
  | "completed-early"
  | "aborted"
  | "cancelled";

/**
 * Lifecycle status of a single iteration entry inside the chain ledger.
 *
 * `running`/`completed`/`failed`/`cancelled` mirror run-level terminal states
 * (a chain entry tracks one full 7-stage workflow). `paused` reflects the
 * pre-`advance` state when an iteration is awaiting human review at a stage
 * boundary — surfaced so a SIGINT-then-`advance` flow leaves the entry in a
 * recoverable state without a write race.
 */
export type ChainIterationStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

export interface ChainIterationEntry {
  /** 1-based monotonic position in the chain (matches `state.iterationIndex`). */
  index: number;
  /** Run-id of the underlying `praxis run` workflow. */
  runId: string;
  status: ChainIterationStatus;
  /**
   * 40-char SHA produced by the auto-commit stage. Only populated once the
   * iteration's run reaches `completed` with a real commit; absent on
   * cascade-skip, paused, failed, or running entries.
   */
  commitSha?: string;
}

/**
 * Run-level flags carried from chain creation onto every iteration's
 * `runWorkflow` call (spec AC-19/AC-20).
 */
export interface ChainFlags {
  allowDirty: boolean;
  noPause: boolean;
}

export interface ChainLedger {
  chainId: string;
  intent: string;
  iterationsTotal: number;
  iterationsCompleted: number;
  flags: ChainFlags;
  status: ChainStatus;
  /** ISO timestamp captured when the ledger was first written. */
  createdAt: string;
  /** ISO timestamp of the most recent ledger mutation. */
  updatedAt: string;
  iterations: ChainIterationEntry[];
}

export interface BuildInitialChainLedgerInput {
  chainId: string;
  intent: string;
  iterationsTotal: number;
  flags: ChainFlags;
  createdAt: string;
}

/**
 * Build the chain ledger for a freshly-started chain (spec §2 schema).
 *
 * Initial state is `in_progress` with `iterationsCompleted=0` and an empty
 * `iterations[]` — the first entry is appended via `appendIteration` once
 * iter 1's `runDir` exists (spec AC-5). `updatedAt` mirrors `createdAt` so a
 * SIGINT before any iteration starts still leaves a self-consistent file.
 */
export function buildInitialChainLedger(
  input: BuildInitialChainLedgerInput,
): ChainLedger {
  return {
    chainId: input.chainId,
    intent: input.intent,
    iterationsTotal: input.iterationsTotal,
    iterationsCompleted: 0,
    flags: { ...input.flags },
    status: "in_progress",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    iterations: [],
  };
}

/** Resolve `<cwd>/.praxis/chains/<chainId>.json`. */
function chainLedgerPath(cwd: string, chainId: string): string {
  return join(cwd, ".praxis", "chains", `${chainId}.json`);
}

/**
 * Persist the chain ledger to `<cwd>/.praxis/chains/<chainId>.json` —
 * pretty-printed JSON with a trailing newline. Creates the parent directory
 * on first write (mirrors `state.ts` `writeState`'s shape).
 */
export function writeChainLedger(cwd: string, ledger: ChainLedger): void {
  const path = chainLedgerPath(cwd, ledger.chainId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

export type ReadChainLedgerResult =
  | { ok: true; ledger: ChainLedger }
  | { ok: false; reason: string };

const VALID_CHAIN_STATUSES: ReadonlySet<string> = new Set<ChainStatus>([
  "in_progress",
  "completed",
  "completed-early",
  "aborted",
  "cancelled",
]);

const VALID_ITERATION_STATUSES: ReadonlySet<string> =
  new Set<ChainIterationStatus>([
    "running",
    "completed",
    "failed",
    "cancelled",
    "paused",
  ]);

/**
 * Hand-written structural validator for `<cwd>/.praxis/chains/<chainId>.json`.
 *
 * Mirrors `state.ts` `readState` in depth: top-level required fields, status
 * enum membership, structural checks on `flags` (object with two booleans)
 * and `iterations` (array of entries with index/runId/status; commitSha
 * only checked when present). Returns `{ ok, reason }` so callers can render
 * a single-line CLI error without try/catch ceremony.
 */
export function readChainLedger(
  cwd: string,
  chainId: string,
): ReadChainLedgerResult {
  const path = chainLedgerPath(cwd, chainId);
  if (!existsSync(path)) {
    return {
      ok: false,
      reason: `chain ledger not found for ${chainId} at ${path}`,
    };
  }
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    return {
      ok: false,
      reason: `failed to read chain ledger ${chainId}: ${errMsg(err)}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      reason: `chain ledger ${chainId} is not valid JSON: ${errMsg(err)}`,
    };
  }
  if (!isObject(parsed)) {
    return { ok: false, reason: `chain ledger ${chainId} is not an object` };
  }
  const requiredStrings: Array<keyof ChainLedger> = [
    "chainId",
    "intent",
    "createdAt",
    "updatedAt",
  ];
  for (const key of requiredStrings) {
    if (typeof parsed[key] !== "string") {
      return {
        ok: false,
        reason: `chain ledger ${chainId} is missing or invalid field: ${String(
          key,
        )}`,
      };
    }
  }
  const requiredNumbers: Array<keyof ChainLedger> = [
    "iterationsTotal",
    "iterationsCompleted",
  ];
  for (const key of requiredNumbers) {
    if (typeof parsed[key] !== "number") {
      return {
        ok: false,
        reason: `chain ledger ${chainId} is missing or invalid field: ${String(
          key,
        )}`,
      };
    }
  }
  if (
    typeof parsed.status !== "string" ||
    !VALID_CHAIN_STATUSES.has(parsed.status)
  ) {
    return {
      ok: false,
      reason: `chain ledger ${chainId} has invalid status: ${String(
        parsed.status,
      )}`,
    };
  }
  const flags = parsed.flags;
  if (
    !isObject(flags) ||
    typeof flags.allowDirty !== "boolean" ||
    typeof flags.noPause !== "boolean"
  ) {
    return {
      ok: false,
      reason: `chain ledger ${chainId} is missing or invalid field: flags`,
    };
  }
  const iterations = parsed.iterations;
  if (!Array.isArray(iterations)) {
    return {
      ok: false,
      reason: `chain ledger ${chainId} field iterations is not an array`,
    };
  }
  for (let i = 0; i < iterations.length; i += 1) {
    const entry = iterations[i];
    if (!isObject(entry)) {
      return {
        ok: false,
        reason: `chain ledger ${chainId} iteration entry ${i} is not an object`,
      };
    }
    if (typeof entry.index !== "number") {
      return {
        ok: false,
        reason: `chain ledger ${chainId} iteration entry ${i} is missing or invalid field: index`,
      };
    }
    if (typeof entry.runId !== "string") {
      return {
        ok: false,
        reason: `chain ledger ${chainId} iteration entry ${i} is missing or invalid field: runId`,
      };
    }
    if (
      typeof entry.status !== "string" ||
      !VALID_ITERATION_STATUSES.has(entry.status)
    ) {
      return {
        ok: false,
        reason: `chain ledger ${chainId} iteration entry ${i} has invalid status: ${String(
          entry.status,
        )}`,
      };
    }
    if ("commitSha" in entry && typeof entry.commitSha !== "string") {
      return {
        ok: false,
        reason: `chain ledger ${chainId} iteration entry ${i} has invalid commitSha`,
      };
    }
  }
  return { ok: true, ledger: parsed as unknown as ChainLedger };
}

/**
 * Append an iteration entry and advance `updatedAt`. Pure — returns a fresh
 * ledger; the input is untouched. Does NOT increment `iterationsCompleted`
 * (entries are appended on iteration *start*, not completion — the
 * counter advances later via `updateIteration`).
 */
export function appendIteration(
  ledger: ChainLedger,
  entry: ChainIterationEntry,
  now: string,
): ChainLedger {
  return {
    ...ledger,
    iterations: [...ledger.iterations, { ...entry }],
    updatedAt: now,
  };
}

/**
 * Patch the iteration entry at `index` with the supplied fields and advance
 * `updatedAt`. Pure — returns a fresh ledger.
 *
 * `iterationsCompleted` is incremented exactly once per entry — on the first
 * transition into `completed`. Subsequent `completed` writes (e.g. an
 * `advance` re-walking the same entry) are idempotent and do not double-count.
 *
 * Throws when no iteration entry has the requested `index` — callers should
 * have appended via `appendIteration` first.
 */
export function updateIteration(
  ledger: ChainLedger,
  index: number,
  patch: Partial<Omit<ChainIterationEntry, "index">>,
  now: string,
): ChainLedger {
  const pos = ledger.iterations.findIndex((entry) => entry.index === index);
  if (pos === -1) {
    throw new Error(
      `chain ledger ${ledger.chainId}: no iteration entry with index ${index}`,
    );
  }
  const previous = ledger.iterations[pos];
  const updated: ChainIterationEntry = { ...previous, ...patch };
  const nextIterations = ledger.iterations.slice();
  nextIterations[pos] = updated;

  const wasCompleted = previous.status === "completed";
  const nowCompleted = updated.status === "completed";
  const iterationsCompleted =
    !wasCompleted && nowCompleted
      ? ledger.iterationsCompleted + 1
      : ledger.iterationsCompleted;

  return {
    ...ledger,
    iterations: nextIterations,
    iterationsCompleted,
    updatedAt: now,
  };
}

/**
 * Set the chain-level `status` and advance `updatedAt`. Pure — every other
 * field is preserved verbatim.
 */
export function setChainStatus(
  ledger: ChainLedger,
  status: ChainStatus,
  now: string,
): ChainLedger {
  return { ...ledger, status, updatedAt: now };
}

/**
 * Generate a chain-id sharing the canonical run-id shape
 * (`YYYY-MM-DD-HHMM-xxxx`). Chain-ids are generated independently of any
 * iteration's run-id (spec AC-4) but reuse `formatRunId` so a chain-id is
 * lexicographically sortable and visually indistinguishable from a run-id
 * in directory listings.
 */
export function generateChainId(date: Date, randomBytes: Uint8Array): string {
  return formatRunId(date, randomBytes);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
