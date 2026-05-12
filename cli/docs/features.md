# Features

What Praxis CLI currently provides. Open work and known issues are tracked in [backlog.md](backlog.md).

---

## Commands

### `praxis run "<intent>"`

Starts a new workflow run in the current directory. Prints a run-id (format `YYYY-MM-DD-HHMM-xxxx`, UTC) to stdout and creates `<cwd>/.praxis/runs/<run-id>/`.

Flags:

- `--allow-dirty` — proceed when the working tree has uncommitted changes. Pre-existing dirt will be bundled into the auto-commit by `git add -A` (documented trade-off).
- `--no-pause` — disable all `pauseAfter` gates; full autopilot through every stage.
- `--iterations <N>` — repeat the same intent across `N` back-to-back full 7-stage runs ("a chain"). Positive integer; `0`, negatives, and non-integers are rejected with `iterations must be a positive integer`. `N === 1` is accepted and still writes a chain ledger. See "Iteration chains" below.

Empty / whitespace / missing intent fails closed with exit 1 and no `.praxis/` side effects.

### `praxis advance <run-id>`

Resumes a paused run, or recovers a failed/cancelled `clarify-assess` or `code-reviewing` stage from the on-disk artifact. Validates the run-id format and rejects unknown flags before any disk read.

Flags:

- `--no-pause` — same autopilot semantics as on `run`.

Pre-flight does NOT run on `advance`: the run dir is already initialised and `.gitignore` was already touched up by the original `praxis run`.

Exits 1 with `not in a resumable state` for `pending` / `running` stages, or `already complete` for fully-completed runs. Exits 1 with the `praxis retry` hint when the failed stage is `code-improving`.

When the run carries a `chainId`, `advance` is chain-aware: after the current run reaches `completed`, the same process auto-launches the next iteration (see "Iteration chains").

### `praxis retry <run-id>`

Resumes a failed or cancelled `code-improving` SDK session by passing `resume: <prior sessionId>` and `initialUserPrompt: "continue"`. Scoped to `code-improving` only — every other stage exits 1 with `retry only supports code-improving for now; for <stage-id> use praxis advance | fresh praxis run`. Validates the run-id format before any disk read.

Flags:

- `--no-pause` — same autopilot semantics as on `run` / `advance`.

Pre-flight does NOT run on `retry`. Tokens and USD accumulate into the existing stage entry; `state.stages["code-improving"].retryAttempts` increments per call. Retry is unbounded. When the SDK signals an unresumable session mid-stream (or when the prior `sessionId` is missing), the stage flips to `failed`/`stopReason: "session_unresumable"`.

When the run carries a `chainId`, `retry` is chain-aware: a successful retry flips the run to `completed` and the same process auto-launches the next iteration (see "Iteration chains").

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

Seven sequential stages, each running in a fresh Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) session. Stages communicate by writing artifact files; downstream stages reference them by absolute path and the agent reads them via the Read tool.

### Stage 0 — intent capture

Writes the raw `<intent>` argument to `00-intent.txt` verbatim (no trailing newline). No agent invoked.

### Stage 1 — `clarify-assess`

Read-only repo survey. `permissionMode: "default"`, allowlist `[Read, Glob, Grep, Bash]`. Pinned model `claude-opus-4-7`. 15-minute timeout. Pauses afterward unless `--no-pause`.

The system prompt directs the agent to restate intent, survey the repo, identify assumptions and gaps, and emit a plan with acceptance criteria — and then to end by emitting **only** a markdown artifact with five H2 headings in fixed order: `Intent`, `Assumptions`, `Gaps`, `Plan`, `Acceptance` (with ≥1 non-empty bullet under Acceptance). The harness validates this schema after the agent's Stop event. On schema failure the harness sends one corrective user message in the same `query()` stream; a second failure marks the stage `failed`/`stopReason: "validator_failed"` and exits 1. The partial artifact is written to disk in either case so the user can hand-edit and `praxis advance`.

