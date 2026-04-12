# Workflows

Praxis currently ships two shared workflows across Claude Code and Codex:
`craft` and `forge`.

## Craft

`craft` is the full spec-driven and test-driven workflow.

```text
clarifying-intent -> [slicing-stories] -> sketching-design -> driving-tdd
  -> code-reviewing -> code-improving -> verifying-and-adapting
```

Current characteristics:

- starts from clarification and can expand into multi-slice delivery
- uses `driving-tdd` for implementation
- includes explicit verification at the end of the story
- supports both `manual` and `autopilot` execution

Primary shared source:

- `src/praxis/workflows/craft.md`

## Forge

`forge` is the faster delivery workflow.

```text
clarifying-intent -> [slicing-stories] -> sketching-design -> rapid-implementing
  -> code-reviewing -> code-improving
```

Current characteristics:

- starts from clarification and can expand into multi-slice delivery
- uses `rapid-implementing` instead of TDD
- confirms less and auto-advances more than `craft`
- supports both `manual` and `autopilot` execution

Primary shared source:

- `src/praxis/workflows/forge.md`

## Scope Modes

Praxis currently supports two scope modes:

- `single_story` - the run stays in one artifact scope under `.praxis/`
- `multi_slice` - the run creates a durable slice queue and writes slice-local
  artifacts under `.praxis/slices/<slice-id>/`

## Execution Modes

Praxis currently supports two execution modes:

- `manual` - the user confirms checkpoints and story-boundary activation
- `autopilot` - the runtime auto-advances `proceed` paths until a stop condition
  is recorded

## Stage Result Routing

Each completed stage writes `{artifact-dir}/results/<stage>.json`.

Praxis currently routes from:

- `route.kind`
- `data.outcome_code`
- the shared routing table in `src/praxis/runtime/routing.py`

Human-readable markdown remains the reading surface, but the JSON result files
drive progression.
