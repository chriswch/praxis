#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { commit } from "./git/commit.js";
import { LineReporter } from "./ui/line-reporter.js";
import {
  generateChainId,
  readChainLedger,
  setChainStatus,
  writeChainLedger,
} from "./workflow/chain.js";
import { appendPraxisToGitignore, runPreflight } from "./workflow/preflight.js";
import { isRunId } from "./workflow/run-id.js";
import {
  advanceWorkflow,
  type RunChainContext,
  type RunWorkflowContext,
  type RunWorkflowResult,
  retryWorkflow,
  runWorkflow,
} from "./workflow/runner.js";
import { sdkCreateQueryFn } from "./workflow/sdk-create-query.js";
import type { Deps } from "./workflow/stage.js";

/**
 * S-003: optional `runWorkflow` injection seam used by `runRun` so tests can
 * substitute a spy that records each iteration's `RunWorkflowContext`. The
 * production `buildDefaultDeps` leaves it undefined; `runRun` falls back to
 * the real `runWorkflow` import. Lives only on the CLI surface — the runner
 * itself never reads this field.
 */
type RunRunDeps = Deps & {
  runWorkflow?: (
    ctx: RunWorkflowContext,
    deps: Deps,
  ) => Promise<RunWorkflowResult>;
};

function buildDefaultDeps(): Deps {
  // Color when stderr is a TTY and NO_COLOR is unset (the de facto convention).
  const color =
    typeof process.stderr.isTTY === "boolean" &&
    process.stderr.isTTY === true &&
    !process.env.NO_COLOR;
  const cols =
    typeof process.stdout.columns === "number" && process.stdout.columns > 0
      ? process.stdout.columns
      : undefined;
  return {
    clock: () => new Date(),
    rng: (n: number) => new Uint8Array(randomBytes(n)),
    createQueryFn: sdkCreateQueryFn,
    reporter: new LineReporter({ color, cols }),
    commit,
    runPreflight,
    appendPraxisToGitignore,
  };
}

function fail(message: string): never {
  process.stderr.write(`praxis: ${message}\n`);
  process.exit(1);
}

export type ParsedRunArgs = {
  intent: string;
  allowDirty: boolean;
  noPause: boolean;
  /**
   * S-002: total iterations for `praxis run --iterations <N>`. `undefined`
   * when the flag is absent (back-compat — single-run behavior). When set,
   * always a positive integer (`N >= 1`); `parseRunArgs` rejects 0 /
   * negative / non-integer / missing-value via `fail(...)` before returning.
   */
  iterations?: number;
};

/**
 * Parse the `praxis run` argv tail. Surface validation only — every failure
 * goes through `fail(...)`, which writes to stderr and `process.exit(1)`s, so
 * the CLI never receives a malformed `ParsedRunArgs`. Exported so unit tests
 * can exercise the `--iterations` validation matrix without spawning the
 * subprocess.
 */
