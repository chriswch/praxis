---
description: Drive the fast Praxis forge workflow with one main spec checkpoint and then auto-advance unless a stage reports a blocker.
allowed-tools: Skill(praxis:clarifying-intent), Skill(praxis:slicing-stories), Skill(praxis:sketching-design), Skill(praxis:rapid-implementing), Skill(praxis:code-reviewing), Skill(praxis:code-improving)
---

# Forge

## Task

$ARGUMENTS

## Shared Sources

Load and follow:
- `../workflow/pipelines/forge.md`
- `../workflow/reference/claude-wrapper.md`

Use these shared helpers and contracts:
- `../workflow/contracts/run.schema.json`
- `../workflow/contracts/stage-result.schema.json`
- `../workflow/contracts/story-ledger.schema.json`
- `../workflow/scripts/orchestrator.py`
- `../workflow/scripts/harness_config.py`
- `../workflow/scripts/run_state.py`
- `../workflow/scripts/story_boundary.py`

## Claude-Specific Delta

- Use the listed Praxis stage skills as workers.
- `clarifying-intent` may run inline when user interaction is required.
- Prefer `rapid-implementing` for the implementation stage.
