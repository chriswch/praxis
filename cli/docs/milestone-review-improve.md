# Milestone: code-reviewing + code-improving stages, `praxis retry`

> **Status: in progress.** Extends the workflow from 3 to 5 stages and adds a third top-level command, `praxis retry <run-id>`. When this milestone ships, fold the prose into [features.md](features.md), update [README.md](../README.md) and [backlog.md](backlog.md) per §Doc deltas, then delete this file.

---

## What's changing

Two new stages run between `implement` and `auto-commit`, both invoking skills from the **`praxis` Claude Code plugin** via the SDK's `Skill` tool:

- **`code-reviewing`** — independent quality review of the implement-stage changes.
- **`code-improving`** — applies fixes for Critical/High/Medium findings.

`auto-commit`'s artifact filename moves from `03-commit.txt` to `05-commit.txt`. A new `praxis retry <run-id>` command resumes a failed `code-improving` SDK session with the prompt `continue`. No other stage gets retry; no plugin pre-flight.

---

## Workflow

| # | id | allowedTools | permissionMode | model | timeoutMs | outputArtifact | validate | pauseAfter |
|---|---|---|---|---|---|---|---|---|
| 0 | (intent capture) | — | — | — | — | `00-intent.txt` | — | — |
| 1 | clarify-assess | Read, Glob, Grep, Bash | default | opus-4-7 | 900_000 | `01-clarify-assess.md` | yes | **true** |
| 2 | implement | (all) | bypassPermissions | opus-4-7 | 1_800_000 | `02-implement-log.md` | — | false |
| 3 | **code-reviewing** | Read, Glob, Grep, Bash, Skill | default | opus-4-7 | 900_000 | **`03-code-review.md`** | **yes** | false |
| 4 | **code-improving** | (all, incl. Skill) | bypassPermissions | opus-4-7 | 1_800_000 | **`04-code-improve.md`** | — | false |
| 5 | auto-commit | Bash | default | haiku-4-5 | 300_000 | **`05-commit.txt`** | — | false |

Stages 1, 2, and 5 keep their existing behavior; only stage 5's filename moves.

---

## Plugin requirement

Stages 3 and 4 invoke skills `praxis:code-reviewing` and `praxis:code-improving` respectively, supplied by the `praxis` Claude Code plugin. Install via `/plugin install praxis@<marketplace>` before running. The CLI does not pre-flight plugin presence; a missing plugin surfaces as a `code-reviewing` validator failure (the agent emits "skill not found" in its final text; the harness flags schema violation). README documents this.

---

## Stage 3 — `code-reviewing`

Read-only review of the uncommitted implement-stage changes. **Permission mode** `default`. **Allowed tools** `[Read, Glob, Grep, Bash, Skill]`. **Model** `claude-opus-4-7`. **Timeout** 15 min. **Auto-advances** to `code-improving`.

The user prompt directs the agent to invoke the `praxis:code-reviewing` skill via the `Skill` tool, inspect changes through `git diff` / `git status` (changes are uncommitted; `git log` does not apply), and re-emit the review as its final assistant message conforming to this schema:

```markdown
## Summary
<one paragraph; or "Skipped — trivial change.">

## Findings
### Critical
- <bullet> | "- none"
### High
- <bullet> | "- none"
### Medium
- <bullet> | "- none"
### Low
- <bullet> | "- none"

## Decision
proceed | skip-improve
```

**Validator** — `validateCodeReviewArtifact(text)`. Checks:

- H2 order: `## Summary`, `## Findings`, `## Decision`.
- Under `## Findings`, four `### Severity` H3s in order Critical → High → Medium → Low; each with at least one bullet (`- none` is valid).
- `## Decision` body is exactly `proceed` or `skip-improve` (trimmed, single line, case-sensitive).

Schema failure → harness sends one corrective user message in the same `query()` stream. Second failure → stage `failed` / `stopReason: "validator_failed"`; partial artifact still written to `03-code-review.md`. Recovery via `praxis advance` re-runs the validator against on-disk content (same model as `clarify-assess`).

**Trivial-change short-circuit.** When the change is trivial enough that formal review is wasted ceremony, the agent emits the schema with `## Decision: skip-improve` and a one-line rationale in `## Summary`. Stage 4 skips on this decision (see below).

**Clean-tree skip.** If `git status --porcelain` is empty at stage entry, mark `completed` / `stopReason: "skipped"`; no SDK call, no artifact, no spend. Stages 4 and 5 also skip downstream.

---

## Stage 4 — `code-improving`

Applies fixes from the review. **Permission mode** `bypassPermissions`. **Allowed tools** all (incl. Skill). **Model** `claude-opus-4-7`. **Timeout** 30 min. **Auto-advances** to `auto-commit`.

> **Risk.** Same blast radius as `implement` — runs against `process.cwd()` with `bypassPermissions`. Use only on repos you can roll back.

The user prompt directs the agent to invoke the `praxis:code-improving` skill via the `Skill` tool against the review artifact. The skill auto-fixes Critical/High/Medium findings and never modifies test files. Final assistant message — an improvement summary listing fixes applied and items deferred — is written verbatim to `04-code-improve.md`. No validator.

