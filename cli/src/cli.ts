#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { runWorkflow } from "./workflow/runner.js";
import type { CreateQueryFn, Deps } from "./workflow/stage.js";

const notWiredQuery: CreateQueryFn = () => {
  throw new Error("createQueryFn: not wired in S-001");
};

const defaultDeps: Deps = {
  clock: () => new Date(),
  rng: (n: number) => new Uint8Array(randomBytes(n)),
  createQueryFn: notWiredQuery,
};

function fail(message: string): never {
  process.stderr.write(`praxis: ${message}\n`);
  process.exit(1);
}

function main(argv: string[]): void {
  const args = argv.slice(2);
  const [command, ...rest] = args;
  if (command !== "run") {
    fail(
      `unknown command: ${command ?? "(missing)"}. Usage: praxis run "<intent>"`,
    );
  }
  const intent = rest[0];
  if (intent === undefined) {
    fail('missing intent. Usage: praxis run "<intent>"');
  }
  if (intent.trim().length === 0) {
    fail("intent must not be empty or whitespace");
  }

  const { runId } = runWorkflow(
    { intent, cwd: process.cwd() },
    defaultDeps,
  );
  process.stdout.write(`${runId}\n`);
}

main(process.argv);
