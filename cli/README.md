# Praxis CLI

A CLI that drives an AI coding agent through a deterministic, resumable workflow. State your intent in one line; Praxis handles clarification, implementation, and commit.

> **Status: full 3-stage workflow shipped end-to-end with a real commit.** `praxis run "<intent>"` runs pre-flight (git repo + dirty-tree gates, `.gitignore` touch-up), then executes all three stages — `clarify-assess` (with one corrective retry on validator failure), `implement` (under `bypassPermissions`, 30-min budget), and `auto-commit` (Bash-only, generates a Conventional-Commits message and lands a real `git add -A && git commit -m`) — writing per-stage artifacts and updating `state.json` after each. The new commit's SHA is captured on `state.stages["auto-commit"].commitSha`, prepended onto `03-commit.txt` as `<sha>\n\n<message>\n`, and surfaced on the `[run …] done` line. The runner pre-checks `git status --porcelain` before auto-commit; a clean tree skips the SDK call entirely (`stopReason: "skipped"`, no `03-commit.txt`). Commit failure flips the stage to `failed`/`stopReason: "commit_failed"` with git's stderr captured as the error. `praxis advance <run-id>` resumes a paused run or recovers a failed/cancelled stage from its on-disk artifact (re-validating where applicable, no token spend on the recovered stage). The `LineReporter` (product.md §8) formats stage start / streamed assistant text / tool calls / errors / stage end / pause / run-done lines, with 100ms delta coalescing, plus the §11 `resuming approved plan` / `recovering …; re-validating` headlines. `--no-pause` (full autopilot) is wired through both `run` and `advance`. See [docs/features.md](docs/features.md) for shipped behavior and [docs/backlog.md](docs/backlog.md) for the rest of the v0.1 build plan and v0.2 roadmap.

> **Git identity required.** `git commit -m` needs `user.email` and `user.name` set (globally via `git config --global user.email …` or per-repo via `git config user.email …`). On a machine with no identity configured, the auto-commit stage will land in `failed`/`stopReason: "commit_failed"` with git's "Please tell me who you are" error captured as the reason.

## What it does

Three sequential, artifact-mediated stages, each running in a fresh Claude Agent SDK session:

1. **`clarify-assess`** — read-only repo survey, restates intent, surfaces gaps, emits a plan with acceptance criteria. Pauses for human review.
2. **`implement`** — full-tools execution against the working tree. Writes the changes the plan describes.
3. **`auto-commit`** — generates a Conventional-Commits message and runs `git add -A && git commit`. The harness performs the commit directly (not via the agent), captures the new SHA, and prepends it onto `03-commit.txt`. A clean working tree skips this stage entirely.

Stages communicate by writing artifact files to `.praxis/runs/<run-id>/`; downstream stages read them by path. The `clarify-assess` artifact has a fixed H2 schema validated by the harness.

## Usage

```bash
praxis run "<intent>"            # start a new run
praxis advance <run-id>          # resume after a paused or failed stage
```

Flags on `run`:

- `--allow-dirty` — proceed even if the working tree has uncommitted changes. Pre-existing dirt will be bundled into the run's commit once the auto-commit stage lands. Without this flag the run aborts with the dirty file list and remediation hints — pre-flight runs before any disk write so a refused run leaves no orphan `.praxis/`.
- `--no-pause` — disable all pause gates (full autopilot). Stages still run + commit their artifacts; the runner just advances through `pauseAfter: true` stages instead of stopping.

Flags on `advance`:

- `--no-pause` — same semantics as on `run`: drive any downstream `pauseAfter: true` stage straight through.

Pre-flight does NOT run on `advance` — the run-dir is already initialized and `.gitignore` was already touched up by the original `praxis run`.

The run-id is printed to stdout at the start of every run.

> **Risk.** The implement stage runs with `bypassPermissions` against `process.cwd()`. The agent can run `rm`, `git push`, network installers, and overwrite files outside its declared scope. **Use only on repos you can roll back.**

### Recovering from a failed stage

Failed stages are terminal. Two recovery paths:

1. `praxis advance <run-id>` — uses the on-disk artifact (re-validates if the stage has a validator). For `clarify-assess` schema failures: hand-edit `01-clarify-assess.md`, then advance. The recovered stage flips to `completed` with `stopReason: "recovered"`; the prior run's `sessionId`, `tokens`, and `usd` are preserved and recovery itself contributes zero new spend. The advance log line is `praxis: recovering <stage-id> from on-disk artifact; re-validating (run <run-id>)`.
2. Fresh `praxis run "<intent>"` — for `implement` failures where the tree is in a partial state. Reset the tree first.

`SIGINT` (Ctrl-C) marks the in-flight stage `cancelled` (distinct from `failed`); recovery via `advance` treats `cancelled` exactly like `failed`. From a paused run, `advance` skips the validator entirely and emits `praxis: resuming approved plan after <stage-id> (run <run-id>)`. From a still-`pending` or `running` state, or a fully completed run, `advance` exits 1 instead of doing anything.

There is no `praxis retry`. The harness never re-runs a stage automatically.

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

