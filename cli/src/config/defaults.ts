import type { PraxisConfig } from "./schema.js";
import { validateClarifyAssessArtifact } from "../workflow/validator.js";

const CLARIFY_ASSESS_USER_PROMPT = [
  "Intent: {{intent}}",
  "",
  "Run dir: {{runDir}}",
  "",
  "Survey the repository (read-only) and produce the markdown artifact described in your system prompt as your final assistant message.",
].join("\n");

/**
 * Built-in 3-stage workflow per product.md §5–§6.
 *
 * - clarify-assess: read-only repo survey, validates §5.2 schema, pauses.
 * - implement: bypassPermissions, all tools, no pause.
 * - auto-commit: Bash-only, default permissions, no pause.
 *
 * Models pinned per §6: Opus 4.7 for clarify-assess + implement,
 * Haiku 4.5 for auto-commit.
 */
export const defaultWorkflow: PraxisConfig = {
  version: 1,
  workflow: [
    {
      id: "clarify-assess",
      systemPrompt: { file: "clarify-assess.md" },
      userPromptTemplate: CLARIFY_ASSESS_USER_PROMPT,
      allowedTools: ["Read", "Glob", "Grep", "Bash"],
      permissionMode: "default",
      model: "claude-opus-4-7",
      timeoutMs: 900_000,
      outputArtifact: "01-clarify-assess.md",
      validate: validateClarifyAssessArtifact,
      pauseAfter: true,
    },
    {
      id: "implement",
      systemPrompt: { file: "implement.md" },
      userPromptTemplate: { file: "implement.md" },
      permissionMode: "bypassPermissions",
      model: "claude-opus-4-7",
      timeoutMs: 1_800_000,
      outputArtifact: "02-implement-log.md",
    },
    {
      id: "auto-commit",
      systemPrompt: { file: "auto-commit.md" },
      userPromptTemplate: { file: "auto-commit.md" },
      allowedTools: ["Bash"],
      permissionMode: "default",
      model: "claude-haiku-4-5-20251001",
      timeoutMs: 300_000,
      outputArtifact: "03-commit.txt",
    },
  ],
};
