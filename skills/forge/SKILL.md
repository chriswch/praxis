---
name: forge
description: Run the fast Praxis forge workflow with one main spec checkpoint and then auto-advance through design, implementation, review, and improvement. Use when the user mentions Praxis forge, `/forge`, or wants faster delivery without writing new tests.
---

# Forge

Use this as the Codex entry point for the Praxis `forge` workflow.

## Shared Workflow Source

Load and follow `../../workflow/pipelines/forge.md`.

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

- `../../workflow/contracts/run.schema.json`
- `../../workflow/contracts/stage-result.schema.json`
- `../../workflow/contracts/story-ledger.schema.json`
- `../../workflow/scripts/story_boundary.py`

## Codex Adapter Rules

- This file is a thin Codex wrapper. Do not duplicate shared workflow logic here.
- Keep orchestration in the main session.
- Use these sibling stage skills as workers:
  - `../clarifying-intent/SKILL.md`
  - `../slicing-stories/SKILL.md`
  - `../sketching-design/SKILL.md`
  - `../rapid-implementing/SKILL.md`
  - `../code-reviewing/SKILL.md`
  - `../code-improving/SKILL.md`
- Read and write workflow state through `.praxis/`.
- Use `{artifact-dir}/results/<stage>.json` as the routing API. Do not rely only on human-readable markers in Markdown.
- For multi-slice runs, use `../../workflow/scripts/story_boundary.py` as the runtime API for queue initialization, story-boundary checkpointing, activation, autopilot pauses, and resume. Do not re-implement those transitions in this wrapper.
- If this wrapper and `../../workflow/pipelines/forge.md` ever disagree, the shared pipeline file wins for workflow semantics.
