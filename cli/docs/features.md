# Features

What currently ships and is verified to work. Add an entry here only after the behavior is implemented and exercised end-to-end.

Track planned work in [backlog.md](backlog.md). The product.md document remains the design source of truth.

## Shipped

### S-006 auto-commit produces a real commit

**Shipped:** 2026-04-26
**Spec reference:** product.md §5.4, §9, §10, §11

The auto-commit stage now lands a real `git commit` rather than a stubbed no-op. `commit(cwd, message)` (in `src/git/commit.ts`) runs `git status --porcelain` first; an empty tree returns `{ ok: true, skipped: true }` without touching the repo, otherwise it stages everything (`git add -A`), commits with the agent's verbatim message (`git commit -m`), and reads back the new HEAD via `git rev-parse HEAD` to return `{ ok: true, sha }`. Any non-zero git invocation collapses to `{ ok: false, reason: <stderr.trim()> }`. The runner adds a pre-check: when the working tree is clean before auto-commit's `runStage`, the SDK call is skipped entirely and the stage is synthesised as `completed` with `stopReason: "skipped"` (no sessionId/tokens/usd, no `03-commit.txt`, no `deps.commit` invocation). On commit success, the runner overwrites `03-commit.txt` with `<sha>\n\n<message>\n` and stamps `state.stages["auto-commit"].commitSha = sha`; `summarize()` reads that field onto `RunSummary.commitSha` so `LineReporter.formatRunDone` (already wired in S-003) prints the SHA on the final line. On commit failure the stage flips to `status: "failed"`, `stopReason: "commit_failed"`, `error: <reason>`, while `03-commit.txt` keeps the agent message only (no SHA prefix). The S-005 stub stderr notice (`praxis: auto-commit message ready; git commit not yet wired (lands in S-006)`) is gone. `withTempRepo` now configures local-scope `user.email`/`user.name` after `git init` so tests work on machines without a global git identity (CI, fresh containers).

- Inputs: same `praxis run` / `praxis advance` surface; no new flags. Requires `user.email` and `user.name` configured (globally or locally) for `git commit -m` to succeed.
- Outputs: a real commit on every run that produced any change. `03-commit.txt` rewritten with the SHA prefix (`<sha>\n\n<message>\n`); `state.stages["auto-commit"].commitSha` populated; run-done line surfaces `commit <sha>`. Skipped runs (clean tree) leave HEAD untouched and emit no `03-commit.txt`.
- Notable bounds:
  - The pre-check runs after `reporter.stageStart` so users still see the `[3/3 auto-commit]` line for the skipped path; only the SDK call and `deps.commit` are short-circuited.
  - `--allow-dirty` bundles pre-existing dirty (tracked + untracked) into the same commit because `git add -A` captures everything; documented per §5.4 trade-off.
  - Multi-line commit messages preserve newlines natively — `spawnSync` receives argv as a single string, no shell quoting.
  - Pre-commit hook side effects surface through `{ ok: false, reason }` and become `stopReason: "commit_failed"`; the SHA is not captured.
  - `commitSha` is undefined on skipped and failed paths; the formatter handles both.
- Verified by:
  - `cli/tests/git/commit.test.ts` — AC-1 happy path with `git rev-parse HEAD`/`git log -1 --pretty=%s` cross-check; AC-2 empty-tree skip with no HEAD created; AC-3 stderr-as-reason on non-git directory; AC-10 `--allow-dirty` bundles modified + untracked + run-produced files into one commit; AC-12 absence of the S-005 stub stderr notice.
  - `cli/tests/workflow/implement.test.ts` — AC-2 advance-from-paused asserts SHA-prefixed `03-commit.txt` and `commitSha` in state; AC-3 `--no-pause` 3-stage flow asserts SHA prefix; AC-5 clean-tree skip path (no SDK call, no `deps.commit`, no `03-commit.txt`); AC-6 commit-failure path; AC-7 `RunSummary.commitSha` plumbing onto `runDone`.
  - `cli/tests/support/tmp-repo.test.ts` — AC-11 local-scope `user.email`/`user.name` set after `git init`.
  - `cli/tests/e2e/auto-commit.test.ts` — AC-8 `runWorkflow --no-pause` end-to-end: HEAD advances by exactly one commit with the agent's message as subject and `state.commitSha === git rev-parse HEAD`; AC-9 same outcome via `advanceWorkflow` from a paused-after-clarify-assess run.

