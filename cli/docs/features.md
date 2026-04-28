# Features

What Praxis CLI currently provides. Open work and known issues are tracked in [backlog.md](backlog.md).

---

## Commands

### `praxis run "<intent>"`

Starts a new workflow run in the current directory. Prints a run-id (format `YYYY-MM-DD-HHMM-xxxx`, UTC) to stdout and creates `<cwd>/.praxis/runs/<run-id>/`.

Flags:

- `--allow-dirty` — proceed when the working tree has uncommitted changes. Pre-existing dirt will be bundled into the auto-commit by `git add -A` (documented trade-off).
- `--no-pause` — disable all `pauseAfter` gates; full autopilot through every stage.

Empty / whitespace / missing intent fails closed with exit 1 and no `.praxis/` side effects.

### `praxis advance <run-id>`

Resumes a paused run, or recovers a failed/cancelled `clarify-assess` or `code-reviewing` stage from the on-disk artifact. Validates the run-id format and rejects unknown flags before any disk read.

Flags:

- `--no-pause` — same autopilot semantics as on `run`.

Pre-flight does NOT run on `advance`: the run dir is already initialised and `.gitignore` was already touched up by the original `praxis run`.

Exits 1 with `not in a resumable state` for `pending` / `running` stages, or `already complete` for fully-completed runs. Exits 1 with the `praxis retry` hint when the failed stage is `code-improving`.

### `praxis retry <run-id>`

Resumes a failed or cancelled `code-improving` SDK session by passing `resume: <prior sessionId>` and `initialUserPrompt: "continue"`. Scoped to `code-improving` only — every other stage exits 1 with `retry only supports code-improving for now; for <stage-id> use praxis advance | fresh praxis run`. Validates the run-id format before any disk read.

Flags:

- `--no-pause` — same autopilot semantics as on `run` / `advance`.

Pre-flight does NOT run on `retry`. Tokens and USD accumulate into the existing stage entry; `state.stages["code-improving"].retryAttempts` increments per call. Retry is unbounded. When the SDK signals an unresumable session mid-stream (or when the prior `sessionId` is missing), the stage flips to `failed`/`stopReason: "session_unresumable"`.

---

## Pre-flight

Runs at the start of `praxis run`, before any disk write:

1. Block when not inside a git work tree.
2. Block on a dirty working tree unless `--allow-dirty`; print the dirty file list and remediation hints (commit / stash / `--allow-dirty`).
3. Append `.praxis/` to `.gitignore` if missing — line-exact match, idempotent across runs, existing newline state preserved.

A failed pre-flight leaves no orphan `.praxis/` directory on disk.

The `praxis` Claude Code plugin's presence is **not** pre-flighted; a missing plugin surfaces during the `code-reviewing` stage as a normal validator failure ("skill not found" in the agent's final text).

---

## Workflow stages

Five sequential stages, each running in a fresh Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) session. Stages communicate by writing artifact files; downstream stages reference them by absolute path and the agent reads them via the Read tool.

### Stage 0 — intent capture

Writes the raw `<intent>` argument to `00-intent.txt` verbatim (no trailing newline). No agent invoked.

### Stage 1 — `clarify-assess`

Read-only repo survey. `permissionMode: "default"`, allowlist `[Read, Glob, Grep, Bash]`. Pinned model `claude-opus-4-7`. 15-minute timeout. Pauses afterward unless `--no-pause`.

The system prompt directs the agent to restate intent, survey the repo, identify assumptions and gaps, and emit a plan with acceptance criteria — and then to end by emitting **only** a markdown artifact with five H2 headings in fixed order: `Intent`, `Assumptions`, `Gaps`, `Plan`, `Acceptance` (with ≥1 non-empty bullet under Acceptance). The harness validates this schema after the agent's Stop event. On schema failure the harness sends one corrective user message in the same `query()` stream; a second failure marks the stage `failed`/`stopReason: "validator_failed"` and exits 1. The partial artifact is written to disk in either case so the user can hand-edit and `praxis advance`.

