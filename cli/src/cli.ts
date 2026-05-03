#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { commit } from "./git/commit.js";
import { LineReporter } from "./ui/line-reporter.js";
import {
  type ChainFlags,
  generateChainId,
  readChainLedger,
  setChainStatus,
  writeChainLedger,
} from "./workflow/chain.js";
import { appendPraxisToGitignore, runPreflight } from "./workflow/preflight.js";
import { isRunId } from "./workflow/run-id.js";
import {
  type AdvanceWorkflowContext,
  advanceWorkflow,
  type RetryWorkflowContext,
  type RunChainContext,
  type RunWorkflowContext,
  type RunWorkflowResult,
  retryWorkflow,
  runWorkflow,
} from "./workflow/runner.js";
import { sdkCreateQueryFn } from "./workflow/sdk-create-query.js";
import type { Deps } from "./workflow/stage.js";

/**
 * S-003 + S-004 + S-005: optional injection seams used by `runRun` /
 * `runAdvance` / `runRetry` so tests can substitute spies that record the
 * per-iteration `RunWorkflowContext` (or the resumed `AdvanceWorkflowContext`
 * / `RetryWorkflowContext`) without spinning up the real 7-stage workflow.
 * Production `buildDefaultDeps` leaves all three undefined; the orchestrators
 * fall back to the real imports. Lives only on the CLI surface — the runner
 * itself never reads these fields.
 */
