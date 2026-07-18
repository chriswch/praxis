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

/**
 * Stable id for the built-in verifying-and-adapting stage. The runner's
 * cascade-skip eligibility set checks `stage.id !== VERIFYING_AND_ADAPTING_ID`
 * to keep verifying-and-adapting in the no-commit cascade alongside the
 * existing trio (code-reviewing / code-improving / auto-commit). Same
 * dispatch-lock rationale as AUTO_COMMIT_ID — pin the literal in
 * `tests/config/defaults.test.ts` so silent renames fail loudly.
 */
export const VERIFYING_AND_ADAPTING_ID = "verifying-and-adapting";

const CLARIFY_ASSESS_USER_PROMPT = [
  "Intent: {{intent}}",
  "",
  "Run dir: {{runDir}}",
  "",
  "Survey the repository (read-only) and produce the markdown artifact described in your system prompt as your final assistant message.",
].join("\n");

// S-3: the driving-tdd stage reads the clarify-assess spec AND the
// sketching-design sketch by path and edits files in cwd. The
// `praxis:driving-tdd` skill owns Red → Green → Refactor and the per-AC
// commits — the agent does not commit manually. Inline so the system prompt
// is not accidentally re-served as the user prompt.
const DRIVING_TDD_USER_PROMPT = [
  "Read {{artifacts.clarify-assess.path}} (spec) and {{artifacts.sketching-design.path}} (design sketch).",
  "Invoke the `praxis:driving-tdd` skill via the Skill tool against them.",
  "Run dir: {{runDir}}.",
  "Your final assistant message must summarize the TDD cycles completed, ACs covered, files changed, and the SHAs the skill committed — written verbatim to 03-driving-tdd.md.",
].join("\n");

// S-002 + S-3 AC-3: code-reviewing stage runs the praxis:code-reviewing skill
// against the commits driving-tdd produced. The skill inspects them with
// `git diff {{baselineSha}}..HEAD` and `git log {{baselineSha}}..HEAD` (the
// per-AC commits live in the range). Inline so the system prompt is not
// accidentally re-served as the user prompt.
const CODE_REVIEWING_USER_PROMPT = [
  "Run dir: {{runDir}}",
  "",
  "Invoke the `praxis:code-reviewing` skill via the Skill tool to review the commits the driving-tdd stage landed. Inspect them with `git diff {{baselineSha}}..HEAD` and `git log {{baselineSha}}..HEAD` — the commits are real, walk them.",
  "",
  "Re-emit the skill's review output verbatim as your final assistant message, then append a single `## Decision` H2 whose body is exactly `proceed` or `skip-improve` (no extra prose).",
].join("\n");

// S-002 + S-3 AC-4: code-improving stage runs the praxis:code-improving skill
// against the review artifact at {{artifacts.code-reviewing.path}}. The skill
// inspects the per-AC commit range via `git diff {{baselineSha}}..HEAD` /
// `git log {{baselineSha}}..HEAD`.
const CODE_IMPROVING_USER_PROMPT = [
  "Invoke the `praxis:code-improving` skill via the Skill tool against the review artifact at {{artifacts.code-reviewing.path}}.",
  "The skill inspects the driving-tdd commit range with `git diff {{baselineSha}}..HEAD` and `git log {{baselineSha}}..HEAD`, auto-fixes Critical/High/Medium severity findings, and never modifies test files.",
  "Your final assistant message must be an improvement summary listing fixes applied and items deferred — it is written verbatim to 05-code-improve.md.",
].join("\n");

// Auto-commit emits ONLY a Conventional Commits message; the harness writes
// it to 07-commit.txt and runs git commit -m. (S-4 bumped 06 → 07 when the
// verifying-and-adapting stage took slot 06.)
const AUTO_COMMIT_USER_PROMPT = [
  "Use `git diff` and `git log -10 --oneline` to read the staged + unstaged changes.",
  "Generate a Conventional-Commits-style message (e.g. `feat:`, `fix:`, `chore:`) describing those changes.",
  "Your final assistant message must be ONLY the commit message — no explanation, no markdown fences, no preamble. The harness writes it verbatim to 07-commit.txt and passes it to `git commit -m`.",
].join("\n");

// S-2: sketching-design stage runs the praxis:sketching-design skill against
// the clarify-assess artifact at {{artifacts.clarify-assess.path}}. The skill
// emits one of three valid shapes (a sketch / "Skipped — no sketch needed" /
// a `## Spec Issue` H2 block); the runner has no validator, so all three
// shapes pass through verbatim and live in 02-sketching-design.md.
const SKETCHING_DESIGN_USER_PROMPT = [
  "Run dir: {{runDir}}",
  "",
  "Invoke the `praxis:sketching-design` skill via the Skill tool against the clarify-assess artifact at {{artifacts.clarify-assess.path}}.",
  "",
  "Re-emit the skill's output verbatim as your final assistant message. The skill may return a design sketch, a single line `Skipped — no sketch needed`, or a `## Spec Issue` H2 — pass any of the three through unchanged.",
].join("\n");

