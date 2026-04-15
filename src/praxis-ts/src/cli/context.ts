import { resolve } from "node:path";

export type CommandOptions = {
  repoRoot: string;
  json: boolean;
};

export function resolveCommandOptions(opts: Partial<CommandOptions>): CommandOptions {
  return {
    repoRoot: resolve(opts.repoRoot ?? "."),
    json: Boolean(opts.json)
  };
}