### Stage 2 — `sketching-design`

Read-only design sketch via the `praxis:sketching-design` skill. `permissionMode: "default"`, allowlist `[Read, Glob, Grep, Bash, Skill]`. Pinned model `claude-opus-4-7`. 15-minute timeout. Auto-advances to `driving-tdd`.

The user prompt directs the agent to invoke the `praxis:sketching-design` skill via the `Skill` tool against `01-clarify-assess.md`, re-emitting the skill's output **verbatim** as the final assistant message. The skill returns one of three valid shapes:

- a **design sketch** — change map, pattern match, proposed direction, and the first failing test (the typical case for a non-trivial story);
- a single line **`Skipped — no sketch needed`** when the path is obvious from the spec;
- a **`## Spec Issue`** H2 when codebase exploration reveals the spec's assumptions are wrong (recommends returning to `clarifying-intent`).

There is no validator on this stage — all three shapes pass through to `02-sketching-design.md` unchanged. There is no clean-tree skip either: this stage runs even on a clean tree because it operates on the spec, not the working tree. Failure modes are the standard timeout / SIGINT path.

The downstream `driving-tdd` stage reads BOTH `01-clarify-assess.md` (spec) AND `02-sketching-design.md` (sketch); the skill consumes both as inputs.

### Stage 3 — `driving-tdd`

