# Praxis CLI

A CLI that drives an AI coding agent through a deterministic, resumable workflow. State your intent in one line; Praxis handles clarification, implementation, and commit.

> **Status: clarify-assess + line reporter + advance shipped.** `praxis run "<intent>"` runs pre-flight (git repo + dirty-tree gates, `.gitignore` touch-up), executes the `clarify-assess` stage against the Claude Agent SDK, validates the artifact's H2 schema with one corrective retry, writes the artifact + per-stage state, and pauses with an `advance` hint. `praxis advance <run-id>` resumes a paused run or recovers a failed/cancelled stage from its on-disk artifact (re-validating where applicable, no token spend on the recovered stage). The `LineReporter` (product.md §8) formats stage start / streamed assistant text / tool calls / errors / stage end / pause / run-done lines, with 100ms delta coalescing, plus the §11 `resuming approved plan` / `recovering …; re-validating` headlines. `--no-pause` (full autopilot) is wired through both `run` and `advance`. `implement` and `auto-commit` execution lands in S-005/S-006. See [docs/features.md](docs/features.md) for shipped behavior and [docs/backlog.md](docs/backlog.md) for the rest of the v0.1 build plan and v0.2 roadmap.

## What it does

Three sequential, artifact-mediated stages, each running in a fresh Claude Agent SDK session:

1. **`clarify-assess`** — read-only repo survey, restates intent, surfaces gaps, emits a plan with acceptance criteria. Pauses for human review.
2. **`implement`** — full-tools execution against the working tree. Writes the changes the plan describes.
3. **`auto-commit`** — generates a Conventional-Commits message and runs `git add -A && git commit`.

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

## Docs

- [`product.md`](product.md) — full product spec. Authoritative for behavior, schemas, error modes, and roadmap.
- [`docs/features.md`](docs/features.md) — what is currently implemented and verified.
- [`docs/backlog.md`](docs/backlog.md) — known gaps, planned work, and the v0.2 roadmap.

## License

MIT
