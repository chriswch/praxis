# Praxis

Spec-driven software engineering workflows for Claude Code and Codex.

Praxis keeps the shared workflow semantics in `src/praxis/` and keeps adapter
wrappers thin. The project currently ships shared `craft` and `forge`
workflows, an installed `praxis` CLI, durable `.praxis` runtime state,
per-dispatch bundles, approval and policy evidence, provider-native resume
bookkeeping, story-boundary handoffs, native adapter hooks, and a local eval
pack.

## How To Use

### Install

Praxis currently supports `uv tool install` as its public install path.

```bash
uv tool install .
```

For local development:

```bash
uv tool install --editable .
```

Wheel and direct `pip` installs remain compatibility paths, but they are not
the supported user-facing install contract.

### Native entry points

- Claude: `/craft`, `/forge`
- Codex: `skills/craft/SKILL.md`, `skills/forge/SKILL.md`

### Runtime commands

```bash
praxis run \
  --repo-root . \
  --workflow forge \
  --entry-task "Describe the change" \
  --adapter codex \
  --execution-mode manual \
  --json

praxis status --repo-root . --json
praxis inspect --repo-root .
praxis build-worker-launch --repo-root . --json
praxis dispatch --repo-root . --json
praxis submit-stage-result \
  --repo-root . \
  --stage-result-path .praxis/results/rapid-implementing.json \
  --json
python3 -m praxis.runtime.observability.eval_pack native-gate --fixtures-dir tests/evals/fixtures
```

For the operational runtime contract, use
`src/praxis/workflows/reference/runtime-reference.md`.

## Workflows

### Craft

```text
clarifying-intent -> [slicing-stories] -> sketching-design -> driving-tdd
  -> code-reviewing -> code-improving -> verifying-and-adapting
```

### Forge

```text
clarifying-intent -> [slicing-stories] -> sketching-design -> rapid-implementing
  -> code-reviewing -> code-improving -> done
```

Execution policy stays separate from workflow shape:

- `workflow`: `craft` or `forge`
- `mode`: `single_story` or `multi_slice`
- `run.execution.mode`: `manual` or `autopilot`

## Core Features

- Installed `praxis` CLI for run control, status, dispatch, checkpoints, and
  harness inspection
- Durable `.praxis` state for routing, recovery, and operator inspection
- Dispatch bundles with launch payloads, dispatch records, context manifests,
  and bounded tool manifests
- Approval and policy records with stable reason codes
- Provider-native resume bridges with durable launch, session, and resume
  evidence
- Story-boundary checkpoints with bounded `handoff.json` and `handoff.md`
- Native Claude and Codex session-start hooks with launch and resume validation
- Local eval coverage for routing, boundary, resume, trace, native harness, and
  adapter parity

### Feature Docs

- `docs/features/cli.md`
- `docs/features/workflows.md`
- `docs/features/runtime.md`
- `docs/features/adapters.md`
- `docs/features/evals.md`

## Architecture

- `src/praxis/workflows/` defines the shared `craft` and `forge` workflow
  shape.
- `src/praxis/contracts/` defines machine-readable state, result, handoff, and
  harness contracts.
- `src/praxis/runtime/` implements the runtime control plane, context
  compilation, dispatch, recovery, hooks, and eval tooling.
- `.praxis/` is the runtime state area for run cursors, story ledgers, stage
  results, dispatch bundles, approvals, policies, launch records, worker
  records, session records, resume records, and traces.
- Claude-native repo surfaces live in `CLAUDE.md` and `.claude/`.
- Codex-native repo surfaces live in `AGENTS.md` and `.codex/`.

## Developer References

- Runtime reference: `src/praxis/workflows/reference/runtime-reference.md`
- Claude wrapper reference: `src/praxis/workflows/reference/claude-wrapper.md`
- Codex wrapper reference: `src/praxis/workflows/reference/codex-wrapper.md`
- Shared workflows: `src/praxis/workflows/craft.md`,
  `src/praxis/workflows/forge.md`
- Shared contracts: `src/praxis/contracts/`
- Shared runtime helpers: `src/praxis/runtime/`

## Eval Pack

```bash
python3 -m praxis.runtime.observability.eval_pack run --fixtures-dir tests/evals/fixtures
```

## License

MIT
