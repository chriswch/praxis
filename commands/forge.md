---
description: Drive the fast Praxis forge workflow with one main spec checkpoint and then auto-advance unless a stage reports a blocker.
allowed-tools: Skill(praxis:clarifying-intent), Skill(praxis:slicing-stories), Skill(praxis:sketching-design), Skill(praxis:rapid-implementing), Skill(praxis:code-reviewing), Skill(praxis:code-improving)
---

# Forge

## Task

$ARGUMENTS

## Shared Sources

Load and follow:
- `../src/praxis/workflows/forge.md`
- `../src/praxis/workflows/reference/claude-wrapper.md`

Use these shared helpers and contracts:
- `../src/praxis/contracts/run.schema.json`
- `../src/praxis/contracts/stage-result.schema.json`
- `../src/praxis/contracts/story-ledger.schema.json`
- `../src/praxis/runtime/orchestrator.py`
- `../src/praxis/runtime/adapters/harness.py`
- `../src/praxis/runtime/run_state.py`
- `../src/praxis/runtime/story_boundary.py`

## Claude-Specific Delta

- Use the listed Praxis stage skills as workers.
- `clarifying-intent` may run inline when user interaction is required.
- Prefer `rapid-implementing` for the implementation stage.