**Skip paths.**

- **Clean tree at entry** → `completed` / `stopReason: "skipped"`. No SDK call, no artifact.
- **Decision = `skip-improve`** on the upstream review → `completed` / `stopReason: "skipped-trivial"`. No SDK call, no artifact. Stage 5 still runs (the implement edits are real).

**Recovery.** Failed/cancelled `code-improving` is recoverable **only** via `praxis retry <run-id>`. `praxis advance` rejects the failed stage with `retry only — use praxis retry <run-id>`.

---

## Stage 5 — `auto-commit` (renumbered)

Behavior unchanged. Artifact moves from `03-commit.txt` to `05-commit.txt`. User-prompt copy stays generic ("staged + unstaged changes") — the agent inspects via `git diff`, which covers implement and code-improve edits without stage attribution. Existing clean-tree skip continues to land on this stage.

---

## `praxis retry <run-id>`

Resumes a failed `code-improving` SDK session with the prompt `continue`. Scoped to this one stage for the milestone; promotion to other stages is in backlog.

```
praxis retry <run-id>           # resume failed code-improving session
```

**Flag.** `--no-pause` (same semantics as `run` / `advance`). Run-id format validated before any disk read. Pre-flight does not run.

**Scope guard.** Valid only when:

- the first non-completed stage is `code-improving`;
- `state.stages["code-improving"].status ∈ {failed, cancelled}`;
- `state.stages["code-improving"].sessionId` is non-empty.

Out-of-scope cases exit 1:

- Failed stage is not `code-improving` → `retry only supports code-improving for now; for <stage-id> use praxis advance | fresh praxis run`.
- `sessionId` missing or empty → `stopReason: "session_unresumable"`, hint to reset tree (`git stash` / `git reset`) and start fresh.

**Mechanic.** `retryWorkflow(runId, ctx, deps)`:

1. Increment `state.stages["code-improving"].retryAttempts` (default 0 → 1, etc.).
2. Call `runStage` with `resume: prior.sessionId` and `initialUserPrompt: "continue"`.
3. On success — sum new `tokens` / `usd` into the existing entry, refresh `endedAt`, set `status: "completed"` / `stopReason: "end_turn"`, write `04-code-improve.md` verbatim from the new finalText, continue with `executeStages` from `auto-commit`.
4. On failure — same `failStage` shape; tokens/usd accumulate. Retry is unbounded.
5. On SDK signaling an unresumable session mid-stream — `failed` / `stopReason: "session_unresumable"`.

**Reporter line.** Extends `Reporter.resuming`'s first-arg union to `"approved" | "recovering" | "retrying"`:

```
praxis: retrying code-improving (resume <sess-id>) — sending "continue" (run <run-id>)
```

---

## Recovery decision matrix

| Last failed/paused stage | Status | Recovery command |
|---|---|---|
| clarify-assess | paused | `praxis advance <run-id>` |
| clarify-assess | failed/cancelled | hand-edit `01-clarify-assess.md` if needed, `praxis advance <run-id>` |
| implement | failed/cancelled | fresh `praxis run` (reset tree first) |
| code-reviewing | failed/cancelled | hand-edit `03-code-review.md` if needed, `praxis advance <run-id>` |
| **code-improving** | **failed/cancelled** | **`praxis retry <run-id>`** (only path) |
| auto-commit | failed (commit_failed) | fix git identity / pre-commit, `praxis advance <run-id>` |

`SIGINT` (Ctrl-C) marks the in-flight stage `cancelled`; `cancelled` is treated identically to `failed` by every row.

---

## state.json deltas