### S-005 implement stage end-to-end (commit hand-off stubbed)

**Shipped:** 2026-04-26
**Spec reference:** product.md §5.3, §5.4, §7, §11

A `praxis run "<intent>" --no-pause` (or `praxis advance <run-id>` from a paused clarify-assess) now drives the implement and auto-commit stages through the same SDK seam clarify-assess uses. `sdkCreateQueryFn` forwards `allowDangerouslySkipPermissions: true` whenever `permissionMode === "bypassPermissions"` (and only then), satisfying the SDK's documented gate for the implement stage. The runner writes `02-implement-log.md` verbatim from the agent's `finalText` (no validator, no trailing newline added) and `03-commit.txt` verbatim from the auto-commit stage's `finalText`; both stages transition through `running → completed` in `state.json` with their own session id, tokens, usd, and `endedAt`. Each stage opens a fresh SDK session (distinct `session_id`s persisted) and a fresh `AbortController` linked to the shared parent signal. The `Deps` interface gains a `commit(cwd, message)` slot the runner invokes once after auto-commit completes successfully; the production wrapper is a no-op-with-warning stub that prints `praxis: auto-commit message ready; git commit not yet wired (lands in S-006)` to stderr (real `git add -A && git commit -m` body lands in S-006). On implement timeout or SIGINT, `runStage` now mirrors the cancel reason into `stopReason` (so `state.json` reads `stopReason: "timeout"` / `"sigint"` instead of an empty string), the partial `02-implement-log.md` is still written, the stage is marked `failed`/`cancelled`, and the auto-commit stage is skipped — `deps.commit` never fires.

- Inputs: same `praxis run` / `praxis advance` surface, plus `--no-pause` for autopilot through implement + auto-commit.
- Outputs: `02-implement-log.md` (verbatim agent finalText), `03-commit.txt` (verbatim commit message), updated `state.json`. Stderr notice from the production commit stub on the happy path.
- Notable bounds:
  - `Deps.commit` is required by the type but defaulted to a no-op-with-warning in the CLI wiring; tests inject spies for assertion.
  - The auto-commit hand-off triggers strictly on `stage.id === "auto-commit"` in v0.1 (no per-stage flag) — the workflow is locked, so the magic string is the simplest correct trigger.
  - Implement timeout / SIGINT: `cancelReason` overrides any prior SDK `stopReason` UNLESS the prior value is a Praxis-specific token (`validator_failed` or `recovered`) — those take precedence so the harness never clobbers them.
  - Implement deliberately omits `allowedTools` so the SDK defaults to all tools; `bypassPermissions` is the gate that opens write/exec.
  - Each stage gets its own `AbortSignal` via the per-stage `stageAbort` controller — verified across all three stages in a `--no-pause` run.
  - Real `git add -A && git commit -m` is NOT performed in S-005. The stub prints a notice and returns `{ ok: true }` so the runner classifies the stage as completed.
- Verified by:
  - `cli/tests/workflow/sdk-create-query.test.ts` — AC-1 `allowDangerouslySkipPermissions` paired with `bypassPermissions`; omitted for `default` and unset modes.
  - `cli/tests/workflow/implement.test.ts` — AC-2 advance-from-paused happy path with commit spy, AC-3 `--no-pause` 3-stage flow, AC-4 implement timeout, AC-5 implement SIGINT, AC-6 SDK option forwarding for implement, AC-7 tool_use/tool_result event translation with Read/Edit briefs, AC-8 verbatim implement log, AC-10 fresh sessionId + AbortSignal per stage.
  - `cli/tests/workflow/implement-fs-mutation.test.ts` — AC-9 sociable test where the seam writes a real file and the runner observes via `existsSync`.

### S-004 `praxis advance` + SIGINT-safe recovery

**Shipped:** 2026-04-26
**Spec reference:** product.md §4, §11

