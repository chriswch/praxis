#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { runWorkflow } from "./workflow/runner.js";
import type { Deps } from "./workflow/stage.js";
import { sdkCreateQueryFn } from "./workflow/sdk-create-query.js";

const defaultDeps: Deps = {
  clock: () => new Date(),
  rng: (n: number) => new Uint8Array(randomBytes(n)),
  createQueryFn: sdkCreateQueryFn,
};

function fail(message: string): never {
  process.stderr.write(`praxis: ${message}\n`);
  process.exit(1);
}

type ParsedArgs = {
  intent: string;
  allowDirty: boolean;
};

function parseRunArgs(rest: string[]): ParsedArgs {
  let allowDirty = false;
  const positional: string[] = [];
  for (const arg of rest) {
    if (arg === "--allow-dirty") {
      allowDirty = true;
    } else if (arg.startsWith("--")) {
      fail(`unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  const intent = positional[0];
  if (intent === undefined) {
    fail('missing intent. Usage: praxis run [--allow-dirty] "<intent>"');
  }
  if (intent.trim().length === 0) {
    fail("intent must not be empty or whitespace");
  }
  return { intent, allowDirty };
}

async function main(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  const [command, ...rest] = args;
  if (command !== "run") {
    fail(
      `unknown command: ${command ?? "(missing)"}. Usage: praxis run [--allow-dirty] "<intent>"`,
    );
  }
  const { intent, allowDirty } = parseRunArgs(rest);

  const result = await runWorkflow(
    { intent, cwd: process.cwd(), allowDirty },
    defaultDeps,
  );
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
  process.stderr.write(`praxis: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