export function parseRunArgs(rest: string[]): ParsedRunArgs {
  let allowDirty = false;
  let noPause = false;
  let iterations: number | undefined;
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--allow-dirty") {
      allowDirty = true;
    } else if (arg === "--no-pause") {
      noPause = true;
    } else if (arg === "--iterations") {
      // S-002: `--iterations <N>`. Validate the value AS the value-form (i.e.
      // even when missing or another flag follows) so the user sees one
      // canonical message regardless of how the surface failed.
      const next = rest[i + 1];
      if (next === undefined || next.startsWith("--")) {
        fail("iterations must be a positive integer");
      }
      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed < 1) {
        fail("iterations must be a positive integer");
      }
      iterations = parsed;
      i++;
    } else if (arg.startsWith("--")) {
      fail(`unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  const intent = positional[0];
  if (intent === undefined) {
    fail(
      'missing intent. Usage: praxis run [--allow-dirty] [--no-pause] [--iterations <N>] "<intent>"',
    );
  }
  if (intent.trim().length === 0) {
    fail("intent must not be empty or whitespace");
  }
  return { intent, allowDirty, noPause, iterations };
}

type ParsedAdvanceArgs = {
  runId: string;
  noPause: boolean;
};

function parseAdvanceArgs(rest: string[]): ParsedAdvanceArgs {
  let noPause = false;
  const positional: string[] = [];
  for (const arg of rest) {
    if (arg === "--no-pause") {
      noPause = true;
    } else if (arg.startsWith("--")) {
      fail(`unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  const runId = positional[0];
  if (runId === undefined) {
    fail("missing run-id. Usage: praxis advance [--no-pause] <run-id>");
  }
  if (!isRunId(runId)) {
    fail(
      `invalid run-id: ${runId}. Expected shape YYYY-MM-DD-HHMM-xxxx (4 hex chars).`,
    );
  }
  return { runId, noPause };
}

type ParsedRetryArgs = {
  runId: string;
  noPause: boolean;
};

function parseRetryArgs(rest: string[]): ParsedRetryArgs {
  let noPause = false;
  const positional: string[] = [];
  for (const arg of rest) {
    if (arg === "--no-pause") {
      noPause = true;
    } else if (arg.startsWith("--")) {
      fail(`unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  const runId = positional[0];
  if (runId === undefined) {
    fail("missing run-id. Usage: praxis retry [--no-pause] <run-id>");
  }
  if (!isRunId(runId)) {
    fail(
      `invalid run-id: ${runId}. Expected shape YYYY-MM-DD-HHMM-xxxx (4 hex chars).`,
    );
  }
  return { runId, noPause };
}

/**
 * S-002 + S-003: orchestrate one `praxis run` invocation against pre-parsed
 * args. Extracted from `main()` so unit/e2e tests can drive it with stubbed
 * `Deps` (the production CLI hard-wires the real Anthropic SDK, which
 * needs network credentials). All stdout/stderr writes happen inside the
 * helper; callers just hand it `parsed`, `cwd`, a SIGINT-shaped
 * `AbortSignal`, and `Deps`.
 *
 * When `parsed.iterations` is set, the helper generates a chain-id once via
 * `generateChainId(deps.clock(), deps.rng(2))` and loops K = 1..N, building
 * a per-iteration `RunChainContext` (with the inherited `flags`) for each
 * call to `runWorkflow`. After every successful, non-paused iteration:
 *
 *   - S-003 AC-S3-1: emit the iteration's `runId` to stdout (one per line).
 *   - S-003 AC-S3-11: read the ledger entry just written by the runner; if
 *     the auto-commit cascade-skipped (entry has no `commitSha`), flip the
 *     chain to `completed-early` and break the loop — iters K+1..N never
 *     start.
 *
 * On the final iteration (K === N) success, flip the chain to `completed`
 * (S-002 AC-S2-22 / S-003 AC-S3-10). Failure / pause leave the chain
 * `in_progress` for later slices (S-004/S-006) to close out.
 *
 * For standalone runs (no `--iterations`), the loop runs exactly once, no
 * chain context is created, and no ledger writes happen — back-compat with
 * the pre-S-002 surface.
 */
export async function runRun(
  parsed: ParsedRunArgs,
  cwd: string,
  signal: AbortSignal,
  deps: RunRunDeps,
): Promise<RunWorkflowResult> {
  // S-003: tests inject a runWorkflow spy via the optional Deps slot.
  // Production leaves the field undefined and falls back to the real import.
  const dispatch = deps.runWorkflow ?? runWorkflow;

  // Standalone runs (no --iterations) take the single-call back-compat path
  // — no chainId, no ledger, no stdout-per-iteration loop.
  if (parsed.iterations === undefined) {
    const result = await dispatch(
      {
        intent: parsed.intent,
        cwd,
        allowDirty: parsed.allowDirty,
        noPause: parsed.noPause,
        signal,
      },
      deps,
    );
    if (!result.ok) {
      process.stderr.write(`praxis: ${result.reason}\n`);
      if (result.remediation) {
        process.stderr.write(`${result.remediation}\n`);
      }
    } else {
      process.stdout.write(`${result.runId}\n`);
    }
    return result;
  }

  const chainId = generateChainId(deps.clock(), deps.rng(2));
  const flags = { allowDirty: parsed.allowDirty, noPause: parsed.noPause };
  const total = parsed.iterations;

  let lastResult: RunWorkflowResult | undefined;
  for (let k = 1; k <= total; k++) {
    const chain: RunChainContext = {
      chainId,
      iterationIndex: k,
      iterationsTotal: total,
      flags,
    };
    const result = await dispatch(
      {
        intent: parsed.intent,
        cwd,
        allowDirty: parsed.allowDirty,
        noPause: parsed.noPause,
        signal,
        chain,
      },
      deps,
    );
    lastResult = result;

    if (!result.ok) {
      process.stderr.write(`praxis: ${result.reason}\n`);
      if (result.remediation) {
        process.stderr.write(`${result.remediation}\n`);
      }
      // Failure path: ledger stays in_progress; S-004/S-006 close out aborted.
      return result;
    }

    process.stdout.write(`${result.runId}\n`);

    if (result.paused) {
      // Pause path: the iteration paused on a stage boundary. The ledger
      // stays in_progress — S-004 wires `praxis advance` to auto-launch
      // the next iteration once the user advances past the pause.
      return result;
    }

    // S-003 AC-S3-11 (cascade-skip detection): the runner just wrote the
    // iteration entry as 'completed'. If the entry has no commitSha, the
    // auto-commit stage cascade-skipped (no driving-tdd commits) — flip the
    // chain to completed-early and break. Iters K+1..N never start.
    const read = readChainLedger(cwd, chainId);
    if (!read.ok) {
      process.stderr.write(
        `praxis: failed to read chain ledger ${chainId} for cascade-skip check: ${read.reason}\n`,
      );
      return result;
    }
    const entry = read.ledger.iterations.find((e) => e.index === k);
    if (!entry) {
      process.stderr.write(
        `praxis: chain ledger ${chainId} is missing iteration ${k} entry after runner returned ok\n`,
      );
      return result;
    }
    if (entry.commitSha === undefined) {
      const stamped = setChainStatus(
        read.ledger,
        "completed-early",
        toIsoSeconds(deps.clock()),
      );
      writeChainLedger(cwd, stamped);
      return result;
    }

    // S-002 AC-S2-22 / S-003 AC-S3-10: on the final iteration's clean success,
    // flip the chain to 'completed'. Earlier iterations leave it in_progress
    // until either the loop completes or cascade-skip / failure short-circuits.
    if (k === total) {
      const stamped = setChainStatus(
        read.ledger,
        "completed",
        toIsoSeconds(deps.clock()),
      );
      writeChainLedger(cwd, stamped);
    }
  }

  // Unreachable in practice — the loop either returns mid-iteration or
  // completes the K === total branch above. Keeping the typed return so TS
  // narrows the callers' RunWorkflowResult.
  return (
    lastResult ?? {
      ok: false,
      reason: "praxis: internal error — iteration loop exited without a result",
    }
  );
}

function toIsoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function main(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  const [command, ...rest] = args;
  if (command === "advance") {
    await runAdvance(rest);
    return;
  }
  if (command === "retry") {
    await runRetry(rest);
    return;
  }
  if (command !== "run") {
    fail(
      `unknown command: ${command ?? "(missing)"}. Usage: praxis run [--allow-dirty] [--no-pause] [--iterations <N>] "<intent>" | praxis advance [--no-pause] <run-id> | praxis retry [--no-pause] <run-id>`,
    );
  }
  const parsed = parseRunArgs(rest);

  // SIGINT: abort the in-flight stage so it surfaces a `cancelled` status
  // instead of leaving the SDK process running. The Node default
  // is to exit immediately on second Ctrl+C — we intentionally let that
  // happen as the user's escape hatch.
  const sigintAbort = new AbortController();
  const onSigint = () => sigintAbort.abort("sigint");
  process.once("SIGINT", onSigint);

  let result: RunWorkflowResult;
  try {
    result = await runRun(
      parsed,
      process.cwd(),
      sigintAbort.signal,
      buildDefaultDeps(),
    );
  } finally {
    process.removeListener("SIGINT", onSigint);
  }
  if (!result.ok) process.exit(1);
}

async function runAdvance(rest: string[]): Promise<void> {
  // Parse first so unknown flags / bad run-ids surface before any disk I/O.
  const { runId, noPause } = parseAdvanceArgs(rest);

  // SIGINT mirrors `praxis run` — abort the in-flight stage so it surfaces a
  // `cancelled` status rather than killing the SDK process orphan.
  const sigintAbort = new AbortController();
  const onSigint = () => sigintAbort.abort("sigint");
  process.once("SIGINT", onSigint);

  let result: RunWorkflowResult;
  try {
    result = await advanceWorkflow(
      runId,
      {
        cwd: process.cwd(),
        noPause,
        signal: sigintAbort.signal,
      },
      buildDefaultDeps(),
    );
  } finally {
    process.removeListener("SIGINT", onSigint);
  }
  if (!result.ok) {
    process.stderr.write(`praxis: ${result.reason}\n`);
    if (result.remediation) {
      process.stderr.write(`${result.remediation}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(`${result.runId}\n`);
}

async function runRetry(rest: string[]): Promise<void> {
  // Parse first so unknown flags / bad run-ids surface before any disk I/O.
  const { runId, noPause } = parseRetryArgs(rest);

  // SIGINT mirrors `praxis run` / `praxis advance` — abort the in-flight stage
  // so it surfaces a `cancelled` status rather than killing the SDK process
  // orphan.
  const sigintAbort = new AbortController();
  const onSigint = () => sigintAbort.abort("sigint");
  process.once("SIGINT", onSigint);

  let result: RunWorkflowResult;
  try {
    result = await retryWorkflow(
      runId,
      {
        cwd: process.cwd(),
        noPause,
        signal: sigintAbort.signal,
      },
      buildDefaultDeps(),
    );
  } finally {
    process.removeListener("SIGINT", onSigint);
  }
  if (!result.ok) {
    process.stderr.write(`praxis: ${result.reason}\n`);
    if (result.remediation) {
      process.stderr.write(`${result.remediation}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(`${result.runId}\n`);
}

// Guard the auto-execution so `import { parseRunArgs } from "./cli.js"`
// from a unit test (S-002) does NOT bootstrap the whole CLI on module load.
// The published `bin/praxis` entry still hits this branch via Node's
// argv[1] resolution, and the dist bundle preserves the same import.meta.url
// shape.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv).catch((err) => {
    process.stderr.write(
      `praxis: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
}