`praxis advance <run-id>` resumes a paused run or recovers a failed/cancelled stage from the on-disk artifact, without ever re-running pre-flight or touching `.gitignore`. The CLI parses `<run-id>` against the canonical `YYYY-MM-DD-HHMM-xxxx` shape and rejects unknown flags before any disk read; `--no-pause` is the one accepted flag and carries the same autopilot semantics as on `run`. A new `readState(runDir)` does structural validation of `state.json` (top-level fields, stage map, status enum) and fails fast on missing/corrupt/schema-bad files. The runner branches on the first non-`completed` stage's status: a `pending` stage whose predecessor is `completed` and `pauseAfter: true` takes the paused path (no validator re-check, dispatch the next stage); `failed` or `cancelled` takes the recovery path (validate the on-disk artifact if the stage has a `validate`, on success flip status to `completed`/`stopReason: "recovered"` with `endedAt` refreshed and prior `sessionId`/`tokens`/`usd` preserved, then dispatch the rest of the workflow). Missing artifact and validator-rejection both surface a single-line stderr message and exit 1 without mutating state.json. `pending` with no paused predecessor and `running` exit 1 with `not in a resumable state`; an already-fully-completed run exits 1 with `already complete`. SIGINT during a resumed stage marks it `cancelled` exactly like in `run`, and `runDone` fires once on every terminal path with cumulative cost = prior totals + only the newly-executed stages' spend. The `Reporter` interface gains an optional `resuming?(kind, runId, stageId)` method; `LineReporter` implements both `("approved", …)` → `praxis: resuming approved plan after <stage-id> (run <run-id>)` and `("recovering", …)` → `praxis: recovering <stage-id> from on-disk artifact; re-validating (run <run-id>)` per spec §11.

- Inputs: `praxis advance [--no-pause] <run-id>`. Run-id must match `YYYY-MM-DD-HHMM-xxxx` (4 hex chars).
- Outputs: same artifact / state.json / line-reporter shape as `run`, plus the §11 resuming/recovering headline. Exit 0 on success (whether the workflow completes or pauses again); exit 1 on any non-resumable state, missing artifact, or validator rejection.
- Notable bounds:
  - Pre-flight is intentionally skipped — `.gitignore` is not appended on advance, and dirty trees do not block.
  - Recovery preserves `sessionId`, `tokens`, and `usd` from the prior failed run; it does NOT increment `cost.totalTokens`/`cost.totalUsd`. Newly-executed stages still add their own spend.
  - Validator failure during recovery leaves `state.json` untouched (status stays `failed`/`cancelled`) so the user can edit and retry. Missing artifact errors include the absolute file path.
  - `cancelled` is treated identically to `failed` by the recovery path (AC-7), including the validator re-check.
  - The resume-point scanner picks the FIRST non-completed stage in workflow order; hand-edited non-monotonic statuses are tolerated.
  - `executeStages` was refactored to take a `startIndex` so the resumed stage's existing `sessionId`/cost rows survive untouched.
  - `Reporter.resuming?` is optional — `RecordingReporter` and other test spies simply skip the §11 line; the runner invokes via `reporter.resuming?.(...)`.
- Verified by:
  - `cli/tests/workflow/state-read.test.ts` — AC-2 readState structural validation (missing, bad JSON, missing fields, bad stages map, unknown status, well-formed).
  - `cli/tests/workflow/advance.test.ts` — invalid statuses (AC-8/9), paused happy path + currentStage advance + no-gitignore (AC-3/10/11), recovery happy/missing-artifact/validator-fail/cancelled (AC-4/5/6/7), SIGINT (AC-12), Reporter.resuming wiring on both paths (AC-13), runDone-once + cost preservation across success/failure (AC-14), `--no-pause` honored on advance (AC-15).
  - `cli/tests/ui/line-formatter.test.ts` + `cli/tests/ui/line-reporter.test.ts` — `formatResuming` and `LineReporter.resuming` for both kinds (AC-13).
  - `cli/tests/e2e/advance-cli.test.ts` — argv parsing, run-id format check, unknown flag rejection (AC-1) plus end-to-end CLI surface for missing state.json (AC-2) and already-complete run (AC-9).

### S-003 LineReporter + `--no-pause`

**Shipped:** 2026-04-26
**Spec reference:** product.md §4, §5.1, §8

