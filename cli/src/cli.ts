#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { commit } from "./git/commit.js";
import { LineReporter } from "./ui/line-reporter.js";
import { isRunId } from "./workflow/run-id.js";
import {
  advanceWorkflow,
  type RunWorkflowResult,
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

type ParsedArgs = {
  intent: string;
  allowDirty: boolean;
  noPause: boolean;
};

function parseRunArgs(rest: string[]): ParsedArgs {
  let allowDirty = false;
  let noPause = false;
  const positional: string[] = [];
  for (const arg of rest) {
    if (arg === "--allow-dirty") {
      allowDirty = true;
    } else if (arg === "--no-pause") {
      noPause = true;
    } else if (arg.startsWith("--")) {
      fail(`unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  const intent = positional[0];
  if (intent === undefined) {
    fail(
      'missing intent. Usage: praxis run [--allow-dirty] [--no-pause] "<intent>"',
    );
  }
  if (intent.trim().length === 0) {
    fail("intent must not be empty or whitespace");
  }
  return { intent, allowDirty, noPause };
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

async function main(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  const [command, ...rest] = args;
  if (command === "advance") {
    await runAdvance(rest);
    return;
  }
  if (command !== "run") {
    fail(
      `unknown command: ${command ?? "(missing)"}. Usage: praxis run [--allow-dirty] [--no-pause] "<intent>" | praxis advance [--no-pause] <run-id>`,
    );
  }
  const { intent, allowDirty, noPause } = parseRunArgs(rest);

  // SIGINT: abort the in-flight stage so it surfaces a `cancelled` status
  // (spec §11) instead of leaving the SDK process running. The Node default
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
  // `cancelled` status (spec §11) rather than killing the SDK process orphan.
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

main(process.argv).catch((err) => {
  process.stderr.write(
    `praxis: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
