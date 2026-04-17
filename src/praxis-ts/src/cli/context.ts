import { resolve } from "node:path";

export interface CommandOptions {
  repoRoot: string;
  json: boolean;
}

export function resolveCommandOptions(opts: Partial<CommandOptions>): CommandOptions {
  return {
    repoRoot: resolve(opts.repoRoot ?? "."),
    json: Boolean(opts.json),
  };
}
