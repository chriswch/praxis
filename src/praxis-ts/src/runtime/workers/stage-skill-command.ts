import type { StageName } from "../../contracts/model.js";

export const STAGE_SKILL_COMMAND_PREFIX = "/praxis:";

const STAGE_SKILL_STAGES: ReadonlySet<StageName> = new Set<StageName>([
  "clarifying-intent",
  "slicing-stories",
  "sketching-design",
  "driving-tdd",
  "code-reviewing",
  "code-improving",
  "verifying-and-adapting",
]);

export function resolveStageSkillCommand(stage: StageName): string | null {
  if (STAGE_SKILL_STAGES.has(stage)) {
    return `${STAGE_SKILL_COMMAND_PREFIX}${stage}`;
  }
  return null;
}