Full-tools execution via the `praxis:driving-tdd` skill. `permissionMode: "bypassPermissions"` (paired with `allowDangerouslySkipPermissions: true` per the SDK's requirement). Pinned model `claude-opus-4-7`. 30-minute timeout. Auto-advances to `code-reviewing`.

The user prompt references both `01-clarify-assess.md` and `02-sketching-design.md` by absolute path; the agent reads them via the Read tool and invokes the `praxis:driving-tdd` skill. The skill drives Red → Green → Refactor cycles and lands one commit per acceptance criterion (the agent does not commit manually). Writes `03-driving-tdd.md` verbatim from the agent's final assistant message (no validator) — the message must summarize the TDD cycles completed, ACs covered, files changed, and the per-AC commit SHAs. Timeout marks the stage `failed`/`stopReason: "timeout"`; SIGINT marks it `cancelled`/`stopReason: "sigint"`. In both cases the partial log is preserved and downstream stages are skipped.

> **Risk:** the driving-tdd stage runs with `bypassPermissions` against `process.cwd()`. The agent can run `rm`, `git push`, network installers, and overwrite files outside its declared scope. **Use only on repos you can roll back.**

### Stage 4 — `code-reviewing`

Read-only quality review of the per-AC commits the driving-tdd stage landed. `permissionMode: "default"`, allowlist `[Read, Glob, Grep, Bash, Skill]`. Pinned model `claude-opus-4-7`. 15-minute timeout. Auto-advances to `code-improving`.

The user prompt directs the agent to invoke the `praxis:code-reviewing` skill via the `Skill` tool (walking the per-AC commit range via `git diff {{baselineSha}}..HEAD` and `git log {{baselineSha}}..HEAD`), re-emit the skill's review **verbatim** as its final assistant message, and append a single `## Decision` H2 with body `proceed` or `skip-improve` so the runner can gate stage 5. The skill's native template — Premise Check, Layer 1–5 analyses, severity-graded Issues tables, What's Done Well, Summary counts — is what stage 5 reads to apply fixes; the harness does not reshape it.

The artifact is written verbatim to `04-code-review.md` (always written, even on validator failure).

**Validator** — `validateCodeReviewArtifact(text)`. Decision-only:

- An `## Decision` H2 exists.
- Its body, trimmed, is exactly `proceed` or `skip-improve` (single line, case-sensitive).

Everything above `## Decision` is freeform skill output. Schema failure → harness sends one corrective user message in the same `query()` stream; second failure → stage `failed`/`stopReason: "validator_failed"`. Recovery via `praxis advance` re-runs the validator against on-disk content (same model as `clarify-assess`). A missing `praxis` plugin manifests here as the agent emitting "skill not found" in its final text — the harness flags the schema violation as a normal validator failure.

**Trivial-change short-circuit.** When the change is trivial enough that formal review is wasted ceremony, the agent invokes `praxis:code-reviewing`, takes its built-in condensed/"review skipped" output verbatim, and appends `## Decision: skip-improve` with the skill's one-line rationale carried into `## Summary` (or wherever the condensed form puts it). Stage 4 then takes the decision-driven skip path (see §3.5).

**No-commit skip (S-3 + S-4).** If HEAD has not advanced past `state.baselineSha` at stage entry (driving-tdd produced no commits — its skill discarded a red test, dropped a stray scratch file, or otherwise did no work that landed), the stage is marked `completed`/`stopReason: "skipped"` — no SDK call, no artifact, no spend. Stages 5, 6, and 7 cascade-skip downstream (they will see the same unchanged HEAD); the four-stage cascade is `code-reviewing` → `code-improving` → `verifying-and-adapting` → `auto-commit`.

### §4.5 — Decision-driven skip on stage 5

When `code-reviewing` ends with `## Decision: skip-improve`, the runner marks `code-improving` `completed`/`stopReason: "skipped-trivial"` without invoking the SDK or writing `05-code-improve.md`. Stages 6 (`verifying-and-adapting`) and 7 (`auto-commit`) still run — there are still per-AC commits to verify and to land final-touch tweaks alongside — and `git diff` covers anything still in the working tree.

### Stage 5 — `code-improving`

Applies fixes from the review. `permissionMode: "bypassPermissions"`, allowlist all (incl. `Skill`). Pinned model `claude-opus-4-7`. 30-minute timeout. Auto-advances to `auto-commit`. **No validator.**

The user prompt directs the agent to invoke the `praxis:code-improving` skill via the `Skill` tool against `04-code-review.md`. The skill auto-fixes Critical/High/Medium findings and never modifies test files. The agent's final assistant message — an improvement summary listing fixes applied and items deferred — is written verbatim to `05-code-improve.md`.

> **Risk:** same blast radius as `driving-tdd` — runs against `process.cwd()` with `bypassPermissions`. **Use only on repos you can roll back.**

**Skip paths:**

- **HEAD unchanged from baseline at stage 4 entry** (cascaded from upstream) → `completed`/`stopReason: "skipped"`. No SDK call, no artifact.
- **Decision = `skip-improve`** on the upstream review → `completed`/`stopReason: "skipped-trivial"`. No SDK call, no artifact. Stages 6 and 7 still run.

**Recovery.** A failed/cancelled `code-improving` is recoverable **only** via `praxis retry <run-id>`. `praxis advance` rejects the failed stage with the scoped error.

### Stage 6 — `verifying-and-adapting`

Read-only verify-and-adapt via the `praxis:verifying-and-adapting` skill. `permissionMode: "default"`, allowlist `[Read, Glob, Grep, Bash, Skill]`. Pinned model `claude-opus-4-7`. 15-minute timeout. Auto-advances to `auto-commit`.

The user prompt directs the agent to invoke the `praxis:verifying-and-adapting` skill via the `Skill` tool against the clarify-assess spec at `01-clarify-assess.md`, the driving-tdd summary at `03-driving-tdd.md`, and the optional sketching-design sketch at `02-sketching-design.md`; the skill walks the per-AC commit range via `git diff {{baselineSha}}..HEAD` and `git log {{baselineSha}}..HEAD`, reconciles spec-vs-reality, captures emerged design knowledge, and recommends the next action (done / next slice / rework / escalate). Re-emits the skill's output **verbatim** as the final assistant message.

There is no validator on this stage — the skill's multiple valid output shapes (verification summary, trivial-skip line, routing recommendation, spec/slice-impact note) all pass through to `06-verifying-and-adapting.md` unchanged. Failure modes are the standard timeout / SIGINT path.

**No-commit skip (S-4).** Inherits the same cascade-skip predicate as `code-reviewing` / `code-improving` / `auto-commit` — if HEAD has not advanced past `state.baselineSha` at stage entry, the stage is marked `completed`/`stopReason: "skipped"` (no SDK call, no artifact, no spend).

The downstream `auto-commit` stage does NOT consume this artifact — verification feeds forward to the *next* slice (via the user's review of `06-verifying-and-adapting.md`), not to the next stage in this run.

### Stage 7 — `auto-commit`

Generates a Conventional-Commits message and lands a real commit. `permissionMode: "default"`, allowlist `[Bash]`. Pinned model `claude-haiku-4-5-20251001`. 5-minute timeout.

Pre-stage check (S-3): if HEAD has not advanced past `state.baselineSha` before invoking the stage (driving-tdd produced no commits), the SDK call is skipped entirely; the stage is marked `completed`/`stopReason: "skipped"` (no sessionId/tokens/usd, no `07-commit.txt`, HEAD untouched).

Otherwise, after the agent emits the commit message, the harness runs `git add -A` and `git commit -m <message>` directly (not via the agent). On success, the new HEAD SHA is captured and `07-commit.txt` is written as `<40-char-sha>\n\n<message>\n`; the SHA also lands on `state.stages["auto-commit"].commitSha` and on the run-done line. On commit failure (e.g., missing git identity, pre-commit hook failure), the stage flips to `failed`/`stopReason: "commit_failed"` with git's stderr captured in `error`; `07-commit.txt` keeps the agent message verbatim (no SHA prefix). The user-prompt copy stays generic ("staged + unstaged changes") — `git diff` covers anything driving-tdd left uncommitted plus code-improve edits without per-stage attribution.

> **Git identity required.** `git commit -m` needs `user.email` and `user.name` set, globally (`git config --global user.email …`) or per-repo. Missing identity surfaces as `commit_failed` with git's own actionable message.

---

## Recovery and resume

There are three recovery branches, each with a distinct reporter line. The branch is determined by the state of the run, not by the user's choice of command — `advance` and `retry` each cover a disjoint subset.

### Paused (`praxis advance`)

The last completed stage had `pauseAfter: true` (only `clarify-assess` after S-006). Reporter prints `praxis: resuming approved plan after <stage-id> (run <run-id>)`. No validator re-check. Dispatches the next stage.

### Recovery via `praxis advance` (validator-bearing stages)

The most recent stage status is `failed` or `cancelled` and the stage carries a validator — `clarify-assess` and `code-reviewing`. Reporter prints `praxis: recovering <stage-id> from on-disk artifact; re-validating (run <run-id>)`. Requires the artifact file to exist; the validator re-runs against on-disk content. On validator success the stage flips to `completed`/`stopReason: "recovered"` with `endedAt` refreshed; `sessionId`, `tokens`, and `usd` are preserved from the prior failed run, so recovery contributes zero new spend. On validator failure the run aborts with the validator reason and state.json is left untouched.

`praxis advance` exits 1 when the failed stage is `code-improving` (`retry only — use praxis retry <run-id>`), and for `driving-tdd` the recommended path is a fresh `praxis run` after resetting the tree.

### Retry via `praxis retry` (code-improving only)

Scoped to a failed or cancelled `code-improving`. Reporter prints `praxis: retrying code-improving (resume <sessionId>) — sending "continue" (run <runId>)`. The runner calls `runStage` with `resume: prior.sessionId` and `initialUserPrompt: "continue"`, increments `state.stages["code-improving"].retryAttempts` (default 0 → 1, etc.), and **accumulates** new tokens / USD into the existing entry rather than replacing them; `cost.totalTokens` / `cost.totalUsd` reflect the sum across attempts. Retry is unbounded.

On success the stage flips to `completed`/`stopReason: "end_turn"`, `05-code-improve.md` is rewritten verbatim from the new finalText, and `executeStages` continues with `auto-commit`. On failure the same `failStage` shape applies; tokens/USD continue to accumulate.

Out-of-scope cases exit 1:

- Failed stage is not `code-improving` → `retry only supports code-improving for now; for <stage-id> use praxis advance | fresh praxis run`.
- Prior `sessionId` missing or empty → `stopReason: "session_unresumable"`, hint to reset tree and start fresh.
- SDK signals an unresumable session mid-stream → `failed`/`stopReason: "session_unresumable"`.

### SIGINT and `cancelled`

`cancelled` stages are treated identically to `failed` by every recovery branch. SIGINT during a resumed/retried stage marks it `cancelled` exactly like a fresh `praxis run`.

---

## Iteration chains (`--iterations <N>`)

`praxis run --iterations <N> "<intent>"` repeats the same intent across `N` back-to-back full 7-stage runs — a "chain" — each iteration committing on top of its predecessor. The flag composes with `--allow-dirty` / `--no-pause`; both are persisted in the chain ledger and inherited by every subsequent iteration. `praxis advance` and `praxis retry` discover chain membership via `state.json.chainId` and need no new flag.

### Chain ledger

**Path:** `.praxis/chains/<chain-id>.json`. The `<chain-id>` uses the same `YYYY-MM-DD-HHMM-<hex4>` shape as run-ids, generated independently of any iteration's run-id (no equality required). The ledger is created after iter 1's run dir exists but before iter 1's first stage runs. It is append-mostly — each iteration entry is added when its run starts, mutated on terminal status, never deleted.

```jsonc
{
  "chainId": "2026-05-02-1430-9f3c",
  "intent": "<verbatim>",
  "iterationsTotal": 5,
  "iterationsCompleted": 2,
  "flags": { "allowDirty": false, "noPause": false },
  "status": "in_progress" | "completed" | "completed-early" | "aborted" | "cancelled",
  "createdAt": "2026-05-02T14:30:00Z",
  "updatedAt": "2026-05-02T14:42:13Z",
  "iterations": [
    { "index": 1, "runId": "2026-05-02-1430-a1b2", "status": "completed", "commitSha": "<40-char>" },
    { "index": 2, "runId": "2026-05-02-1442-c3d4", "status": "completed", "commitSha": "<40-char>" },
    { "index": 3, "runId": "2026-05-02-1455-e5f6", "status": "running" }
  ]
}
```

Each chain run also stamps optional `chainId` and `iterationIndex` (1-based) onto its `state.json`.

### Lifecycle

- Iter K's `auto-commit` SHA becomes the baseline for iter K+1 — just `currentHead(cwd)` at iter K+1's `runWorkflow` entry, the same path the first iteration uses.
- Iter 2+ does NOT call `runPreflight` and does NOT touch `.gitignore` (already done by iter 1).
- Each iteration gets a fresh run-id and `.praxis/runs/<id>/` directory.
- Auto-launch happens within the single CLI process. After a run reaches a non-paused terminal state (`completed`), the process checks `state.chainId`; if the chain has remaining iterations and is still `in_progress`, it immediately launches the next iteration via the same `runWorkflow` entry point.
- A pause within an iteration exits the process as today; chain status remains `in_progress`. Running `praxis advance <paused-run-id>` finishes the run AND auto-launches the next iteration. Same for `praxis retry` against a failed `code-improving`.

### Termination

| Trigger | Chain status | Process exit |
|---|---|---|
| Iteration N completes successfully (commit lands) | `completed` | 0 |
| Any iteration's `auto-commit` cascade-skips (driving-tdd produced no commits) | `completed-early` | 0 |
| Any iteration ends `failed` (validator, timeout, `commit_failed`, etc.) | `aborted` | 1 |
| SIGINT mid-iteration | `cancelled` | 1 (SIGINT-style) |
| Iteration ends `cancelled` (non-SIGINT path) | `cancelled` | 1 |

After a chain terminates, `status` and `updatedAt` are written to the ledger; iter K's run-level state is independent and already persisted.

A failed/cancelled iteration's run can still be recovered via `praxis advance` or `praxis retry`. On successful recovery, the run flips to `completed` and the chain auto-launches the next iteration; the chain reaches `aborted` only when the user gives up on recovery.

> **Note on intent reuse.** Each iteration sees the previous iteration's commit. Use intents that naturally produce multiple commits, or expect early termination via cascade-skip (`completed-early`).

---

## Reporter (`LineReporter`)

Stdout/stderr formatting:

- Stage start — `[N/7 stage-id] starting…` (`…` is U+2026).
- Stage 0 (synthesised) — `[0/7 intent] captured → 00-intent.txt`.
- Streaming assistant text — wrapped to terminal width (default 80 cols when not a TTY), prefixed ` ›`, 3-space-aligned continuations. Long bodies (> 200 chars) summarised to the first sentence (`/[.!?](\s|$)/`); fallback to the first 200 chars + `…` when no boundary matches. Streaming deltas are coalesced for 100ms and force-flushed before any structural boundary line.
- Tool use — `  › ToolName(brief)` where `brief` is the tool's salient input (Read/Edit/Write → `file_path`; Glob/Grep → `pattern`; Bash/Task → first 50 chars of `command`/`description`; `Skill` → `input.skill ?? input.name ?? ""`; unknown tools → empty).
- Tool result — silent on success; `  ✗ ToolName failed` on failure.
- Errors — written to stderr, multi-line OK; red when stderr is a TTY and `NO_COLOR` is unset.
- Stage end — artifact path, then `[N/7 stage-id] session: <id> (claude --resume <id> to inspect)`.
- Stage end (decision-driven skip on `code-improving`) — `[5/7 code-improving] skipped (skip-improve)`. No artifact path, no session id.
- Paused — `praxis: paused after <stage-id> — review .praxis/runs/<run-id>/<artifact>, then: praxis advance <run-id>`.
- Resume (paused) — `praxis: resuming approved plan after <stage-id> (run <run-id>)`.
- Recover — `praxis: recovering <stage-id> from on-disk artifact; re-validating (run <run-id>)`.
- Retry — `praxis: retrying <stage-id> (resume <sessionId>) — sending "continue" (run <run-id>)` (em-dash, ASCII straight quotes around `continue`). Emitted via the extended `Reporter.resuming` first-arg union (`"approved" | "recovering" | "retrying"`).
- Chain iteration start — `praxis: [chain <short> · iteration <K>/<N>] starting run <run-id>`. Emitted before the first stage line of each iteration. `<short>` is the last 4 hex chars of the chain-id. Non-chain runs (no `--iterations`) emit no banner.
- Chain end — `praxis: [chain <short>] <status> after <K>/<N> iterations`. Emitted once when the chain terminates.
- Run done — `[run <run-id>] done|paused|failed|cancelled — commit <sha>, <tokens> tokens, $<usd>` plus a per-stage breakdown with each `sessionId`. Headline branches on terminal status.

---

## State and artifacts

Each run writes to `<cwd>/.praxis/runs/<run-id>/`:

- `state.json` — pretty-printed JSON, trailing newline. Per-stage entries carry `status`, `endedAt`, `stopReason`, `sessionId`, `tokens` (`input` / `output` / `cacheRead` / `cacheCreate`), `usd`, optional `error`, optional `retryAttempts` (serialized when > 0; only `code-improving`), and (for `auto-commit`) optional `commitSha`. Top-level `cost.totalTokens` aggregates `input + output` only — cache tokens are recorded per-stage but excluded from the running total. `cost.totalUsd` is the sum of per-stage `usd`. `currentStage` tracks the in-flight or next-to-run stage. `stopReason` values include: `end_turn`, `skipped` (clean-tree skip), `skipped-trivial` (decision-driven skip on `code-improving`), `recovered`, `commit_failed`, `validator_failed`, `timeout`, `sigint`, `session_unresumable`. Optional `chainId` and `iterationIndex` (1-based) are stamped when the run is part of a chain; both are omitted otherwise.
- `00-intent.txt` — raw intent verbatim.
- `01-clarify-assess.md` — agent finalText verbatim (always written, even on validator failure).
- `02-sketching-design.md` — agent finalText verbatim (design sketch, `Skipped — no sketch needed` line, or `## Spec Issue` H2 — all three pass through unchanged; no validator).
- `03-driving-tdd.md` — agent finalText verbatim (always written, even on timeout/SIGINT — partial log preserved). Summarizes TDD cycles completed, ACs covered, files changed, and per-AC commit SHAs.
- `04-code-review.md` — agent finalText verbatim (always written, even on validator failure). Carries the skill's native review template plus a final `## Decision` H2 (`proceed` | `skip-improve`). Not written on a clean-tree skip.
- `05-code-improve.md` — agent finalText verbatim (improvement summary). Not written on either skip path (clean-tree or decision-driven `skipped-trivial`).
- `06-verifying-and-adapting.md` — agent finalText verbatim (verification summary, trivial-skip line, routing recommendation, or spec/slice-impact note — all four pass through unchanged; no validator). Not written on the clean-tree skip path.
- `07-commit.txt` — `<sha>\n\n<message>\n` on commit success; agent message verbatim on commit failure; not written on the skip path.

Chain runs additionally write a single ledger at `<cwd>/.praxis/chains/<chain-id>.json` (see "Iteration chains" above) — one ledger per chain, shared across all iterations.

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

`stageEnd` carries the persisted `stopReason` so the formatter can branch — currently the only consumer is the `[5/7 code-improving] skipped (skip-improve)` line for `stopReason: "skipped-trivial"`. The plain success / failure paths leave it undefined. `resuming` is invoked via `reporter.resuming?.(...)` so non-CLI reporters can skip it; `sessionId` is required for `kind: "retrying"` and omitted for `"approved"` / `"recovering"`.

---

## Tooling

- TypeScript ≥ 5, strict mode + `verbatimModuleSyntax`, ESM (`"type": "module"`), Node ≥ 20.
- Build via `tsdown` (rolldown + oxc) → single `dist/cli.js` with sourcemaps. The `praxis` bin entry is `dist/cli.js` with `#!/usr/bin/env node` preserved from source. `tsc --noEmit` is the typecheck; tsdown does the actual emit. Build runs in ~15ms.
- Runtime deps (`@anthropic-ai/claude-agent-sdk`, `zod`) are kept external — users get them via `npm install`, not bundled into the CLI artifact.
- Prompt `.md` files in `src/config/prompts/` are copied into `dist/config/prompts/` by tsdown's `copy` step; the runtime loader resolves them via a layout-detection helper that handles both the bundled (dist) and source-via-tsx (src) directory shapes. Locked by a build-smoke regression test.
- Tests run on Vitest. Layout: `tests/` mirrors `src/`, plus `tests/e2e/`. Real fs and real git in `mkdtemp` temp dirs (cleaned per-test). The SDK is the only seam stubbed — every test scripts SDK message streams via `tests/support/scripted-query.ts`, so the suite makes no real API calls and incurs no cost. Suite size: 193 tests across 25 files, all green.
- Lint and format are handled by **Biome** (single Rust binary, replaces ESLint + Prettier). `npm run lint` checks; `npm run format` applies fixes. Configured to match the codebase's existing style (2-space indent, double quotes, trailing commas). Tests have `noNonNullAssertion` relaxed via override since `!` on known-defined fixture values is idiomatic.