`LineReporter` (stdout/stderr) now formats every §8 line: stage start as `[N/total stage-id] starting…`, streaming assistant text wrapped to terminal width with a ` ›` prefix and 3-space-aligned continuations, tool use as `  › ToolName(brief)` with input-aware briefs (Read/Edit/Write → file_path, Glob/Grep → pattern, Bash/Task → truncated command/description), tool results silent on success and `  ✗ ToolName failed` on failure, errors written to stderr (red when stderr is a TTY and `NO_COLOR` is unset), stage end as artifact + session + done/failed lines, paused replacing the legacy direct stdout hint, and `runDone` printing totals + per-stage breakdown on every terminal path. Streaming text deltas are coalesced for 100ms via `EventBuffer` and force-flushed before every structural boundary line. Stage 0 (intent capture) is synthesised by the runner as `[0/N intent] captured → 00-intent.txt` without a Reporter interface change. `--no-pause` is parsed by `cli.ts` and threaded through `RunWorkflowContext.noPause` so autopilot runs through every `pauseAfter: true` stage. Long assistant bodies (> 200 chars) are summarised to the first sentence (`/[.!?](\s|$)/`) and fall back to the first 200 chars + `…` when no boundary matches.

- Inputs: same `praxis run` surface plus optional `--no-pause`. Reporter is constructed once in `cli.ts` and threaded via `Deps.reporter`.
- Outputs: structured stdout + stderr lines per §8; identical state.json and artifact behaviour.
- Notable bounds:
  - Reporter interface gains one §8-extension method: optional `stage0?(total, intentFilename)` so the runner can synthesise the stage-0 line without inventing a `StageConfig`.
  - `RunSummary` carries an optional `status: "completed" | "paused" | "failed" | "cancelled"` so `runDone`'s headline reads "done" / "paused" / "failed" / "cancelled" (default "done" for back-compat). Tokens and USD always reflect actual spend regardless of status.
  - `Deps.reporter` is required; `RunWorkflowContext.reporter` was removed. `runStage` reads the reporter from `ctx.reporter` only — `Pick<Deps, "createQueryFn">` narrowing on `runStage` is preserved.
  - `runDone` is called on success, paused, and failed/cancelled paths uniformly with the matching `status`.
  - `EventBuffer.flush()` is invoked before stageStart, stageEnd, paused, runDone, and any non-text stageEvent so coalesced text always lands before the next structural line.
  - Tool-result name resolution uses a per-stage `tool_use_id → name` cache; unknown ids fall back to `Tool`.
  - Color is enabled only when stderr is a TTY and `NO_COLOR` is unset; e2e CLI runs set `NO_COLOR=1` so output stays plain.
- Verified by:
  - `cli/tests/ui/line-formatter.test.ts` — every formatter rule (AC-2/4/5/7/8/9/10/11/12 + AC-3 stage 0 helper).
  - `cli/tests/ui/brief.test.ts` — AC-16 input-mapper table + truncation.
  - `cli/tests/ui/event-buffer.test.ts` — AC-6 100ms coalesce window with `vi.useFakeTimers` and the injectable scheduler.
  - `cli/tests/ui/line-reporter.test.ts` — composer behaviour, color toggle, structural-boundary flush ordering.
  - `cli/tests/workflow/reporter-orchestration.test.ts` — runner uses `Deps.reporter` (AC-15), drops the legacy stdout pause line (AC-11), calls `runDone` on every terminal path (AC-12), `--no-pause` overrides `pauseAfter` (AC-13), Stage 0 line lands before stage 1 (AC-3).
  - `cli/tests/workflow/stage-events.test.ts` — `runStage` emits `assistant_text`/`tool_use`/`tool_result` AgentEvents with the `id`-cached tool name and `is_error` translation.
  - `cli/tests/e2e/run-walking-skeleton.test.ts` — manual flag parser still rejects unknown flags (AC-14 negative case) before any disk write.

### S-002 pre-flight + clarify-assess via SDK seam

**Shipped:** 2026-04-26
**Spec reference:** product.md §5.2, §6, §7, §9, §10

