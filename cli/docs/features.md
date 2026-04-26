# Features

What currently ships and is verified to work. Add an entry here only after the behavior is implemented and exercised end-to-end.

Track planned work in [backlog.md](backlog.md). The product.md document remains the design source of truth.

## Shipped

### S-003 LineReporter + `--no-pause`

**Shipped:** 2026-04-26
**Spec reference:** product.md §4, §5.1, §8

`LineReporter` (stdout/stderr) now formats every §8 line: stage start as `[N/total stage-id] starting…`, streaming assistant text wrapped to terminal width with a ` ›` prefix and 3-space-aligned continuations, tool use as `  › ToolName(brief)` with input-aware briefs (Read/Edit/Write → file_path, Glob/Grep → pattern, Bash/Task → truncated command/description), tool results silent on success and `  ✗ ToolName failed` on failure, errors written to stderr (red when stderr is a TTY and `NO_COLOR` is unset), stage end as artifact + session + done/failed lines, paused replacing the legacy direct stdout hint, and `runDone` printing totals + per-stage breakdown on every terminal path. Streaming text deltas are coalesced for 100ms via `EventBuffer` and force-flushed before every structural boundary line. Stage 0 (intent capture) is synthesised by the runner as `[0/N intent] captured → 00-intent.txt` without a Reporter interface change. `--no-pause` is parsed by `cli.ts` and threaded through `RunWorkflowContext.noPause` so autopilot runs through every `pauseAfter: true` stage. Long assistant bodies (> 200 chars) are summarised to the first sentence (`/[.!?](\s|$)/`) and fall back to the first 200 chars + `…` when no boundary matches.

- Inputs: same `praxis run` surface plus optional `--no-pause`. Reporter is constructed once in `cli.ts` and threaded via `Deps.reporter`.
- Outputs: structured stdout + stderr lines per §8; identical state.json and artifact behaviour.
- Notable bounds:
  - Reporter interface frozen at §8 — Stage 0 line is duck-typed via a `LineReporter.stage0Captured` side-channel rather than a new method.
  - `runDone` is called on success, paused, and failed/cancelled paths uniformly.
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
