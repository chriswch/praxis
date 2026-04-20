import type { StageName } from "../../contracts/model.js";

// Single source of truth for the CLI→plugin slash-command namespace.
// Changing this one constant renames every dispatched slash command.
export const PRAXIS_SLASH_PREFIX = "/praxis:";

// Stages that dispatch through a plugin slash command. Stages absent from this
// set are executed by the CLI alone (prompt composed by the dispatch module;
// no plugin skill involved).
const SLASH_COMMAND_STAGES: ReadonlySet<string> = new Set<StageName>([
  "clarifying-intent",
  "slicing-stories",
  "sketching-design",
  "driving-tdd",
  "code-reviewing",
  "code-improving",
  "verifying-and-adapting",
]);

// Accept plain strings so callers holding a loosely-typed stage name (e.g.
// `WorkerLaunchPayload.stage: string`) can resolve without a type assertion.
// Unknown names return null, matching the pre-dispatch behavior.
export function resolveStageSlashCommand(stage: string): string | null {
  if (SLASH_COMMAND_STAGES.has(stage)) {
    return `${PRAXIS_SLASH_PREFIX}${stage}`;
  }
  return null;
}

export function isSlashCommandStage(stage: string): boolean {
  return SLASH_COMMAND_STAGES.has(stage);
}
