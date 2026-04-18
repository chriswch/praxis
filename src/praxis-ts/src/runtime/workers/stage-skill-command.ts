const STAGE_SKILL_COMMAND_PREFIX = "/praxis:";

const STAGE_SKILL_STAGES: ReadonlySet<string> = new Set<string>([
  "clarifying-intent",
  "slicing-stories",
  "sketching-design",
  "driving-tdd",
  "code-reviewing",
  "code-improving",
  "verifying-and-adapting",
]);

export function resolveStageSkillCommand(stage: string): string | null {
  if (STAGE_SKILL_STAGES.has(stage)) {
    return `${STAGE_SKILL_COMMAND_PREFIX}${stage}`;
  }
  return null;
}
