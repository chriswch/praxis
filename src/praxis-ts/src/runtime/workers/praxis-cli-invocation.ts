import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type PraxisCliInvocation = {
  command: string;
  args: string[];
};

export function resolvePraxisCliInvocation(): PraxisCliInvocation {
  const runtimeRoot = fileURLToPath(new URL("../..", import.meta.url));
  const packageRoot = dirname(runtimeRoot);

  const sourceEntry = join(runtimeRoot, "index.ts");
  if (existsSync(sourceEntry)) {
    const tsxCli = join(packageRoot, "node_modules", "tsx", "dist", "cli.mjs");
    if (!existsSync(tsxCli)) {
      throw new Error(`Cannot launch worker host: missing tsx CLI at ${tsxCli}.`);
    }
    return {
      command: process.execPath,
      args: [tsxCli, sourceEntry]
    };
  }

  const distEntry = join(runtimeRoot, "index.js");
  if (existsSync(distEntry)) {
    return {
      command: process.execPath,
      args: [distEntry]
    };
  }

  return {
    command: "praxis",
    args: []
  };
}
