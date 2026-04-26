import type { PraxisConfig } from "./schema.js";
import { validateClarifyAssessArtifact } from "../workflow/validator.js";

const CLARIFY_ASSESS_USER_PROMPT = [
  "Intent: {{intent}}",
  "",
  "Run dir: {{runDir}}",
  "",
  "Survey the repository (read-only) and produce the markdown artifact described in your system prompt as your final assistant message.",
].join("\n");

// Per product.md §5.3 — the implement stage reads the clarify-assess
// artifact by path and edits files in cwd. Inline so the system prompt is
// not accidentally re-served as the user prompt.
const IMPLEMENT_USER_PROMPT = [
  "Read {{artifacts.clarify-assess.path}} and implement the plan.",
  "Edit files in the current working directory.",
  "Your final message must summarize files changed, what each change does, and anything skipped.",
].join("\n");

// Per product.md §5.4 — auto-commit emits ONLY a Conventional Commits
// message; the harness writes it to 03-commit.txt and runs git commit -m.
const AUTO_COMMIT_USER_PROMPT = [
  "Use `git diff` and `git log -10 --oneline` to read the staged + unstaged changes from the implement stage.",
  "Generate a Conventional-Commits-style message (e.g. `feat:`, `fix:`, `chore:`) describing those changes.",
  "Your final assistant message must be ONLY the commit message — no explanation, no markdown fences, no preamble. The harness writes it verbatim to 03-commit.txt and passes it to `git commit -m`.",
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
      userPromptTemplate: IMPLEMENT_USER_PROMPT,
      permissionMode: "bypassPermissions",
      model: "claude-opus-4-7",
      timeoutMs: 1_800_000,
      outputArtifact: "02-implement-log.md",
    },
    {
      id: "auto-commit",
      systemPrompt: { file: "auto-commit.md" },
      userPromptTemplate: AUTO_COMMIT_USER_PROMPT,
      allowedTools: ["Bash"],
      permissionMode: "default",
      model: "claude-haiku-4-5-20251001",
      timeoutMs: 300_000,
      outputArtifact: "03-commit.txt",
    },
  ],
};
