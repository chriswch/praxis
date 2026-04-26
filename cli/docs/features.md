# Features

What Praxis CLI currently provides. The authoritative behavioral spec is [`../product.md`](../product.md). Open work and known issues are tracked in [backlog.md](backlog.md).

---

## Commands

### `praxis run "<intent>"`

Starts a new workflow run in the current directory. Prints a run-id (format `YYYY-MM-DD-HHMM-xxxx`, UTC) to stdout and creates `<cwd>/.praxis/runs/<run-id>/`.

Flags:

- `--allow-dirty` — proceed when the working tree has uncommitted changes. Pre-existing dirt will be bundled into the auto-commit by `git add -A` (documented trade-off).
- `--no-pause` — disable all `pauseAfter` gates; full autopilot through every stage.

Empty / whitespace / missing intent fails closed with exit 1 and no `.praxis/` side effects.

### `praxis advance <run-id>`

Resumes a paused run, or recovers a failed/cancelled stage from the on-disk artifact. Validates the run-id format and rejects unknown flags before any disk read.

Flags:

- `--no-pause` — same autopilot semantics as on `run`.

Pre-flight does NOT run on `advance`: the run dir is already initialised and `.gitignore` was already touched up by the original `praxis run`.

Exits 1 with `not in a resumable state` for `pending` / `running` stages, or `already complete` for fully-completed runs.

---

## Pre-flight

Runs at the start of `praxis run`, before any disk write:

1. Block when not inside a git work tree.
2. Block on a dirty working tree unless `--allow-dirty`; print the dirty file list and remediation hints (commit / stash / `--allow-dirty`).
3. Append `.praxis/` to `.gitignore` if missing — line-exact match, idempotent across runs, existing newline state preserved.

A failed pre-flight leaves no orphan `.praxis/` directory on disk.

---

## Workflow stages

Three sequential stages, each running in a fresh Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) session. Stages communicate by writing artifact files; downstream stages reference them by absolute path and the agent reads them via the Read tool.

### Stage 0 — intent capture

Writes the raw `<intent>` argument to `00-intent.txt` verbatim (no trailing newline). No agent invoked.

### Stage 1 — `clarify-assess`

Read-only repo survey. `permissionMode: "default"`, allowlist `[Read, Glob, Grep, Bash]`. Pinned model `claude-opus-4-7`. 15-minute timeout. Pauses afterward unless `--no-pause`.

Emits a markdown artifact `01-clarify-assess.md` with five H2 headings in fixed order: `Intent`, `Assumptions`, `Gaps`, `Plan`, `Acceptance` (with ≥1 non-empty bullet under Acceptance). The harness validates this schema after the agent's Stop event. On schema failure the harness sends one corrective user message in the same `query()` stream; a second failure marks the stage `failed`/`stopReason: "validator_failed"` and exits 1. The partial artifact is written to disk in either case so the user can hand-edit and `praxis advance`.

### Stage 2 — `implement`

