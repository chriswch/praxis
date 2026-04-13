# CLI

Praxis ships an installed `praxis` console command backed by
`src/praxis/cli/main.py`. Install it with `uv tool install .`, or use
`uv tool install --editable .` while developing in the repo.

## Stable Command Tree

Current public commands:

- `praxis run`
- `praxis status`
- `praxis continue`
- `praxis resume`
- `praxis dispatch`
- `praxis submit-stage-result`
- `praxis build-worker-launch`
- `praxis harness show-adapter`

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

## Current Boundary

The current CLI stops at the shipped control-plane surface.

Not implemented yet:

- `praxis init`
- `praxis approve`
- `praxis cancel`
- `praxis doctor`

`praxis dispatch` also has a narrow boundary today:

- it handles `session_worker` plans only
- it can attempt provider-native resume for an existing session
- it records fresh-launch bookkeeping when Praxis needs to relaunch
- it does not yet spawn a brand-new external Claude or Codex worker process by itself
