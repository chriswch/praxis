# Praxis

Spec-driven software engineering workflows for Claude Code.

Claude commands under `commands/` are thin adapters over the shared Praxis workflow files in `workflow/`. If a Claude wrapper and a shared workflow file disagree, the shared workflow file wins.

## Commands

- `/craft`
- `/forge`

Execution policy is separate from workflow shape:
- `workflow`: `craft` or `forge`
- `mode`: `single_story` or `multi_slice`
- `run.execution.mode`: `manual` or `autopilot`

## Canonical References

- Shared runtime reference: `workflow/reference/runtime-reference.md`
- Shared Claude wrapper guidance: `workflow/reference/claude-wrapper.md`
- Shared workflows: `workflow/pipelines/craft.md`, `workflow/pipelines/forge.md`
- Shared runtime helpers: `workflow/scripts/orchestrator.py`, `workflow/scripts/harness_config.py`, `workflow/scripts/run_state.py`, `workflow/scripts/story_boundary.py`, `workflow/scripts/eval_pack.py`

## Artifact Paths

Use `.praxis/results/<stage>.json`, `run.json`, and `story-ledger.json` as the routing source of truth. Human-readable artifacts remain the reading surface.

`show-run` also surfaces a `trace` block for dispatch, recent boundary and stop signals, and recovery state.