// S-4: verifying-and-adapting stage runs the praxis:verifying-and-adapting
// skill against the clarify-assess spec, the driving-tdd summary, and the
// optional sketching-design sketch. Read-only — no validator, no pauseAfter.
// The skill returns one of several valid shapes (full verification summary,
// trivial-skip line, or routing recommendation); the runner has no validator,
// so all shapes pass through verbatim and live in 06-verifying-and-adapting.md.
const VERIFYING_AND_ADAPTING_USER_PROMPT = [
  "Run dir: {{runDir}}",
  "",
  "Invoke the `praxis:verifying-and-adapting` skill via the Skill tool against the clarify-assess spec at {{artifacts.clarify-assess.path}}, the driving-tdd summary at {{artifacts.driving-tdd.path}}, and the optional sketching-design sketch at {{artifacts.sketching-design.path}}.",
  "",
  "Inspect the per-AC commits the driving-tdd stage landed with `git diff {{baselineSha}}..HEAD` and `git log {{baselineSha}}..HEAD` — the commits are real, walk them.",
  "",
  "Re-emit the skill's output verbatim as your final assistant message. The skill may return a verification summary, a trivial-skip line, a routing recommendation, or a spec/slice-impact note — pass whichever it returned through unchanged.",
].join("\n");

/**
 * Built-in 7-stage workflow.
 *
 * - clarify-assess: read-only repo survey, validates the H2 schema, pauses.
 * - sketching-design: read-only design sketch via the praxis:sketching-design
 *   skill; no validator (the skill's three valid output shapes — sketch /
 *   skipped / spec-issue — all pass through verbatim).
 * - driving-tdd: bypassPermissions, all tools, no pause; runs the
 *   praxis:driving-tdd skill which owns Red → Green → Refactor and per-AC
 *   commits.
 * - code-reviewing: read-only review via the praxis:code-reviewing skill;
 *   validates the `## Decision` H2 (proceed / skip-improve).
 * - code-improving: bypassPermissions, all tools, no validator; runs the
 *   praxis:code-improving skill against the review artifact.
 * - verifying-and-adapting: read-only verify-and-adapt via the
 *   praxis:verifying-and-adapting skill; no validator (the skill's multiple
 *   valid output shapes — verification summary / trivial-skip / routing
 *   recommendation / spec/slice-impact note — all pass through verbatim).
 * - auto-commit: Bash-only, default permissions, no pause.
 *
 * Models pinned: Opus 4.7 for clarify-assess, sketching-design, driving-tdd,
 * code-reviewing, code-improving, and verifying-and-adapting; Haiku 4.5 for
 * auto-commit.
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
      id: "sketching-design",
      systemPrompt: { file: "sketching-design.md" },
      userPromptTemplate: SKETCHING_DESIGN_USER_PROMPT,
      allowedTools: ["Read", "Glob", "Grep", "Bash", "Skill", "WebSearch", "WebFetch"],
      permissionMode: "default",
      model: "claude-opus-4-7",
      timeoutMs: 900_000,
      outputArtifact: "02-sketching-design.md",
    },
    {
      id: "driving-tdd",
      systemPrompt: { file: "driving-tdd.md" },
      userPromptTemplate: DRIVING_TDD_USER_PROMPT,
      permissionMode: "bypassPermissions",
      model: "claude-opus-4-7",
      timeoutMs: 1_800_000,
      outputArtifact: "03-driving-tdd.md",
    },
    {
      id: CODE_REVIEWING_ID,
      systemPrompt: { file: "code-reviewing.md" },
      userPromptTemplate: CODE_REVIEWING_USER_PROMPT,
      allowedTools: ["Read", "Glob", "Grep", "Bash", "Skill"],
      permissionMode: "default",
      model: "claude-opus-4-7",
      timeoutMs: 900_000,
      outputArtifact: "04-code-review.md",
      validate: validateCodeReviewArtifact,
    },
    {
      id: CODE_IMPROVING_ID,
      systemPrompt: { file: "code-improving.md" },
      userPromptTemplate: CODE_IMPROVING_USER_PROMPT,
      permissionMode: "bypassPermissions",
      model: "claude-opus-4-7",
      timeoutMs: 1_800_000,
      outputArtifact: "05-code-improve.md",
    },
    {
      id: VERIFYING_AND_ADAPTING_ID,
      systemPrompt: { file: "verifying-and-adapting.md" },
      userPromptTemplate: VERIFYING_AND_ADAPTING_USER_PROMPT,
      allowedTools: ["Read", "Glob", "Grep", "Bash", "Skill"],
      permissionMode: "default",
      model: "claude-opus-4-7",
      timeoutMs: 900_000,
      outputArtifact: "06-verifying-and-adapting.md",
    },
    {
      id: AUTO_COMMIT_ID,
      systemPrompt: { file: "auto-commit.md" },
      userPromptTemplate: AUTO_COMMIT_USER_PROMPT,
      allowedTools: ["Bash"],
      permissionMode: "default",
      model: "claude-haiku-4-5-20251001",
      timeoutMs: 300_000,
      outputArtifact: "07-commit.txt",
    },
  ],
};