type RunRunDeps = Deps & {
  runWorkflow?: (
    ctx: RunWorkflowContext,
    deps: Deps,
  ) => Promise<RunWorkflowResult>;
  advanceWorkflow?: (
    runId: string,
    ctx: AdvanceWorkflowContext,
    deps: Deps,
  ) => Promise<RunWorkflowResult>;
  retryWorkflow?: (
    runId: string,
    ctx: RetryWorkflowContext,
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

export type ParsedRetryArgs = {
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
 * S-004: post-iteration decision for the chain loop. `stop` ends the loop
 * (either because the chain reached a terminal status or because something
 * went wrong with the ledger); `continue` lets the next iteration launch.
 */
type IterationDecision =
  | { kind: "stop"; reason: string }
  | { kind: "continue" };

/**
 * S-004: post-iteration cascade — runs after iter K's runner returned `ok`
 * and emitted its run-id. Reads the chain ledger, verifies the iter-K entry
 * exists, and decides:
 *
 *   - missing/unreadable ledger or missing iter-K entry → log to stderr and
 *     return `stop` (the iteration's run is fine on disk; the chain just
 *     can't be progressed further from this CLI process).
 *   - iter-K entry has no `commitSha` → auto-commit cascade-skipped; flip
 *     the chain to `completed-early` and return `stop`. (Spec AC-11.)
 *   - K === iterationsTotal → final iter landed cleanly; flip the chain to
 *     `completed` and return `stop`. (Spec AC-6.)
 *   - otherwise → `continue` so the loop launches iter K+1.
 *
 * Pure-ish — performs disk I/O on the chain ledger only; never touches the
 * iteration's `state.json` or run-dir. Lives in `cli.ts` (not the runner)
 * because the chain-loop policy is the CLI's concern; the runner only owns
 * one iteration's lifecycle.
 */
function handleIterationOutcome(input: {
  cwd: string;
  chainId: string;
  k: number;
  iterationsTotal: number;
  clock: () => Date;
}): IterationDecision {
  const read = readChainLedger(input.cwd, input.chainId);
  if (!read.ok) {
    process.stderr.write(
      `praxis: failed to read chain ledger ${input.chainId} for cascade-skip check: ${read.reason}\n`,
    );
    return { kind: "stop", reason: read.reason };
  }
  const entry = read.ledger.iterations.find((e) => e.index === input.k);
  if (!entry) {
    process.stderr.write(
      `praxis: chain ledger ${input.chainId} is missing iteration ${input.k} entry after runner returned ok\n`,
    );
    return { kind: "stop", reason: "missing iteration entry" };
  }
  if (entry.commitSha === undefined) {
    const stamped = setChainStatus(
      read.ledger,
      "completed-early",
      toIsoSeconds(input.clock()),
    );
    writeChainLedger(input.cwd, stamped);
    return { kind: "stop", reason: "completed-early" };
  }
  if (input.k === input.iterationsTotal) {
    const stamped = setChainStatus(
      read.ledger,
      "completed",
      toIsoSeconds(input.clock()),
    );
    writeChainLedger(input.cwd, stamped);
    return { kind: "stop", reason: "completed" };
  }
  return { kind: "continue" };
}

/**
 * S-004: drive the chain loop K = `startIndex`..`iterationsTotal`. For each
 * iteration, build a fresh `RunChainContext`, dispatch via the supplied
 * `dispatch` (production runWorkflow or a test spy), emit the iteration's
 * runId on stdout (S-3 AC-S3-1), and consult `handleIterationOutcome` to
 * decide whether to launch the next iteration.
 *
 * Used by both:
 *   - `runRun` for the top-level multi-iteration branch (`startIndex: 1`),
 *     and
 *   - `runAdvance` for the chain-aware tail after a paused iter resumes
 *     (`startIndex: K + 1`, where K was the resumed iteration).
 *
 * Returns the final `RunWorkflowResult` so callers can branch on
 * success/failure for exit code + stderr handling.
 */
async function launchRemainingIterations(input: {
  cwd: string;
  intent: string;
  signal: AbortSignal;
  deps: Deps;
  dispatch: (ctx: RunWorkflowContext, deps: Deps) => Promise<RunWorkflowResult>;
  chainId: string;
  flags: ChainFlags;
  iterationsTotal: number;
  startIndex: number;
}): Promise<RunWorkflowResult> {
  let lastResult: RunWorkflowResult | undefined;
  for (let k = input.startIndex; k <= input.iterationsTotal; k++) {
    const chain: RunChainContext = {
      chainId: input.chainId,
      iterationIndex: k,
      iterationsTotal: input.iterationsTotal,
      flags: input.flags,
    };
    const result = await input.dispatch(
      {
        intent: input.intent,
        cwd: input.cwd,
        allowDirty: input.flags.allowDirty,
        noPause: input.flags.noPause,
        signal: input.signal,
        chain,
      },
      input.deps,
    );
    lastResult = result;

    if (!result.ok) {
      process.stderr.write(`praxis: ${result.reason}\n`);
      if (result.remediation) {
        process.stderr.write(`${result.remediation}\n`);
      }
      // Failure path: ledger stays in_progress; S-006 closes out aborted.
      return result;
    }

    process.stdout.write(`${result.runId}\n`);

    if (result.paused) {
      // Pause path: the iteration paused on a stage boundary. The ledger
      // stays in_progress — the next `praxis advance` resumes here.
      return result;
    }

    const decision = handleIterationOutcome({
      cwd: input.cwd,
      chainId: input.chainId,
      k,
      iterationsTotal: input.iterationsTotal,
      clock: input.deps.clock,
    });
    if (decision.kind === "stop") return result;
  }
  // Unreachable in practice — the loop either returns mid-iteration or
  // `handleIterationOutcome` returns `stop` on K === iterationsTotal.
  return (
    lastResult ?? {
      ok: false,
      reason: "praxis: internal error — iteration loop exited without a result",
    }
  );
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
  const flags: ChainFlags = {
    allowDirty: parsed.allowDirty,
    noPause: parsed.noPause,
  };
  return launchRemainingIterations({
    cwd,
    intent: parsed.intent,
    signal,
    deps,
    dispatch,
    chainId,
    flags,
    iterationsTotal: parsed.iterations,
    startIndex: 1,
  });
}

function toIsoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function main(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  const [command, ...rest] = args;
  if (command === "advance") {
    const parsed = parseAdvanceArgs(rest);
    const sigintAbort = new AbortController();
    const onSigint = () => sigintAbort.abort("sigint");
    process.once("SIGINT", onSigint);
    try {
      await runAdvance(
        parsed,
        process.cwd(),
        sigintAbort.signal,
        buildDefaultDeps(),
      );
    } finally {
      process.removeListener("SIGINT", onSigint);
    }
    return;
  }
  if (command === "retry") {
    const parsed = parseRetryArgs(rest);
    const sigintAbort = new AbortController();
    const onSigint = () => sigintAbort.abort("sigint");
    process.once("SIGINT", onSigint);
    try {
      await runRetry(
        parsed,
        process.cwd(),
        sigintAbort.signal,
        buildDefaultDeps(),
      );
    } finally {
      process.removeListener("SIGINT", onSigint);
    }
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

/**
 * S-004: orchestrate one `praxis advance <run-id>` invocation. Mirrors `runRun`
 * — exported for unit-test injection of `advanceWorkflow` / `runWorkflow` via
 * the optional `RunRunDeps` slots. Keeps the `void` return shape (the spec
 * doesn't bubble a result up to `main`); all stderr / stdout / exit are owned
 * inside the helper.
 *
 * The chain-aware tail fires only when the resumed run's `state.json` has a
 * `chainId`. For non-chain runs, behavior is identical to the pre-S-004 CLI:
 * call `advanceWorkflow`, print the runId, exit 1 on failure.
 *
 * For chain runs, after a successful non-paused resume:
 *   - read the chain ledger to recover `iterationsTotal` + `flags`,
 *   - call `handleIterationOutcome` on the resumed iter K to detect cascade-
 *     skip / final-iter-completed, and
 *   - if the decision is `continue`, hand off to `launchRemainingIterations`
 *     starting at K+1 — symmetric with the multi-iteration `runRun` branch.
 */
export async function runAdvance(
  parsed: ParsedAdvanceArgs,
  cwd: string,
  signal: AbortSignal,
  deps: RunRunDeps,
): Promise<void> {
  // S-004: tests inject advanceWorkflow / runWorkflow via the optional Deps
  // slots. Production leaves both undefined and falls back to the real imports.
  const advanceDispatch = deps.advanceWorkflow ?? advanceWorkflow;
  const runDispatch = deps.runWorkflow ?? runWorkflow;

  const result = await advanceDispatch(
    parsed.runId,
    {
      cwd,
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
    process.exit(1);
  }
  process.stdout.write(`${result.runId}\n`);

  // Pause path: the resumed run paused again on a downstream stage. Nothing
  // more to do — the user advances again to push past the next pause. The
  // ledger entry already reflects 'running'.
  if (result.paused) return;

  // S-004 AC-S4-6: non-chain back-compat. The runner threads `chainId` onto
  // its success result (M-2) — absent → standalone (non-chain) resume, no
  // chain-aware tail.
  const { chainId, iterationIndex } = result;
  if (chainId === undefined) return; // Non-chain run; we're done.

  // S-004 AC-S4-2/AC-S4-7/AC-S4-5: chain-aware tail. The runner threads BOTH
  // chainId and iterationIndex onto the success result whenever the resumed
  // run was chain-bound (spec AC-7 — both fields are stamped together on
  // every iteration's state.json), so a defensive iterationIndex-from-ledger
  // fallback would only fire on shapes v1 doesn't produce.
  if (iterationIndex === undefined) {
    process.stderr.write(
      `praxis: chain run ${parsed.runId} returned without an iterationIndex\n`,
    );
    return;
  }
  const readLedger = readChainLedger(cwd, chainId);
  if (!readLedger.ok) {
    process.stderr.write(
      `praxis: failed to read chain ledger ${chainId} after advance: ${readLedger.reason}\n`,
    );
    return;
  }
  const ledger = readLedger.ledger;

  const decision = handleIterationOutcome({
    cwd,
    chainId,
    k: iterationIndex,
    iterationsTotal: ledger.iterationsTotal,
    clock: deps.clock,
  });
  if (decision.kind === "stop") return;

  // S-004 AC-S4-2: auto-launch the remaining iterations starting at K+1.
  // Flags come from the LEDGER (ledger-of-record per spec AC-19/AC-20), not
  // from this `advance` invocation's argv — the chain was started with the
  // user's original `--allow-dirty` / `--no-pause` choice.
  const next = await launchRemainingIterations({
    cwd,
    intent: ledger.intent,
    signal,
    deps,
    dispatch: runDispatch,
    chainId,
    flags: ledger.flags,
    iterationsTotal: ledger.iterationsTotal,
    startIndex: iterationIndex + 1,
  });
  if (!next.ok) process.exit(1);
}

/**
 * S-005: orchestrate one `praxis retry <run-id>` invocation. Mirrors `runAdvance`
 * — exported for unit-test injection of `retryWorkflow` / `runWorkflow` via
 * the optional `RunRunDeps` slots. Keeps the `void` return shape (the spec
 * doesn't bubble a result up to `main`); all stderr / stdout / exit are owned
 * inside the helper.
 *
 * The chain-aware tail fires only when the resumed run's `state.json` has a
 * `chainId`. For non-chain runs, behavior is identical to the pre-S-005 CLI:
 * call `retryWorkflow`, print the runId, exit 1 on failure.
 *
 * For chain runs, after a successful non-paused resume:
 *   - read the chain ledger to recover `iterationsTotal` + `flags`,
 *   - call `handleIterationOutcome` on the resumed iter K to detect cascade-
 *     skip / final-iter-completed, and
 *   - if the decision is `continue`, hand off to `launchRemainingIterations`
 *     starting at K+1 — symmetric with the multi-iteration `runRun` /
 *     `runAdvance` branches.
 */
export async function runRetry(
  parsed: ParsedRetryArgs,
  cwd: string,
  signal: AbortSignal,
  deps: RunRunDeps,
): Promise<void> {
  // S-005: tests inject retryWorkflow / runWorkflow via the optional Deps
  // slots. Production leaves both undefined and falls back to the real imports.
  const retryDispatch = deps.retryWorkflow ?? retryWorkflow;
  const runDispatch = deps.runWorkflow ?? runWorkflow;

  const result = await retryDispatch(
    parsed.runId,
    {
      cwd,
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
    process.exit(1);
  }
  process.stdout.write(`${result.runId}\n`);

  // Pause path: the resumed run paused on a downstream stage. Nothing more
  // to do — the user advances/retries again to push past the next pause. The
  // ledger entry already reflects 'running'.
  if (result.paused) return;

  // S-005 AC-S5-3: non-chain back-compat. The runner threads `chainId` onto
  // its success result (mirroring S-004 M-2) — absent → standalone (non-chain)
  // resume, no chain-aware tail.
  const { chainId, iterationIndex } = result;
  if (chainId === undefined) return; // Non-chain run; we're done.

  // S-005 AC-S5-2/AC-S5-4/AC-S5-5: chain-aware tail. The runner threads BOTH
  // chainId and iterationIndex onto the success result whenever the resumed
  // run was chain-bound (spec AC-7 — both fields are stamped together on
  // every iteration's state.json), so a defensive iterationIndex-from-ledger
  // fallback would only fire on shapes v1 doesn't produce.
  if (iterationIndex === undefined) {
    process.stderr.write(
      `praxis: chain run ${parsed.runId} returned without an iterationIndex\n`,
    );
    return;
  }
  const readLedger = readChainLedger(cwd, chainId);
  if (!readLedger.ok) {
    process.stderr.write(
      `praxis: failed to read chain ledger ${chainId} after retry: ${readLedger.reason}\n`,
    );
    return;
  }
  const ledger = readLedger.ledger;

  const decision = handleIterationOutcome({
    cwd,
    chainId,
    k: iterationIndex,
    iterationsTotal: ledger.iterationsTotal,
    clock: deps.clock,
  });
  if (decision.kind === "stop") return;

  // S-005 AC-S5-2: auto-launch the remaining iterations starting at K+1.
  // Flags come from the LEDGER (ledger-of-record per spec AC-19/AC-20), not
  // from this `retry` invocation's argv — the chain was started with the
  // user's original `--allow-dirty` / `--no-pause` choice.
  const next = await launchRemainingIterations({
    cwd,
    intent: ledger.intent,
    signal,
    deps,
    dispatch: runDispatch,
    chainId,
    flags: ledger.flags,
    iterationsTotal: ledger.iterationsTotal,
    startIndex: iterationIndex + 1,
  });
  if (!next.ok) process.exit(1);
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