Full-tools execution. `permissionMode: "bypassPermissions"` (paired with `allowDangerouslySkipPermissions: true` per the SDK's requirement). Pinned model `claude-opus-4-7`. 30-minute timeout. Auto-advances to auto-commit.

The user prompt references `01-clarify-assess.md` by absolute path; the agent reads it via the Read tool. Writes `02-implement-log.md` verbatim from the agent's final assistant message (no validator). Timeout marks the stage `failed`/`stopReason: "timeout"`; SIGINT marks it `cancelled`/`stopReason: "sigint"`. In both cases the partial log is preserved and the downstream auto-commit stage is skipped.

> **Risk:** the implement stage runs with `bypassPermissions` against `process.cwd()`. The agent can run `rm`, `git push`, network installers, and overwrite files outside its declared scope. **Use only on repos you can roll back.**

### Stage 3 — `auto-commit`

Generates a Conventional-Commits message and lands a real commit. `permissionMode: "default"`, allowlist `[Bash]`. Pinned model `claude-haiku-4-5-20251001`. 5-minute timeout.

Pre-stage check: if `git status --porcelain` is empty before invoking the stage, the SDK call is skipped entirely; the stage is marked `completed`/`stopReason: "skipped"` (no sessionId/tokens/usd, no `03-commit.txt`, HEAD untouched).

Otherwise, after the agent emits the commit message, the harness runs `git add -A` and `git commit -m <message>` directly (not via the agent). On success, the new HEAD SHA is captured and `03-commit.txt` is written as `<40-char-sha>\n\n<message>\n`; the SHA also lands on `state.stages["auto-commit"].commitSha` and on the run-done line. On commit failure (e.g., missing git identity, pre-commit hook failure), the stage flips to `failed`/`stopReason: "commit_failed"` with git's stderr captured in `error`; `03-commit.txt` keeps the agent message verbatim (no SHA prefix).

> **Git identity required.** `git commit -m` needs `user.email` and `user.name` set, globally (`git config --global user.email …`) or per-repo. Missing identity surfaces as `commit_failed` with git's own actionable message.

---

## Recovery and resume

`praxis advance <run-id>` branches via spec §11 log lines:

- **Paused** (the last completed stage had `pauseAfter: true`): `praxis: resuming approved plan after <stage-id> (run <run-id>)`. No validator re-check. Dispatches the next stage.
- **Recovery** (most recent stage status is `failed` or `cancelled`): `praxis: recovering <stage-id> from on-disk artifact; re-validating (run <run-id>)`. Requires the artifact file to exist; if the stage has a validator, re-runs it against on-disk content. On validator success the stage flips to `completed`/`stopReason: "recovered"` with `endedAt` refreshed; `sessionId`, `tokens`, and `usd` are preserved from the prior failed run, so recovery contributes zero new spend. On validator failure the run aborts with the validator reason and state.json is left untouched.

`cancelled` stages are treated identically to `failed` by the recovery path. SIGINT during a resumed stage marks it `cancelled` exactly like a fresh `praxis run`.

There is no `praxis retry`; recovery is `advance` against a hand-edited artifact, or a fresh `praxis run` after resetting the tree.

---

## Reporter (`LineReporter`)

Stdout/stderr formatting per `product.md §8`:

- Stage start — `[N/total stage-id] starting…`
- Stage 0 (synthesised) — `[0/3 intent] captured → 00-intent.txt`
- Streaming assistant text — wrapped to terminal width (default 80 cols when not a TTY), prefixed ` ›`, 3-space-aligned continuations. Long bodies (> 200 chars) summarised to the first sentence (`/[.!?](\s|$)/`); fallback to the first 200 chars + `…` when no boundary matches. Streaming deltas are coalesced for 100ms and force-flushed before any structural boundary line.
- Tool use — `  › ToolName(brief)` where `brief` is the tool's salient input (Read/Edit/Write → `file_path`; Glob/Grep → `pattern`; Bash/Task → first 50 chars of `command`/`description`; unknown tools → empty).
- Tool result — silent on success; `  ✗ ToolName failed` on failure.
- Errors — written to stderr, multi-line OK; red when stderr is a TTY and `NO_COLOR` is unset.
- Stage end — artifact path, then `[N/total stage-id] session: <id> (claude --resume <id> to inspect)`.
- Paused — `praxis: paused after <stage-id> — review .praxis/runs/<run-id>/<artifact>, then: praxis advance <run-id>`.
- Run done — `[run <run-id>] done|paused|failed|cancelled — commit <sha>, <tokens> tokens, $<usd>` plus a per-stage breakdown with each `sessionId`. Headline branches on terminal status.

---

## State and artifacts

Each run writes to `<cwd>/.praxis/runs/<run-id>/`:

- `state.json` — pretty-printed JSON per `product.md §9`, trailing newline. Per-stage entries carry `status`, `endedAt`, `stopReason`, `sessionId`, `tokens` (`input` / `output` / `cacheRead` / `cacheCreate`), `usd`, optional `error`, and (for auto-commit) optional `commitSha`. Top-level `cost.totalTokens` aggregates `input + output` only — cache tokens are recorded per-stage but excluded from the running total. `cost.totalUsd` is the sum of per-stage `usd`. `currentStage` tracks the in-flight or next-to-run stage.
- `00-intent.txt` — raw intent verbatim.
- `01-clarify-assess.md` — agent finalText verbatim (always written, even on validator failure).
- `02-implement-log.md` — agent finalText verbatim (always written, even on timeout/SIGINT — partial log preserved).
- `03-commit.txt` — `<sha>\n\n<message>\n` on commit success; agent message verbatim on commit failure; not written on the skip path.

Run-id format: `${YYYY-MM-DD-HHMM-UTC}-${4-char-hex}`. `startedAt` is ISO-8601 UTC at second precision.

Each stage runs in a fresh SDK session (distinct `session_id`s persisted) and a fresh `AbortController` linked to the shared parent signal. SDK session ids are a debug aid only — Praxis does not resume them across processes; use `claude --resume <session-id>` to inspect a transcript.

---

## Tooling

- TypeScript ≥ 5, strict mode + `verbatimModuleSyntax`, ESM (`"type": "module"`), Node ≥ 20.
- Build via `tsdown` (rolldown + oxc) → single `dist/cli.js` with sourcemaps. The `praxis` bin entry is `dist/cli.js` with `#!/usr/bin/env node` preserved from source. `tsc --noEmit` is the typecheck; tsdown does the actual emit. Build runs in ~15ms.
- Runtime deps (`@anthropic-ai/claude-agent-sdk`, `zod`) are kept external — users get them via `npm install`, not bundled into the CLI artifact.
- Prompt `.md` files in `src/config/prompts/` are copied into `dist/config/prompts/` by tsdown's `copy` step; the runtime loader resolves them via a layout-detection helper that handles both the bundled (dist) and source-via-tsx (src) directory shapes. Locked by a build-smoke regression test.
- Tests run on Vitest. Layout: `tests/` mirrors `src/`, plus `tests/e2e/`. Real fs and real git in `mkdtemp` temp dirs (cleaned per-test). The SDK is the only seam stubbed — every test scripts SDK message streams via `tests/support/scripted-query.ts`, so the suite makes no real API calls and incurs no cost. Suite size: 193 tests across 25 files, all green.
- Lint and format are handled by **Biome** (single Rust binary, replaces ESLint + Prettier). `npm run lint` checks; `npm run format` applies fixes. Configured to match the codebase's existing style (2-space indent, double quotes, trailing commas). Tests have `noNonNullAssertion` relaxed via override since `!` on known-defined fixture values is idiomatic.

## End-to-end validation

The full pipeline has been exercised against the real `@anthropic-ai/claude-agent-sdk` against the tsdown bundle:

- Run `2026-04-26-1413-dc71` — `add a top-level CONTRIBUTING.md` against a throwaway repo, ~3.8K tokens, $0.36. All three stages completed with distinct session ids; SHA-prefixed `03-commit.txt` matched the new HEAD.
- Run `2026-04-26-1521-4b4e` — `add PRAXIS_SMOKE.txt`, post-tsdown-migration verification, ~4.4K tokens, $0.36. Same shape; confirmed the bundled-layout path resolution works end-to-end against the real SDK.

See [`../README.md`](../README.md#smoke-run-against-the-real-sdk) for the smoke procedure and checklist.
