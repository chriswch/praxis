---
name: craft
description: Run the full Praxis craft workflow with user checkpoints between stages. Use when the user mentions Praxis craft, `/craft`, or wants clarification, design, TDD, review, improvement, and verification as one guided flow.
---

# Craft

Use this as the Codex entry point for the Praxis `craft` workflow.

## Shared Sources

Load and follow:
- `../../workflow/pipelines/craft.md`
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
  - `../driving-tdd/SKILL.md`
  - `../code-reviewing/SKILL.md`
  - `../code-improving/SKILL.md`
  - `../verifying-and-adapting/SKILL.md`
