#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { commit } from "./git/commit.js";
import { LineReporter } from "./ui/line-reporter.js";
import { isRunId } from "./workflow/run-id.js";
import {
  advanceWorkflow,
  type RunWorkflowResult,
  retryWorkflow,
  runWorkflow,
} from "./workflow/runner.js";
import { sdkCreateQueryFn } from "./workflow/sdk-create-query.js";
import type { Deps } from "./workflow/stage.js";

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
      `unknown command: ${command ?? "(missing)"}. Usage: praxis run [--allow-dirty] [--no-pause] "<intent>" | praxis advance [--no-pause] <run-id> | praxis retry [--no-pause] <run-id>`,
    );
  }
  const { intent, allowDirty, noPause } = parseRunArgs(rest);

  // SIGINT: abort the in-flight stage so it surfaces a `cancelled` status
  // instead of leaving the SDK process running. The Node default
  // is to exit immediately on second Ctrl+C — we intentionally let that
  // happen as the user's escape hatch.
  const sigintAbort = new AbortController();
  const onSigint = () => sigintAbort.abort("sigint");
  process.once("SIGINT", onSigint);

  let result: RunWorkflowResult;
  try {
    result = await runWorkflow(
      {
        intent,
        cwd: process.cwd(),
        allowDirty,
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