### Stage 2 — `implement`

Full-tools execution. `permissionMode: "bypassPermissions"` (paired with `allowDangerouslySkipPermissions: true` per the SDK's requirement). Pinned model `claude-opus-4-7`. 30-minute timeout. Auto-advances to `code-reviewing`.

The user prompt references `01-clarify-assess.md` by absolute path; the agent reads it via the Read tool. Writes `02-implement-log.md` verbatim from the agent's final assistant message (no validator). Timeout marks the stage `failed`/`stopReason: "timeout"`; SIGINT marks it `cancelled`/`stopReason: "sigint"`. In both cases the partial log is preserved and downstream stages are skipped.

> **Risk:** the implement stage runs with `bypassPermissions` against `process.cwd()`. The agent can run `rm`, `git push`, network installers, and overwrite files outside its declared scope. **Use only on repos you can roll back.**

### Stage 3 — `code-reviewing`

Read-only quality review of the uncommitted implement-stage changes. `permissionMode: "default"`, allowlist `[Read, Glob, Grep, Bash, Skill]`. Pinned model `claude-opus-4-7`. 15-minute timeout. Auto-advances to `code-improving`.

The user prompt directs the agent to invoke the `praxis:code-reviewing` skill via the `Skill` tool (against uncommitted changes inspected through `git diff` / `git status` — `git log` does not apply), re-emit the skill's review **verbatim** as its final assistant message, and append a single `## Decision` H2 with body `proceed` or `skip-improve` so the runner can gate stage 4. The skill's native template — Premise Check, Layer 1–5 analyses, severity-graded Issues tables, What's Done Well, Summary counts — is what stage 4 reads to apply fixes; the harness does not reshape it.

The artifact is written verbatim to `03-code-review.md` (always written, even on validator failure).

**Validator** — `validateCodeReviewArtifact(text)`. Decision-only:

- An `## Decision` H2 exists.
- Its body, trimmed, is exactly `proceed` or `skip-improve` (single line, case-sensitive).

Everything above `## Decision` is freeform skill output. Schema failure → harness sends one corrective user message in the same `query()` stream; second failure → stage `failed`/`stopReason: "validator_failed"`. Recovery via `praxis advance` re-runs the validator against on-disk content (same model as `clarify-assess`). A missing `praxis` plugin manifests here as the agent emitting "skill not found" in its final text — the harness flags the schema violation as a normal validator failure.

**Trivial-change short-circuit.** When the change is trivial enough that formal review is wasted ceremony, the agent invokes `praxis:code-reviewing`, takes its built-in condensed/"review skipped" output verbatim, and appends `## Decision: skip-improve` with the skill's one-line rationale carried into `## Summary` (or wherever the condensed form puts it). Stage 4 then takes the decision-driven skip path (see §3.5).

**Clean-tree skip.** If `git status --porcelain` is empty at stage entry (the implement stage produced no changes), the stage is marked `completed`/`stopReason: "skipped"` — no SDK call, no artifact, no spend. Stages 4 and 5 also skip downstream.

### §3.5 — Decision-driven skip on stage 4

When `code-reviewing` ends with `## Decision: skip-improve`, the runner marks `code-improving` `completed`/`stopReason: "skipped-trivial"` without invoking the SDK or writing `04-code-improve.md`. Stage 5 (`auto-commit`) still runs — the implement-stage edits are real and need to land — and `git diff` covers them.

### Stage 4 — `code-improving`

Applies fixes from the review. `permissionMode: "bypassPermissions"`, allowlist all (incl. `Skill`). Pinned model `claude-opus-4-7`. 30-minute timeout. Auto-advances to `auto-commit`. **No validator.**

The user prompt directs the agent to invoke the `praxis:code-improving` skill via the `Skill` tool against `03-code-review.md`. The skill auto-fixes Critical/High/Medium findings and never modifies test files. The agent's final assistant message — an improvement summary listing fixes applied and items deferred — is written verbatim to `04-code-improve.md`.

> **Risk:** same blast radius as `implement` — runs against `process.cwd()` with `bypassPermissions`. **Use only on repos you can roll back.**

**Skip paths:**

- **Clean tree at stage 3 entry** (cascaded from upstream) → `completed`/`stopReason: "skipped"`. No SDK call, no artifact.
- **Decision = `skip-improve`** on the upstream review → `completed`/`stopReason: "skipped-trivial"`. No SDK call, no artifact. Stage 5 still runs.

**Recovery.** A failed/cancelled `code-improving` is recoverable **only** via `praxis retry <run-id>`. `praxis advance` rejects the failed stage with the scoped error.

### Stage 5 — `auto-commit`

Generates a Conventional-Commits message and lands a real commit. `permissionMode: "default"`, allowlist `[Bash]`. Pinned model `claude-haiku-4-5-20251001`. 5-minute timeout.

Pre-stage check: if `git status --porcelain` is empty before invoking the stage, the SDK call is skipped entirely; the stage is marked `completed`/`stopReason: "skipped"` (no sessionId/tokens/usd, no `05-commit.txt`, HEAD untouched).

Otherwise, after the agent emits the commit message, the harness runs `git add -A` and `git commit -m <message>` directly (not via the agent). On success, the new HEAD SHA is captured and `05-commit.txt` is written as `<40-char-sha>\n\n<message>\n`; the SHA also lands on `state.stages["auto-commit"].commitSha` and on the run-done line. On commit failure (e.g., missing git identity, pre-commit hook failure), the stage flips to `failed`/`stopReason: "commit_failed"` with git's stderr captured in `error`; `05-commit.txt` keeps the agent message verbatim (no SHA prefix). The user-prompt copy stays generic ("staged + unstaged changes") — `git diff` covers implement and code-improve edits without per-stage attribution.

> **Git identity required.** `git commit -m` needs `user.email` and `user.name` set, globally (`git config --global user.email …`) or per-repo. Missing identity surfaces as `commit_failed` with git's own actionable message.

---

## Recovery and resume

There are three recovery branches, each with a distinct reporter line. The branch is determined by the state of the run, not by the user's choice of command — `advance` and `retry` each cover a disjoint subset.

### Paused (`praxis advance`)

The last completed stage had `pauseAfter: true` (only `clarify-assess` after S-006). Reporter prints `praxis: resuming approved plan after <stage-id> (run <run-id>)`. No validator re-check. Dispatches the next stage.

### Recovery via `praxis advance` (validator-bearing stages)

The most recent stage status is `failed` or `cancelled` and the stage carries a validator — `clarify-assess` and `code-reviewing`. Reporter prints `praxis: recovering <stage-id> from on-disk artifact; re-validating (run <run-id>)`. Requires the artifact file to exist; the validator re-runs against on-disk content. On validator success the stage flips to `completed`/`stopReason: "recovered"` with `endedAt` refreshed; `sessionId`, `tokens`, and `usd` are preserved from the prior failed run, so recovery contributes zero new spend. On validator failure the run aborts with the validator reason and state.json is left untouched.

`praxis advance` exits 1 when the failed stage is `code-improving` (`retry only — use praxis retry <run-id>`), and for `implement` the recommended path is a fresh `praxis run` after resetting the tree.

### Retry via `praxis retry` (code-improving only)

Scoped to a failed or cancelled `code-improving`. Reporter prints `praxis: retrying code-improving (resume <sessionId>) — sending "continue" (run <runId>)`. The runner calls `runStage` with `resume: prior.sessionId` and `initialUserPrompt: "continue"`, increments `state.stages["code-improving"].retryAttempts` (default 0 → 1, etc.), and **accumulates** new tokens / USD into the existing entry rather than replacing them; `cost.totalTokens` / `cost.totalUsd` reflect the sum across attempts. Retry is unbounded.

On success the stage flips to `completed`/`stopReason: "end_turn"`, `04-code-improve.md` is rewritten verbatim from the new finalText, and `executeStages` continues with `auto-commit`. On failure the same `failStage` shape applies; tokens/USD continue to accumulate.

Out-of-scope cases exit 1:

- Failed stage is not `code-improving` → `retry only supports code-improving for now; for <stage-id> use praxis advance | fresh praxis run`.
- Prior `sessionId` missing or empty → `stopReason: "session_unresumable"`, hint to reset tree and start fresh.
- SDK signals an unresumable session mid-stream → `failed`/`stopReason: "session_unresumable"`.

### SIGINT and `cancelled`

`cancelled` stages are treated identically to `failed` by every recovery branch. SIGINT during a resumed/retried stage marks it `cancelled` exactly like a fresh `praxis run`.

---

## Reporter (`LineReporter`)

Stdout/stderr formatting:

- Stage start — `[N/5 stage-id] starting…` (`…` is U+2026).
- Stage 0 (synthesised) — `[0/5 intent] captured → 00-intent.txt`.
- Streaming assistant text — wrapped to terminal width (default 80 cols when not a TTY), prefixed ` ›`, 3-space-aligned continuations. Long bodies (> 200 chars) summarised to the first sentence (`/[.!?](\s|$)/`); fallback to the first 200 chars + `…` when no boundary matches. Streaming deltas are coalesced for 100ms and force-flushed before any structural boundary line.
- Tool use — `  › ToolName(brief)` where `brief` is the tool's salient input (Read/Edit/Write → `file_path`; Glob/Grep → `pattern`; Bash/Task → first 50 chars of `command`/`description`; `Skill` → `input.skill ?? input.name ?? ""`; unknown tools → empty).
- Tool result — silent on success; `  ✗ ToolName failed` on failure.
- Errors — written to stderr, multi-line OK; red when stderr is a TTY and `NO_COLOR` is unset.
- Stage end — artifact path, then `[N/5 stage-id] session: <id> (claude --resume <id> to inspect)`.
- Stage end (decision-driven skip on stage 4) — `[4/5 code-improving] skipped (skip-improve)`. No artifact path, no session id.
- Paused — `praxis: paused after <stage-id> — review .praxis/runs/<run-id>/<artifact>, then: praxis advance <run-id>`.
- Resume (paused) — `praxis: resuming approved plan after <stage-id> (run <run-id>)`.
- Recover — `praxis: recovering <stage-id> from on-disk artifact; re-validating (run <run-id>)`.
- Retry — `praxis: retrying <stage-id> (resume <sessionId>) — sending "continue" (run <run-id>)` (em-dash, ASCII straight quotes around `continue`). Emitted via the extended `Reporter.resuming` first-arg union (`"approved" | "recovering" | "retrying"`).
- Run done — `[run <run-id>] done|paused|failed|cancelled — commit <sha>, <tokens> tokens, $<usd>` plus a per-stage breakdown with each `sessionId`. Headline branches on terminal status.

---

## State and artifacts

Each run writes to `<cwd>/.praxis/runs/<run-id>/`:

- `state.json` — pretty-printed JSON, trailing newline. Per-stage entries carry `status`, `endedAt`, `stopReason`, `sessionId`, `tokens` (`input` / `output` / `cacheRead` / `cacheCreate`), `usd`, optional `error`, optional `retryAttempts` (serialized when > 0; only `code-improving`), and (for `auto-commit`) optional `commitSha`. Top-level `cost.totalTokens` aggregates `input + output` only — cache tokens are recorded per-stage but excluded from the running total. `cost.totalUsd` is the sum of per-stage `usd`. `currentStage` tracks the in-flight or next-to-run stage. `stopReason` values include: `end_turn`, `skipped` (clean-tree skip), `skipped-trivial` (decision-driven skip on `code-improving`), `recovered`, `commit_failed`, `validator_failed`, `timeout`, `sigint`, `session_unresumable`.
- `00-intent.txt` — raw intent verbatim.
- `01-clarify-assess.md` — agent finalText verbatim (always written, even on validator failure).
- `02-implement-log.md` — agent finalText verbatim (always written, even on timeout/SIGINT — partial log preserved).
- `03-code-review.md` — agent finalText verbatim (always written, even on validator failure). Carries the skill's native review template plus a final `## Decision` H2 (`proceed` | `skip-improve`). Not written on a clean-tree skip.
- `04-code-improve.md` — agent finalText verbatim (improvement summary). Not written on either skip path (clean-tree or decision-driven `skipped-trivial`).
- `05-commit.txt` — `<sha>\n\n<message>\n` on commit success; agent message verbatim on commit failure; not written on the skip path.

Run-id format: `${YYYY-MM-DD-HHMM-UTC}-${4-char-hex}`. `startedAt` is ISO-8601 UTC at second precision.

Each stage runs in a fresh SDK session (distinct `session_id`s persisted) and a fresh `AbortController` linked to the shared parent signal. SDK session ids are a debug aid for transcript inspection (`claude --resume <session-id>`) and are also the seed for `praxis retry` against `code-improving`; for every other stage they are debug-only.

---

## Type contracts

The internal shapes that bind the runner, the per-stage executor, and the reporter together. Stages are an internal data structure in v0.1 — there is no user-supplied config file — but the schema exists so future extensibility is cheap.

```ts
type StageConfig = {
  id: string;                               // unique within workflow
  systemPrompt: { file: string };           // path resolved against src/config/prompts/
  userPromptTemplate: string;               // {{intent}}, {{runDir}}, {{artifacts.<id>.path}} interpolation
  allowedTools?: string[];                  // SDK tool names; omit = all
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";
  model?: string;                           // SDK model id; per-stage default in defaults.ts
  maxTurns?: number;                        // omit = unbounded
  timeoutMs?: number;                       // omit = unbounded
  outputArtifact: string;                   // filename within run-dir; finalText written verbatim
  validate?: (text: string) => { ok: true } | { ok: false; reason: string };
  pauseAfter?: boolean;                     // default false
};

type PraxisConfig = {
  version: 1;
  workflow: StageConfig[];
};
```

Interpolation tokens in `userPromptTemplate`: `{{intent}}` (raw user arg), `{{runDir}}` (absolute path to the run dir), `{{artifacts.<stage-id>.path}}` (absolute path to that stage's artifact file).

Per-stage `runStage(config, ctx)` execution emits an `AgentEvent` stream and returns a `StageResult`:

```ts
type AgentEvent =
  | { type: "assistant_text"; text: string }
  | { type: "tool_use"; name: string; brief: string }   // e.g. "Read(src/foo.ts)"
  | { type: "tool_result"; name: string; ok: boolean }  // bodies omitted
  | { type: "error"; message: string };

type StageResult = {
  finalText: string;
  turns: number;
  stopReason: string;
  cancelReason?: "timeout" | "sigint";
  sessionId: string;                        // SDK-assigned; persisted + printed
  tokens: { input: number; output: number; cacheRead: number; cacheCreate: number };
  usd: number;
};
```

`runStage` takes an `AbortSignal` (SIGINT) and the `Reporter` below. `timeoutMs` is enforced inside `runStage` via `setTimeout(() => abortController.abort("timeout"), timeoutMs)` on the same `AbortController` used for SIGINT, so the abort reason (`"timeout"` vs `"sigint"`) is preserved on `cancelReason`. If `validate` is set and the first `finalText` fails, `runStage` sends a corrective user message in the same `query()` stream and waits for a second Stop. One retry only.

The SDK seam (`CreateQueryFnInput`, the input the production wrapper hands to `query()`) carries an optional `resume?: string` — when set, `runStage` threads it through to `query({ resume })` so the SDK continues a prior session instead of starting fresh. `praxis retry` is the only call site that populates it; for fresh and recovered stages it is omitted. The message-loop semantics on the runner side are identical for fresh and resumed sessions; only the seed differs.

The runner emits to the `Reporter` interface; v0.1 ships a single `LineReporter` (stdout). A future TUI is added by implementing a second `Reporter` and selecting it in `cli.ts`.

```ts
interface Reporter {
  stageStart(stage: StageConfig, idx: number, total: number): void;
  stageEvent(e: AgentEvent): void;
  stageEnd(
    stage: StageConfig,
    result: { ok: boolean; artifactPath?: string; sessionId?: string; stopReason?: string; error?: string },
  ): void;
  paused(runId: string, stageId: string, artifactPath: string): void;
  runDone(
    runId: string,
    summary: {
      commitSha?: string;
      cost: { totalTokens: number; totalUsd: number };
      perStage: Record<string, { tokens: number; usd: number; sessionId: string }>;
      status?: "completed" | "paused" | "failed" | "cancelled";
    },
  ): void;
  stage0?(total: number, intentFilename: string): void;
  resuming?(
    kind: "approved" | "recovering" | "retrying",
    runId: string,
    stageId: string,
    sessionId?: string,                       // populated for "retrying"
  ): void;
}
```

`stageEnd` carries the persisted `stopReason` so the formatter can branch — currently the only consumer is the `[4/5 code-improving] skipped (skip-improve)` line for `stopReason: "skipped-trivial"`. The plain success / failure paths leave it undefined. `resuming` is invoked via `reporter.resuming?.(...)` so non-CLI reporters can skip it; `sessionId` is required for `kind: "retrying"` and omitted for `"approved"` / `"recovering"`.

---

## Tooling

- TypeScript ≥ 5, strict mode + `verbatimModuleSyntax`, ESM (`"type": "module"`), Node ≥ 20.
- Build via `tsdown` (rolldown + oxc) → single `dist/cli.js` with sourcemaps. The `praxis` bin entry is `dist/cli.js` with `#!/usr/bin/env node` preserved from source. `tsc --noEmit` is the typecheck; tsdown does the actual emit. Build runs in ~15ms.
- Runtime deps (`@anthropic-ai/claude-agent-sdk`, `zod`) are kept external — users get them via `npm install`, not bundled into the CLI artifact.
- Prompt `.md` files in `src/config/prompts/` are copied into `dist/config/prompts/` by tsdown's `copy` step; the runtime loader resolves them via a layout-detection helper that handles both the bundled (dist) and source-via-tsx (src) directory shapes. Locked by a build-smoke regression test.
- Tests run on Vitest. Layout: `tests/` mirrors `src/`, plus `tests/e2e/`. Real fs and real git in `mkdtemp` temp dirs (cleaned per-test). The SDK is the only seam stubbed — every test scripts SDK message streams via `tests/support/scripted-query.ts`, so the suite makes no real API calls and incurs no cost. Suite size: 193 tests across 25 files, all green.
- Lint and format are handled by **Biome** (single Rust binary, replaces ESLint + Prettier). `npm run lint` checks; `npm run format` applies fixes. Configured to match the codebase's existing style (2-space indent, double quotes, trailing commas). Tests have `noNonNullAssertion` relaxed via override since `!` on known-defined fixture values is idiomatic.

## End-to-end validation

### Scripted-SDK e2e (in-suite, no real spend)

- `tests/e2e/auto-commit.test.ts` drives all five stages (clarify-assess → implement → code-reviewing → code-improving → auto-commit) with a scripted SDK, real git, and the production `commit()`. HEAD advances by exactly one commit; `state.commitSha` matches the new HEAD; `05-commit.txt` carries the SHA-prefixed form.
- `tests/e2e/retry-flow.test.ts` drives a SIGINT-cancelled `code-improving`, then `praxis retry` resumes the prior SDK session with `initialUserPrompt: "continue"`, the agent's improvement summary lands in `04-code-improve.md`, and `auto-commit` lands one real commit. The persisted `state.json` reflects `retryAttempts === 1` and the sessionId rotation.

### Real-SDK smoke (live, periodic)

The full pipeline has been exercised against the real `@anthropic-ai/claude-agent-sdk` against the tsdown bundle.

**Pre-5-stage runs (legacy 3-stage shape):**

- Run `2026-04-26-1413-dc71` — `add a top-level CONTRIBUTING.md` against a throwaway repo, ~3.8K tokens, $0.36. All stages completed with distinct session ids; the SHA-prefixed commit artifact matched the new HEAD. (Pre-dates the 5-stage rename; the run wrote the commit artifact under the legacy filename slot.)
- Run `2026-04-26-1521-4b4e` — `add PRAXIS_SMOKE.txt`, post-tsdown-migration verification, ~4.4K tokens, $0.36. Same shape; confirmed the bundled-layout path resolution works end-to-end against the real SDK.

**5-stage runs (current shape, with `praxis` plugin installed at user scope):**

- Run `2026-04-28-0921-e8f4` — `add a top-level NOTES.md` against a throwaway repo. **5425 tokens, $0.7244.** Five stages ran; `praxis:code-reviewing` skill invoked successfully via the `Skill` tool, emitted a "review skipped" trivial-change short-circuit; `## Decision: skip-improve` parsed correctly; stage 4 marked `completed`/`stopReason: "skipped-trivial"` (no SDK call, no `04-code-improve.md`); stage 5 ran and landed commit `c9dbd8e`. `05-commit.txt` is the SHA-prefixed form. The `[4/5 code-improving] skipped (skip-improve)` reporter line emitted as designed.
- Run `2026-04-28-0924-f628` — `add a small Python script scripts/today.py`. **6349 tokens, $0.6516.** Same shape: full review produced verbatim, decision = `skip-improve`, stage 4 short-circuited, commit `bd25f51` landed.
- Run `2026-04-28-0928-0849` — `add src/userValidator.ts with email + password validators plus vitest tests`. **9573 tokens, $0.9207.** Five stages ran; `praxis:code-reviewing` skill produced a substantive 5-layer review (data structures, special cases, complexity, breaking changes, practicality) that found zero Critical/High/Medium findings and decided `skip-improve`. Commit `28a3ec4` landed.

**`praxis retry` live CLI guards** — exercised against a completed run-id, a malformed run-id, and a non-existent valid-format run-id. All three matched the milestone's spec messages exactly: "run is already complete" / "invalid run-id: <id>. Expected shape …" with exit 1 on the malformed cases.

**Total live-smoke spend: $2.30 across the three 5-stage runs above.**

**Coverage gaps the live smoke did NOT exercise** (covered by scripted-SDK e2e in `tests/e2e/retry-flow.test.ts` and `tests/workflow/retry.test.ts`):

- Stage 4 actually invoking `praxis:code-improving` with `Decision: proceed` against the live SDK — the `praxis:code-reviewing` skill consistently chose `skip-improve` in the small-throwaway-repo smoke variants because every change was below the trivial threshold.
- Live retry resume of a failed `code-improving` SDK session — to force this against the real SDK would require either a deliberately-suboptimal implementation or a SIGINT mid-stage-4. Both paths are validated end-to-end by `tests/e2e/retry-flow.test.ts` (real git commit + SIGINT-triggered cancel + retry resume) and `tests/workflow/retry.test.ts` (10 mechanic tests pinning `resume`/`continue` wiring, retryAttempts, token/USD accumulation, session_unresumable detection).

See [`../README.md`](../README.md#smoke-run-against-the-real-sdk) for the smoke procedure and checklist.