`praxis run [--allow-dirty] "<intent>"` now runs pre-flight (git-repo gate; dirty-tree gate with `--allow-dirty` override; idempotent `.praxis/` append to `.gitignore`), executes the `clarify-assess` stage against `@anthropic-ai/claude-agent-sdk`'s `query()` through a `CreateQueryFn` seam, validates the artifact's H2 schema with one corrective retry on failure, writes the artifact verbatim to `01-clarify-assess.md`, updates `state.json` with per-stage status / sessionId / tokens / usd, and pauses with a stdout `praxis advance <run-id>` hint. `implement` and `auto-commit` are configured but not yet executed.

- Inputs: positional `<intent>` plus optional `--allow-dirty`.
- Outputs: `00-intent.txt`, `01-clarify-assess.md` (verbatim agent finalText, written even on validator failure), updated `state.json`, stdout pause hint.
- Notable bounds:
  - Pre-flight runs before any disk write — failures leave no orphan `.praxis/`.
  - Validator retry is a single corrective user message in the same `query()` stream; second failure marks the stage `failed` with `stopReason: "validator_failed"` and exits 1.
  - `cost.totalTokens` aggregates `input + output` only; cache tokens are recorded per stage but not summed into the running total.
  - Per-stage `model`, `permissionMode`, `allowedTools`, `settingSources: ["user","project"]`, and the interpolated user prompt are forwarded to `createQueryFn`.
  - `.gitignore` append is line-exact (`.praxis/foo` does not satisfy) and idempotent across runs; existing newline state is respected.
- Verified by:
  - `cli/tests/config/defaults.test.ts` (zod schema + pinned models / artifacts / pauseAfter / validator)
  - `cli/tests/workflow/validator.test.ts` (H2 order, missing sections, empty / whitespace bullets)
  - `cli/tests/workflow/preflight.test.ts` (non-git, dirty + remediation, multi-file dirty list, `--allow-dirty` override, no-orphan run-dir, `.gitignore` append idempotency + newline + line-exact match)
  - `cli/tests/workflow/orchestration.test.ts` (createQueryFn argument forwarding, happy-path artifact + state + pause + non-execution of downstream stages, validator retry choreography, terminal failure, `--allow-dirty` runner override)
  - `cli/tests/e2e/run-walking-skeleton.test.ts` (CLI parses `--allow-dirty`, surfaces dirty-tree blocker, blocks non-git)
  - `cli/tests/e2e/build-smoke.test.ts` (built `dist/cli.js` blocks pre-flight on non-git without an SDK call)

### S-001 walking skeleton

**Shipped:** 2026-04-26
**Spec reference:** product.md §4, §9, §12

`praxis run "<intent>"` bootstraps a fresh run dir under `<cwd>/.praxis/runs/<run-id>/`, writes the raw intent to `00-intent.txt`, and emits a §9-shaped `state.json` with all three stages marked `pending` and `currentStage: "clarify-assess"`. The §12 module scaffold is in place; stage execution is still stubbed and the `createQueryFn` DI seam is wired through `runStage` for later slices.

- Inputs: a single positional `<intent>` string.
- Outputs: run-id printed to stdout (matches `^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}-[0-9a-f]{4}$`); `00-intent.txt` (verbatim, no trailing newline); `state.json` (pretty-printed §9 schema).
- Notable bounds: empty/whitespace and missing intents fail closed with a stderr message and no `.praxis/runs/` side effects. Run-id timestamp is UTC. No pre-flight, no `.gitignore` append, no agent execution yet.
- Verified by: `cli/tests/e2e/run-walking-skeleton.test.ts`, `cli/tests/e2e/build-smoke.test.ts`, `cli/tests/workflow/run-id.test.ts`, `cli/tests/workflow/runner.test.ts`, `cli/tests/support/scripted-query.test.ts`.

## Format

When entries are added, use this shape:

```
### <feature-or-stage-id>

**Shipped:** <YYYY-MM-DD>
**Spec reference:** product.md §<section>

<one-paragraph behavior summary>

- Inputs: …
- Outputs: …
- Notable bounds / edge cases: …
- Verified by: <test path or manual repro>
```

Keep entries grounded in observed behavior, not intent. If a feature is partially implemented, file the missing pieces in `backlog.md` and describe only the shipped slice here.