- New stage entries `code-reviewing` and `code-improving` — same shape as existing entries.
- New optional field on `code-improving`: `retryAttempts?: number` (serialized when > 0).
- New `stopReason` values: `skipped-trivial` (decision-driven skip on stage 4), `session_unresumable` (retry can't find a session). Existing `skipped` reused for clean-tree skips on stages 3 and 4.
- No `decision` field on state.json; the runner re-parses from `03-code-review.md` when it needs to gate stage 4.

---

## Type-contract deltas

```ts
// src/workflow/stage.ts — CreateQueryFnInput gains:
resume?: string;

// src/ui/reporter.ts — Reporter.resuming first-arg union:
"approved" | "recovering" | "retrying";
```

`runStage`'s message-loop semantics are identical for fresh and resumed sessions; only the seed differs. `validateCodeReviewArtifact` and `parseReviewDecision` live alongside the existing validator in `src/workflow/validator.ts`.

---

## Reporter format deltas

- Stage count 3 → 5 in headlines: `[N/5 stage-id] starting…`, `[0/5 intent] captured → 00-intent.txt`.
- New stage-end line for the `skip-improve` path on stage 4.
- New retry line via the extended `resuming` method.
- Run-done per-stage breakdown grows two rows. `retried Nx` annotation deferred to backlog.
- New `briefFor("Skill", input)` returns `input.skill ?? input.name ?? ""` so retry/review tool events surface usefully.

---

## Test inventory (`tests/`)

**Validator unit (`tests/workflow/validator.test.ts`):**

- `validateCodeReviewArtifact` — schema pass; missing H2; wrong H2 order; missing severity H3; out-of-order severities; empty bullet list; malformed `## Decision`.
- `parseReviewDecision` — `proceed`, `skip-improve`, with whitespace tolerance.

**Runner orchestration:**

- 5-stage happy path, decision = `proceed`.
- Decision = `skip-improve` → stage 4 `skipped-trivial`, stage 5 runs.
- Clean tree at stage 3 entry → stages 3, 4, 5 all `skipped`.
- `code-reviewing` validator failure → corrective retry → second failure → `failed`.
- `praxis advance` recovery on failed/cancelled `code-reviewing` (validator re-runs, decision re-parsed).
- `praxis advance` against failed `code-improving` → exit 1 with the scoped error.

**`praxis retry`:**

- Happy retry: failed `code-improving` → resume + continue → completion → auto-commit runs. Verify scripted handle received `resume: <sess-id>` and `initialUserPrompt: "continue"`.
- Token/USD accumulate across attempts; `cost.totalTokens` / `cost.totalUsd` reflect the sum.
- `retryAttempts` increments per call.
- Multiple consecutive retries.
- Retry against non-`code-improving` failure → exit 1.
- Retry when `sessionId` is empty → exit 1 with `session_unresumable`.
- Retry when SDK signals unresumable mid-stream → `failed` / `stopReason: "session_unresumable"`.

**E2E (scripted SDK):**

- `praxis run --no-pause` through all five stages, decision `proceed`.
- `praxis run` failing `code-improving`, then `praxis retry` succeeds and lands the commit.

**Renumbering.** Every existing test asserting `03-commit.txt` updated to `05-commit.txt`.

---

## Doc deltas (apply when this milestone ships)

**`README.md`:**

- "What it does" — bump 3 → 5 stages, name the new ones.
- New "Plugin required" callout: stages 3–4 invoke skills from the `praxis` plugin; install via `/plugin install praxis@<marketplace>`. Missing plugin surfaces as a `code-reviewing` validator failure.
- Risk warning: extend to mention `code-improving` also runs with `bypassPermissions`.
- Recovery section: add `praxis retry <run-id>` next to `advance`, scoped to `code-improving`. Note that `advance` does **not** apply to a failed `code-improving`.
- Smoke checklist: update artifact filenames to `05-commit.txt`; add code-review/code-improve verification lines; add a smoke variant exercising `praxis retry`.

**`docs/features.md`:**

- Workflow stages: insert §3 (code-reviewing) and §4 (code-improving) with full spec; renumber auto-commit to §5; update its artifact filename.
- New §3.5 paragraph covering decision-driven skip.
- Recovery and resume: rewrite to cover three branches — paused, recovery via `advance` (clarify-assess + code-reviewing), retry via `praxis retry` (code-improving only). Document token/USD accumulation, `retryAttempts`, `session_unresumable`.
- State and artifacts: update artifact list, add `retryAttempts?`, add new `stopReason` values.
- Type contracts: add `resume?: string`, extend `Reporter.resuming` union.
- Pre-flight: one sentence noting plugin presence is not pre-flighted.

**`docs/backlog.md`:**

- Remove "**No `praxis retry`**" line; replace with "**`praxis retry` is scoped to `code-improving`** — see features.md."
- Update "**No SDK session resumption across processes**" to: "**Cross-process SDK session resumption is scoped to `praxis retry` for `code-improving`**. Other stages remain non-resumable; their `sessionId` is debug-only."
- Remove the existing `isWorkingTreeClean` consolidation item (this milestone fixes it as part of clean-tree skip propagation).
- Add new items:
  - "Plugin pre-flight check — gate the run on `praxis` plugin presence so failures surface before any spend."
  - "Promote `praxis retry` to other stages on demand."
  - "Annotate `runDone` per-stage rows with `retried Nx` when `retryAttempts > 0`."
  - "Promote decision parsing to a typed validator return shape (`{ ok, decision }`) once a second decision-driven stage lands."
- Move "Stage hand-off keyed on `AUTO_COMMIT_ID`" from "Known gaps" to "Pending" — case for typed `postStage` strengthens with two new downstream stages.

---

## Build order

1. `validateCodeReviewArtifact` + `parseReviewDecision` + tests (pure-fn slice).
2. New stage configs in `src/config/defaults.ts`; new prompt files `src/config/prompts/code-reviewing.md` and `code-improving.md`.
3. Runner: clean-tree skip propagation (consolidates `isWorkingTreeClean`), decision-driven skip on stage 4, recovery for `code-reviewing` via `advance`.
4. SDK seam: `resume?: string` on `CreateQueryFnInput`; production wrapper passes through to `query({ resume })`.
5. `praxis retry` command + `retryWorkflow`.
6. Reporter format updates; `Skill` tool brief.
7. Doc deltas per §Doc deltas; delete this file.
8. Real-SDK smoke against the new flow; record run-id and USD in features.md "End-to-end validation".
