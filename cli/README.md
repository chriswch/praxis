# Praxis CLI

A CLI that drives an AI coding agent through a deterministic, resumable workflow. State your intent in one line; Praxis handles clarification, design, TDD, verification, and commit.

> **Status: v0.2 shipped.** `praxis run "<intent>"` drives all seven stages and lands a real `git commit`; `praxis advance <run-id>` resumes a paused run or recovers a failed/cancelled `clarify-assess` or `code-reviewing` stage from its on-disk artifact; `praxis retry <run-id>` resumes a failed `code-improving` session. See [docs/features.md](docs/features.md) for shipped behavior and [docs/backlog.md](docs/backlog.md) for known gaps and the roadmap.

> **Git identity required.** `git commit -m` needs `user.email` and `user.name` set (globally via `git config --global user.email …` or per-repo via `git config user.email …`). On a machine with no identity configured, the auto-commit stage will land in `failed`/`stopReason: "commit_failed"` with git's "Please tell me who you are" error captured as the reason.

## What it does

Seven sequential, artifact-mediated stages, each running in a fresh Claude Agent SDK session:

1. **`clarify-assess`** — read-only repo survey, restates intent, surfaces gaps, emits a plan with acceptance criteria. Pauses for human review.
2. **`sketching-design`** — read-only design sketch via the `praxis:sketching-design` skill. Locates affected files and proposes one direction — just enough context to write the first failing test. No validator; the skill may emit a sketch, a "skipped" line, or a `## Spec Issue` H2.
3. **`driving-tdd`** — full-tools execution against the working tree via the `praxis:driving-tdd` skill. Drives Red → Green → Refactor cycles and lands one commit per acceptance criterion.
4. **`code-reviewing`** — read-only quality review of the per-AC commits the driving-tdd stage landed (walked via `git diff {{baselineSha}}..HEAD` / `git log {{baselineSha}}..HEAD`) via the `praxis:code-reviewing` skill. Emits a `## Decision` (`proceed` or `skip-improve`) that gates stage 5.
5. **`code-improving`** — applies fixes from the review via the `praxis:code-improving` skill. Skipped when stage 4's decision is `skip-improve`.
6. **`verifying-and-adapting`** — read-only verify-and-adapt via the `praxis:verifying-and-adapting` skill. Walks the per-AC commits, reconciles spec-vs-reality, captures emerged design knowledge, and recommends the next action (done / next slice / rework / escalate). No validator; the skill emits a verification summary, a trivial-skip, a routing recommendation, or a spec/slice-impact note.
7. **`auto-commit`** — generates a Conventional-Commits message and runs `git add -A && git commit` to bundle anything the driving-tdd skill left uncommitted. The harness performs the commit directly (not via the agent), captures the new SHA, and prepends it onto `07-commit.txt`. When driving-tdd produced no commits (HEAD unchanged from the baseline), this stage and the three preceding it cascade-skip.

Stages communicate by writing artifact files to `.praxis/runs/<run-id>/`; downstream stages read them by path. The `clarify-assess` and `code-reviewing` artifacts have fixed H2 schemas validated by the harness.

> **Plugin required.** Stages 2, 3, 4, 5, and 6 invoke skills from the `praxis` Claude Code plugin (`praxis:sketching-design`, `praxis:driving-tdd`, `praxis:code-reviewing`, `praxis:code-improving`, and `praxis:verifying-and-adapting`). Install via `/plugin install praxis@<marketplace>` (see `.claude-plugin/marketplace.json` in the repo root). Plugin presence is not pre-flighted — a missing plugin surfaces as a `code-reviewing` validator failure (the agent emits "skill not found" in its final text; the harness flags the schema violation as a normal validator failure).

## Usage

```bash
praxis run "<intent>"            # start a new run
praxis advance <run-id>          # resume after a paused stage, or recover a failed/cancelled clarify-assess or code-reviewing
praxis retry <run-id>            # resume a failed/cancelled code-improving SDK session with "continue"
```

Flags on `run`:

- `--allow-dirty` — proceed even if the working tree has uncommitted changes. Pre-existing dirt will be bundled into the run's commit once the auto-commit stage lands. Without this flag the run aborts with the dirty file list and remediation hints — pre-flight runs before any disk write so a refused run leaves no orphan `.praxis/`.
- `--no-pause` — disable all pause gates (full autopilot). Stages still run + commit their artifacts; the runner just advances through `pauseAfter: true` stages instead of stopping.

Flags on `advance` and `retry`:

- `--no-pause` — same semantics as on `run`: drive any downstream `pauseAfter: true` stage straight through.

Pre-flight does NOT run on `advance` or `retry` — the run-dir is already initialized and `.gitignore` was already touched up by the original `praxis run`.

