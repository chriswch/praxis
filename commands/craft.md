---
description: Drive the full Praxis craft workflow with user checkpoints between stages.
allowed-tools: Skill(praxis:clarifying-intent), Skill(praxis:slicing-stories), Skill(praxis:sketching-design), Skill(praxis:driving-tdd), Skill(praxis:code-reviewing), Skill(praxis:code-improving), Skill(praxis:verifying-and-adapting)
---

# Craft

## Task

$ARGUMENTS

## Shared Sources

Load and follow:
- `../src/praxis/workflows/craft.md`
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
- Prefer `driving-tdd` and `verifying-and-adapting` for the implementation and closeout stages.
