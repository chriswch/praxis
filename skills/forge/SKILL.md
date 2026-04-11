---
name: forge
description: Run the fast Praxis forge workflow with one main spec checkpoint and then auto-advance through design, implementation, review, and improvement. Use when the user mentions Praxis forge, `/forge`, or wants faster delivery without writing new tests.
---

# Forge

Use this as the Codex entry point for the Praxis `forge` workflow.

## Shared Sources

Load and follow:
- `../../workflow/pipelines/forge.md`
- `../../workflow/reference/codex-wrapper.md`

Use these shared helpers and contracts:
- `../../workflow/contracts/run.schema.json`
- `../../workflow/contracts/stage-result.schema.json`
- `../../workflow/contracts/story-ledger.schema.json`
- `../../workflow/scripts/orchestrator.py`
- `../../workflow/scripts/harness_config.py`
- `../../workflow/scripts/run_state.py`
- `../../workflow/scripts/story_boundary.py`

## Codex-Specific Delta

- Keep orchestration in the main session.
- Use these sibling stage skills as workers:
  - `../clarifying-intent/SKILL.md`
  - `../slicing-stories/SKILL.md`
  - `../sketching-design/SKILL.md`
  - `../rapid-implementing/SKILL.md`
  - `../code-reviewing/SKILL.md`
  - `../code-improving/SKILL.md`
