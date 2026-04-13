# CLI

Praxis ships an installed `praxis` console command backed by
`src/praxis/cli/main.py`. Install it with `uv tool install .`, or use
`uv tool install --editable .` while developing in the repo.

Current support policy:

- supported install path: `uv tool install`
- compatibility path only: wheel or direct `pip` installs

## Stable Command Tree

Current public commands:

- `praxis init`
- `praxis run`
- `praxis status`
- `praxis continue`
- `praxis approve`
- `praxis resume`
- `praxis cancel`
- `praxis dispatch`
- `praxis submit-stage-result`
- `praxis build-worker-launch`
- `praxis harness show-adapter`
- `praxis doctor`

## Shared Options

Current shared options:

- `--repo-root PATH` selects the target repository and its `.praxis/` state
- `--json` switches stdout to the machine-readable envelope
- `--output-version 1` selects the current envelope version
- `--timestamp ISO8601Z` is accepted on mutating commands for replay and tests

`--repo-root` makes the installed CLI usable across many repos without moving
workflow truth out of the target workspace.

## JSON Output

Current JSON mode uses `output_version = 1`.

Success responses include:

- `ok = true`
- `output_version`
- `command`
- `timestamp`
- `repo_root`
- `data`

Error responses keep the same outer envelope and add an `error` object with:

- `code`
- `message`
- `details`
- `retryable`

## Exit Behavior

Current exit-code families:

- `0` - success
- `2` - invalid input, unsupported output version, or mismatched artifacts
- `3` - blocked state or no active run
- `4` - environment or harness problem
- `1` - unexpected internal failure

## Current Behavior

New control-plane commands:

- `praxis init` bootstraps native Claude or Codex repo surfaces without
  overwriting existing files unless `--force` is passed
- `praxis approve` explicitly advances `confirm_then_run` checkpoints while
  `praxis continue` remains the stable compatibility command
- `praxis cancel` marks the active run as cancelled, terminates a recorded
  launcher process group when needed, and cleans isolated worktrees best-effort
- `praxis doctor` reports machine-readable runtime checks with stable reason
  codes for harness, launch, dispatch-bundle, active-runtime, worktree, and log
  health
- `praxis status` reports the run cursor plus `dispatch_bundle`,
  `active_runtime`, approvals, policies, and trace summaries from durable state
- `praxis build-worker-launch` compiles the bounded worker payload and loads the
  repo-scoped harness surface for the active adapter
- `praxis submit-stage-result` validates the stage-result contract, confirms the
  active stage and artifact directory match, and checkpoints story boundaries
  when handoff data and commit metadata are present

`praxis dispatch` currently:

- handles `session_worker` and `worktree_worker` plans
- attempts provider-native resume only for durable `session_worker` cursors
  that are still marked resumable and have a stored provider locator
- persists a bounded dispatch bundle under `.praxis/runtime/dispatches/`
- records explicit launch and resume evidence instead of relying on transcript
  continuity
- starts a fresh background launcher process when resume is unavailable or
  unsafe
- records `worker_process_started`, `worker_process_failed`, and
  `worker_process_completed` telemetry
- lets the launcher update durable session state when a fresh provider launch
  yields a real provider locator

## Current Boundary

The shipped CLI still keeps these limits:

- `subagent_worker` bookkeeping is durable, but the public dispatch contract is
  still centered on primary `session_worker` and `worktree_worker` flows
- `praxis continue` stays in the command tree for compatibility even though
  `praxis approve` is the clearer confirmation verb
- future packaging layers such as a binary rewrite or npm wrapper remain
  follow-on product work