The planned module layout (per spec §12):

```
src/
  cli.ts                 # commander entrypoint
  config/
    schema.ts            # zod schemas
    defaults.ts          # built-in 3-stage workflow
    prompts/             # stage system prompts as .md
  workflow/
    runner.ts            # stage loop, pause/resume
    stage.ts             # single-stage execution
    artifacts.ts         # finalText → disk + validator
    state.ts             # state.json read/write
  git/commit.ts
  ui/
    reporter.ts          # Reporter interface
    line-reporter.ts     # stdout impl
  index.ts
```

Treat `product.md` as the source of truth and pick the next slice off `docs/backlog.md`.

## Smoke run against the real SDK

The full test suite uses a scripted SDK seam — no API calls, no spend. Before tagging a release, run one end-to-end smoke against the live `@anthropic-ai/claude-agent-sdk` to confirm the wiring holds against a real model. This costs real money (a few cents per smoke).

### Prerequisites

- `ANTHROPIC_API_KEY` exported in the shell (the SDK reads it directly; Praxis does not pre-check).
- `git config user.email` and `git config user.name` set (globally or per-repo) — required by the auto-commit stage.
- A throwaway git repo you are willing to commit to. Do NOT smoke against a repo that holds work you cannot roll back; `implement` runs with `bypassPermissions`.
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

- [ ] `praxis run` printed a `<run-id>` matching `^\d{4}-\d{2}-\d{2}-\d{4}-[0-9a-f]{4}$` on stdout (§4).
- [ ] `.praxis/runs/<run-id>/00-intent.txt` is the raw intent verbatim (no trailing newline added).
- [ ] `.praxis/runs/<run-id>/01-clarify-assess.md` has the five H2 headings in order: `Intent`, `Assumptions`, `Gaps`, `Plan`, `Acceptance`, with at least one non-empty bullet under `Acceptance` (§5.2).
- [ ] `.praxis/runs/<run-id>/02-implement-log.md` is the agent's verbatim implement-stage finalText (§5.3).
- [ ] `.praxis/runs/<run-id>/03-commit.txt` starts with a 40-char SHA followed by `\n\n` and the commit message (§5.4).
- [ ] `git log -1 --pretty=%H` matches the SHA in `03-commit.txt` and `state.json`'s `stages["auto-commit"].commitSha`.
- [ ] `git log -1 --pretty=%s` is a Conventional-Commits style subject (e.g. `feat: …`, `docs: …`).
- [ ] The new commit's tree contains the file the intent asked for (here, `CONTRIBUTING.md`).
- [ ] `state.json` shows every stage `status: "completed"`, each with a populated `sessionId`, `tokens`, `usd`, and `endedAt`; `cost.totalTokens` and `cost.totalUsd` aggregate.
- [ ] The reporter printed: `[0/3 intent] captured → 00-intent.txt`, `[1/3 clarify-assess] starting…`, `[2/3 implement] starting…`, `[3/3 auto-commit] starting…`, and `[run <run-id>] done — commit <sha>, <tokens> tokens, $<usd>`.
- [ ] `.gitignore` contains a single `.praxis/` line (idempotent on re-run).
- [ ] `claude --resume <session-id>` (one of the printed ids) loads a real transcript, confirming session ids are valid.

### Smoke variants worth running once

Run each in a fresh throwaway repo. They exercise paths the scripted suite covers in unit form but not against the real SDK.

- **Clean-tree skip:** Run `--no-pause` against a repo where the implement stage produces no changes (e.g. an intent like "list the files in src/ and explain each"). Expect: auto-commit stage `completed`/`stopReason: "skipped"`, no `03-commit.txt`, no new commit.
- **Recovery from validator failure:** During the paused review of `01-clarify-assess.md`, hand-edit the file to violate the H2 schema (e.g. delete the `## Acceptance` heading), then `praxis advance <run-id>`. Expect: exit 1 with the validator reason; restore the file; advance again succeeds with `stopReason: "recovered"` and zero new spend on that stage.
- **`--allow-dirty` bundling:** In a repo with one pre-existing untracked file, run `praxis run --allow-dirty --no-pause "<intent>"`. Expect: the auto-commit's `git show --name-only HEAD` lists the pre-existing file alongside the intent's new files (documented §5.4 trade-off).
- **SIGINT during implement:** Start `praxis run --no-pause "<long intent>"`, Ctrl-C while implement is mid-stream. Expect: `state.stages["implement"].status === "cancelled"`, `stopReason: "sigint"`, partial `02-implement-log.md` written, auto-commit not executed.

### After the smoke

- Note the run-ids and total USD spent in the release notes.
- `cd <praxis-cli-checkout> && npm unlink -g praxis` to detach the global symlink if you do not want it permanently.

## Docs

- [`product.md`](product.md) — full product spec. Authoritative for behavior, schemas, error modes, and roadmap.
- [`docs/features.md`](docs/features.md) — what is currently implemented and verified.
- [`docs/backlog.md`](docs/backlog.md) — known gaps, planned work, and the v0.2 roadmap.

## License

MIT
