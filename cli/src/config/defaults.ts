import {
  validateClarifyAssessArtifact,
  validateCodeReviewArtifact,
} from "../workflow/validator.js";
import type { PraxisConfig } from "./schema.js";

/**
 * Stable id for the built-in auto-commit stage. The runner dispatches the
 * commit hand-off by checking `stage.id === AUTO_COMMIT_ID`, so a rename of
 * the default stage id MUST happen via this constant — otherwise the dispatch
 * silently no-ops. A regression test in `tests/config/defaults.test.ts` pins
 * the literal value so renames also fail loudly there.
 *
 * (Reviewer alternative: introduce a `postStage?: "commit"` discriminator on
 * `StageConfig` — deferred to v0.2.)
 */
export const AUTO_COMMIT_ID = "auto-commit";

/**
 * Stable id for the built-in code-reviewing stage. The runner dispatches the
 * clean-tree skip-propagation by checking `stage.id === CODE_REVIEWING_ID`.
 * Same dispatch-lock rationale as AUTO_COMMIT_ID — pin the literal in
 * `tests/config/defaults.test.ts` so silent renames fail loudly.
 */
export const CODE_REVIEWING_ID = "code-reviewing";

/**
 * Stable id for the built-in code-improving stage. The runner dispatches the
 * decision-driven skip and the "recoverable only via praxis retry" branch by
 * checking `stage.id === CODE_IMPROVING_ID`. Same dispatch-lock rationale as
 * AUTO_COMMIT_ID.
 */
export const CODE_IMPROVING_ID = "code-improving";

const CLARIFY_ASSESS_USER_PROMPT = [
  "Intent: {{intent}}",
  "",
  "Run dir: {{runDir}}",
  "",
  "Survey the repository (read-only) and produce the markdown artifact described in your system prompt as your final assistant message.",
].join("\n");

// The implement stage reads the clarify-assess artifact by path and edits
// files in cwd. Inline so the system prompt is not accidentally re-served as
// the user prompt.
const IMPLEMENT_USER_PROMPT = [
  "Read {{artifacts.clarify-assess.path}} and implement the plan.",
  "Edit files in the current working directory.",
  "Your final message must summarize files changed, what each change does, and anything skipped.",
].join("\n");

// S-002: code-reviewing stage runs the praxis:code-reviewing skill against the
// uncommitted implement-stage changes (git diff / git status — NOT git log).
// Inline so the system prompt is not accidentally re-served as the user prompt.
const CODE_REVIEWING_USER_PROMPT = [
  "Run dir: {{runDir}}",
  "",
  "Invoke the `praxis:code-reviewing` skill via the Skill tool to review the uncommitted changes from the implement stage. Inspect them with `git diff` and `git status` — do NOT use `git log`, the changes are not committed yet.",
  "",
  "Re-emit the skill's review output verbatim as your final assistant message, then append a single `## Decision` H2 whose body is exactly `proceed` or `skip-improve` (no extra prose).",
].join("\n");

// S-002: code-improving stage runs the praxis:code-improving skill against the
// review artifact at {{artifacts.code-reviewing.path}}.
const CODE_IMPROVING_USER_PROMPT = [
  "Invoke the `praxis:code-improving` skill via the Skill tool against the review artifact at {{artifacts.code-reviewing.path}}.",
  "The skill auto-fixes Critical/High/Medium severity findings and never modifies test files.",
  "Your final assistant message must be an improvement summary listing fixes applied and items deferred — it is written verbatim to 04-code-improve.md.",
].join("\n");

// Auto-commit emits ONLY a Conventional Commits message; the harness writes
// it to 05-commit.txt and runs git commit -m.
const AUTO_COMMIT_USER_PROMPT = [
  "Use `git diff` and `git log -10 --oneline` to read the staged + unstaged changes.",
  "Generate a Conventional-Commits-style message (e.g. `feat:`, `fix:`, `chore:`) describing those changes.",
  "Your final assistant message must be ONLY the commit message — no explanation, no markdown fences, no preamble. The harness writes it verbatim to 05-commit.txt and passes it to `git commit -m`.",
].join("\n");

/**
 * Built-in 5-stage workflow.
 *
 * - clarify-assess: read-only repo survey, validates the H2 schema, pauses.
 * - implement: bypassPermissions, all tools, no pause.
 * - code-reviewing: read-only review via the praxis:code-reviewing skill;
 *   validates the `## Decision` H2 (proceed / skip-improve).
 * - code-improving: bypassPermissions, all tools, no validator; runs the
 *   praxis:code-improving skill against the review artifact.
 * - auto-commit: Bash-only, default permissions, no pause.
 *
 * Models pinned: Opus 4.7 for clarify-assess, implement, code-reviewing, and
 * code-improving; Haiku 4.5 for auto-commit.
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
      id: CODE_REVIEWING_ID,
      systemPrompt: { file: "code-reviewing.md" },
      userPromptTemplate: CODE_REVIEWING_USER_PROMPT,
      allowedTools: ["Read", "Glob", "Grep", "Bash", "Skill"],
      permissionMode: "default",
      model: "claude-opus-4-7",
      timeoutMs: 900_000,
      outputArtifact: "03-code-review.md",
      validate: validateCodeReviewArtifact,
    },
    {
      id: CODE_IMPROVING_ID,
      systemPrompt: { file: "code-improving.md" },
      userPromptTemplate: CODE_IMPROVING_USER_PROMPT,
      permissionMode: "bypassPermissions",
      model: "claude-opus-4-7",
      timeoutMs: 1_800_000,
      outputArtifact: "04-code-improve.md",
    },
    {
      id: AUTO_COMMIT_ID,
      systemPrompt: { file: "auto-commit.md" },
      userPromptTemplate: AUTO_COMMIT_USER_PROMPT,
      allowedTools: ["Bash"],
      permissionMode: "default",
      model: "claude-haiku-4-5-20251001",
      timeoutMs: 300_000,
      outputArtifact: "05-commit.txt",
    },
  ],
};
