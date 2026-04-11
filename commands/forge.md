---
description: Drive the fast Praxis forge workflow with one main spec checkpoint and then auto-advance unless a stage reports a blocker.
allowed-tools: Skill(praxis:clarifying-intent), Skill(praxis:slicing-stories), Skill(praxis:sketching-design), Skill(praxis:rapid-implementing), Skill(praxis:code-reviewing), Skill(praxis:code-improving)
---

# Forge

## Task

$ARGUMENTS

## Shared Workflow Source

Load and follow `../workflow/pipelines/forge.md`.

Treat that file as the workflow source of truth for:

- stage order
- checkpoint policy
- routing behavior
- artifact scope
- completion rules
- execution-mode semantics
- story-boundary behavior
- resume rules

Also use these shared contracts and helpers:

- `../workflow/contracts/run.schema.json`
- `../workflow/contracts/stage-result.schema.json`
- `../workflow/contracts/story-ledger.schema.json`
- `../workflow/scripts/orchestrator.py`
- `../workflow/scripts/run_state.py`
- `../workflow/scripts/story_boundary.py`

## Claude Adapter Rules

- This file is a thin Claude wrapper. Do not duplicate shared workflow logic here.
- Keep orchestration in the main session.
- Use the listed Praxis stage skills as workers.
- `clarifying-intent` may run inline when user interaction is required.
- Other stages may run in isolated contexts when the stage skill configuration allows it.
- Read and write workflow state through `.praxis/`.
- Use `{artifact-dir}/results/<stage>.json` as the routing API. Do not rely only on human-readable markers in Markdown.
- Prefer `../workflow/scripts/orchestrator.py` as the runtime API for initializing runs, advancing stage results, handling manual confirmations, and resume.
- Use `../workflow/scripts/harness_config.py build-worker-launch --repo-root .` to build the fresh-worker launch payload for Claude-specific execution.
- Use `../workflow/scripts/run_state.py` and `../workflow/scripts/story_boundary.py` as lower-level helpers behind the orchestrator.
- Before invoking any fresh worker context, load the worker-launch payload and treat `inputs.boundary_handoff` as the only cross-story carry-forward input.
- If this wrapper and `../workflow/pipelines/forge.md` ever disagree, the shared pipeline file wins for workflow semantics.
