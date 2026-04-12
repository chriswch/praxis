# Praxis

Spec-driven software engineering workflows for Claude Code and Codex.

Praxis keeps the shared workflow semantics in `workflow/` and keeps adapter wrappers thin. The project currently provides shared `craft` and `forge` workflows, an installed `praxis` CLI, durable `.praxis` runtime state, worker-launch payloads, provider-native resume records, story-boundary handoffs, native adapter hooks, and a local eval pack.

## How To Use

### Install

```bash
python3 -m pip install .
```

For local development:

```bash
python3 -m pip install -e .
```

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

python3 -m workflow.scripts.eval_pack run --fixtures-dir tests/evals/fixtures
```

For the full command surface, use `workflow/reference/runtime-reference.md`.

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

- Installed `praxis` CLI for run control, status, dispatch bookkeeping, and harness inspection
- Durable `.praxis` state for routing, resume, and inspection
- Provider-native resume bridges with durable launch, session, and resume evidence
- Story-boundary checkpoints with bounded handoff artifacts
- Native Claude and Codex session-start hooks with launch and resume validation
- Local eval coverage for routing, boundary, resume, trace, and adapter parity

### Feature Docs

- `docs/features/cli.md`
- `docs/features/workflows.md`
- `docs/features/runtime.md`
- `docs/features/adapters.md`
- `docs/features/evals.md`

## Architecture

- `workflow/pipelines/` defines the shared `craft` and `forge` workflow shape.
- `workflow/contracts/` defines machine-readable state, result, handoff, and
  harness contracts.
- `workflow/scripts/` implements the runtime control plane, durable-state
  helpers, story-boundary logic, hooks, and eval tooling.
- `.praxis/` is the runtime state area for run cursors, story ledgers, results,
  events, launch records, worker records, session records, resume records, and traces.
- Claude-native repo surfaces live in `CLAUDE.md` and `.claude/`.
- Codex-native repo surfaces live in `AGENTS.md` and `.codex/`.

## Developer References

- Runtime reference: `workflow/reference/runtime-reference.md`
- Claude wrapper reference: `workflow/reference/claude-wrapper.md`
- Codex wrapper reference: `workflow/reference/codex-wrapper.md`
- Shared workflows: `workflow/pipelines/craft.md`, `workflow/pipelines/forge.md`
- Shared contracts: `workflow/contracts/`
- Shared runtime helpers: `workflow/scripts/`

## Eval Pack

```bash
python3 -m workflow.scripts.eval_pack run --fixtures-dir tests/evals/fixtures
```

## License

MIT
