# CLI Reference

The `praxis` binary is the product entrypoint. Public commands drive normal use; internal control-plane commands back automation and debugging.

## Global Flags

- `--repo-root <path>` — repo the CLI operates on.
- `--json` — emit machine-readable output.

## Public Commands

```bash
praxis run "<intent>" [--adapter claude|codex] [--max-passes N] \
  [--severity-threshold critical|high|medium|low] [--scope <path>...]
praxis continue --repo-root . --json
praxis resume   --repo-root . --json
praxis approve  --repo-root . --note "..." --json
praxis cancel   --repo-root . --note "..."
praxis status   --repo-root . --json
praxis inspect  --repo-root . --json
praxis doctor   --repo-root . --json
```

### `praxis run`

The iterative entry. Takes user intent as a positional argument, persists it as `.praxis/objective.md`, and starts the convergence loop. Defaults that make the bare command work:

- `--adapter` — detected from the environment (`claude` if the Claude Code CLI resolves; otherwise `codex`).
- `--max-passes` — 8.
- `--severity-threshold` — `medium`.
- `--scope` — repo root.
- Loop mode — autopilot; auto-continue until a stop condition fires.

`praxis converge run --objective <path>` remains as an internal/advanced entry that takes a pre-written objective file. Prefer `praxis run "<intent>"`.

### Lifecycle Verbs

- `continue` — advance a paused run past the current checkpoint.
- `resume` — recover from an interrupted run using `.praxis/` state.
- `approve` — approve the current checkpoint (manual execution mode).
- `cancel` — stop the active run.
- `status` — print the current run cursor and next action.
- `inspect` — print durable run state for debugging.
- `doctor` — validate adapter availability, plugin discoverability, and campaign state.

## Internal Control-Plane Commands

Used by workers and automation:

- `praxis dispatch` — compile a dispatch for the current stage.
- `praxis build-worker-launch` — materialize a worker launch payload.
- `praxis submit-stage-result` — validate and accept a stage-result file.
- `praxis register-worker-session` — attach a provider session to a dispatch.
- `praxis run-claude-worker`, `praxis run-codex-worker` — host a provider subprocess.
- `praxis converge-run`, `praxis converge-continue`, `praxis converge-resume`, `praxis converge-cancel`, `praxis converge-status`, `praxis converge-inspect` — converge-campaign control.

## Worker Lifecycle

Operator sequence when driving manually:

1. `praxis dispatch` — compile the dispatch for the next stage.
2. `praxis build-worker-launch` — produce the launch payload; start the worker from it.
3. `praxis register-worker-session` — attach the live session to the dispatch.
4. Worker writes a stage-result file; then `praxis submit-stage-result` validates and applies it.

Notes:

- v1 supports one owning worker at a time.
- Every stage runs in the target repo's current worktree. Review stays fresh through a new Praxis-owned session, not a detached review worktree.
- Workflow progression is routed from stage-result artifacts, not transcripts.
- Multi-slice carry-forward is explicit through `handoff.json` at story boundaries.

## Convergence Profiles

`praxis run` uses a profile to shape gap assessment. Built-in profiles:

- `product-spec-gap` (default) — assess the repo against the derived target spec.
- `architecture-gap` — assess the repo against an architectural target spec.

Profile names are an enum in `src/praxis-ts/src/contracts/model.ts`.
