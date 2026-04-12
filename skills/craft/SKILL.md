---
name: craft
description: Run the full Praxis craft workflow with user checkpoints between stages. Use when the user mentions Praxis craft, `/craft`, or wants clarification, design, TDD, review, improvement, and verification as one guided flow.
---

# Craft

Use this as the Codex entry point for the Praxis `craft` workflow.

## Shared Sources

Load and follow:
- `../../src/praxis/workflows/craft.md`
- `../../src/praxis/workflows/reference/codex-wrapper.md`

Use these shared helpers and contracts:
- `../../src/praxis/contracts/run.schema.json`
- `../../src/praxis/contracts/stage-result.schema.json`
- `../../src/praxis/contracts/story-ledger.schema.json`
- `../../src/praxis/runtime/orchestrator.py`
- `../../src/praxis/runtime/adapters/harness.py`
- `../../src/praxis/runtime/run_state.py`
- `../../src/praxis/runtime/story_boundary.py`

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
