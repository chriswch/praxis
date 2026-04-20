#!/usr/bin/env node
import { buildProgram } from "./cli/program.js";

async function main(argv: string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}

main(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`praxis fatal error: ${message}\n`);
  process.exitCode = 5;
});