The run-id is printed to stdout at the start of every run.

> **Risk.** The `driving-tdd` and `code-improving` stages both run with `bypassPermissions` against `process.cwd()`. The agent can run `rm`, `git push`, network installers, and overwrite files outside its declared scope. **Use only on repos you can roll back.**

### Recovering from a failed stage

Failed stages are terminal. Three recovery paths:

1. `praxis advance <run-id>` — uses the on-disk artifact (re-validates if the stage has a validator). Applies to failed/cancelled `clarify-assess` and `code-reviewing` (hand-edit `01-clarify-assess.md` or `04-code-review.md` if needed, then advance), as well as a paused run. **Does NOT apply to a failed `code-improving`** — `advance` exits 1 with a hint to use `praxis retry`.
2. `praxis retry <run-id>` — scoped to `code-improving`. Resumes the failed SDK session with the prompt `continue`; tokens/USD accumulate across attempts and `state.stages["code-improving"].retryAttempts` increments. No other stage gets retry.
3. Fresh `praxis run "<intent>"` — for `driving-tdd` failures where the tree is in a partial state. Reset the tree first.

`SIGINT` (Ctrl-C) marks the in-flight stage `cancelled`; `advance` and `retry` treat `cancelled` exactly like `failed`. See [docs/features.md](docs/features.md#recovery-and-resume) for the full state machine.

### Inspecting transcripts

Each stage's SDK session id is captured in `state.json` and printed on stage end. Recover the full transcript with `claude --resume <session-id>`.

## Develop

This package targets:

- TypeScript, Node ≥ 20
- `@anthropic-ai/claude-agent-sdk`, `zod` (shipped); `commander`, `simple-git` (deferred until the slices that need them land)
- No bundler; published as the `praxis` bin

```bash
npm install         # devDeps only today (typescript, vitest, tsx)
npm test            # vitest run — unit, in-process workflow, e2e
npm run typecheck   # tsc --noEmit
npm run build       # emits dist/
```

`src/` is the source of truth for module layout. Pick the next slice off [docs/backlog.md](docs/backlog.md).

## Smoke run against the real SDK

The full test suite uses a scripted SDK seam — no API calls, no spend. Before tagging a release, run one end-to-end smoke against the live `@anthropic-ai/claude-agent-sdk` to confirm the wiring holds against a real model. This costs real money (a few cents per smoke).

### Prerequisites

- `ANTHROPIC_API_KEY` exported in the shell (the SDK reads it directly; Praxis does not pre-check).
- `git config user.email` and `git config user.name` set (globally or per-repo) — required by the auto-commit stage.
- A throwaway git repo you are willing to commit to. Do NOT smoke against a repo that holds work you cannot roll back; `driving-tdd` runs with `bypassPermissions`.
- A green `npm test`, `npm run typecheck`, and `npm run build` from this package.

### One-time setup

```bash
cd <praxis-cli-checkout>
npm install
npm run build
npm link                        # exposes `praxis` on $PATH from dist/cli.js
```

### Smoke procedure

```bash
mkdir -p /tmp/praxis-smoke && cd /tmp/praxis-smoke
git init && git commit --allow-empty -m "baseline"
export ANTHROPIC_API_KEY=sk-ant-...
praxis run "add a top-level CONTRIBUTING.md with three sentences explaining how to file an issue"
# clarify-assess pauses; inspect .praxis/runs/<run-id>/01-clarify-assess.md, then:
praxis advance <run-id>
```

Or, for a single-shot autopilot smoke:

```bash
praxis run --no-pause "add a top-level CONTRIBUTING.md with three sentences explaining how to file an issue"
```

### What to verify (smoke checklist)

After the run completes, check each:

- [ ] `praxis run` printed a `<run-id>` matching `^\d{4}-\d{2}-\d{2}-\d{4}-[0-9a-f]{4}$` on stdout.
- [ ] `.praxis/runs/<run-id>/00-intent.txt` is the raw intent verbatim (no trailing newline added).
- [ ] `.praxis/runs/<run-id>/01-clarify-assess.md` has the five H2 headings in order: `Intent`, `Assumptions`, `Gaps`, `Plan`, `Acceptance`, with at least one non-empty bullet under `Acceptance`.
- [ ] `.praxis/runs/<run-id>/02-sketching-design.md` is the agent's verbatim sketching-design-stage finalText (a design sketch, a `Skipped — no sketch needed` line, or a `## Spec Issue` block — all three are valid).
- [ ] `.praxis/runs/<run-id>/03-driving-tdd.md` is the agent's verbatim driving-tdd-stage finalText (TDD cycles completed, ACs covered, files changed, per-AC commit SHAs).
- [ ] `.praxis/runs/<run-id>/04-code-review.md` exists with a valid `## Decision` H2 block whose body trims to `proceed` or `skip-improve`.
- [ ] `.praxis/runs/<run-id>/05-code-improve.md` exists with the improvement summary verbatim — OR stage 5 was marked `completed`/`stopReason: "skipped-trivial"` because stage 4 returned `skip-improve` (in which case no `05-code-improve.md` is written).
- [ ] `.praxis/runs/<run-id>/06-verifying-and-adapting.md` is the agent's verbatim verifying-and-adapting-stage finalText (a verification summary, a trivial-skip line, a routing recommendation, or a spec/slice-impact note — all valid).
- [ ] `.praxis/runs/<run-id>/07-commit.txt` starts with a 40-char SHA followed by `\n\n` and the commit message.
- [ ] `git log -1 --pretty=%H` matches the SHA in `07-commit.txt` and `state.json`'s `stages["auto-commit"].commitSha`.
- [ ] `git log -1 --pretty=%s` is a Conventional-Commits style subject (e.g. `feat: …`, `docs: …`).
- [ ] The new commit's tree contains the file the intent asked for (here, `CONTRIBUTING.md`).
- [ ] `state.json` shows every stage `status: "completed"`, each with a populated `sessionId`, `tokens`, `usd`, and `endedAt`; `cost.totalTokens` and `cost.totalUsd` aggregate. Stages skipped via `skipped` / `skipped-trivial` have no `sessionId` / `tokens` / `usd`.
- [ ] The reporter printed: `[0/7 intent] captured → 00-intent.txt`, `[1/7 clarify-assess] starting…`, `[2/7 sketching-design] starting…`, `[3/7 driving-tdd] starting…`, `[4/7 code-reviewing] starting…`, `[5/7 code-improving] starting…` (or the skip line `[5/7 code-improving] skipped (skip-improve)`), `[6/7 verifying-and-adapting] starting…`, `[7/7 auto-commit] starting…`, and `[run <run-id>] done — commit <sha>, <tokens> tokens, $<usd>`.
- [ ] `.gitignore` contains a single `.praxis/` line (idempotent on re-run).
- [ ] `claude --resume <session-id>` (one of the printed ids) loads a real transcript, confirming session ids are valid.

### Smoke variants worth running once

Run each in a fresh throwaway repo. They exercise paths the scripted suite covers in unit form but not against the real SDK.

- **No-commit skip:** Run `--no-pause` against a repo where the driving-tdd stage produces no commits (e.g. an intent like "list the files in src/ and explain each"). Expect: stages `code-reviewing`, `code-improving`, `verifying-and-adapting`, and `auto-commit` all `completed`/`stopReason: "skipped"`, no `04-code-review.md`, `05-code-improve.md`, `06-verifying-and-adapting.md`, or `07-commit.txt`, no new commit. (`sketching-design` still runs — it is read-only and not part of the cascade-skip set.)
- **Recovery from validator failure:** During the paused review of `01-clarify-assess.md`, hand-edit the file to violate the H2 schema (e.g. delete the `## Acceptance` heading), then `praxis advance <run-id>`. Expect: exit 1 with the validator reason; restore the file; advance again succeeds with `stopReason: "recovered"` and zero new spend on that stage.
- **`--allow-dirty` bundling:** In a repo with one pre-existing untracked file, run `praxis run --allow-dirty --no-pause "<intent>"`. Expect: the auto-commit's `git show --name-only HEAD` lists the pre-existing file alongside the intent's new files (documented trade-off).
- **SIGINT during driving-tdd:** Start `praxis run --no-pause "<long intent>"`, Ctrl-C while driving-tdd is mid-stream. Expect: `state.stages["driving-tdd"].status === "cancelled"`, `stopReason: "sigint"`, partial `03-driving-tdd.md` written, downstream stages not executed.
- **`praxis retry` for `code-improving`:** Force `code-improving` to a `failed` state (e.g. SIGINT during the stage), then run `praxis retry <run-id>`. Expect: reporter prints `praxis: retrying code-improving (resume <sess-id>) — sending "continue" (run <run-id>)`; the stage completes; `state.stages["code-improving"].retryAttempts === 1`; `tokens` and `usd` reflect the sum of both attempts; `auto-commit` runs and lands the commit.

### After the smoke

- Note the run-ids and total USD spent in the release notes.
- `cd <praxis-cli-checkout> && npm unlink -g praxis` to detach the global symlink if you do not want it permanently.

## Docs

- [`docs/features.md`](docs/features.md) — what is currently implemented and verified, including type contracts and reporter formatting rules.
- [`docs/backlog.md`](docs/backlog.md) — known gaps, planned work, and the v0.2 roadmap.

## License

MIT
