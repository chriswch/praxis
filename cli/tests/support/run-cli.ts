import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliEntry = resolve(here, "..", "..", "src", "cli.ts");
const tsxBin = resolve(here, "..", "..", "node_modules", ".bin", "tsx");

export type CliResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

/** Spawn `tsx src/cli.ts <args...>` in the given cwd. */
export function runCli(args: string[], cwd: string): CliResult {
  const result: SpawnSyncReturns<string> = spawnSync(
    tsxBin,
    [cliEntry, ...args],
    {
      cwd,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    },
  );
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
