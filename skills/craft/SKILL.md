---
name: craft
description: Run the full Praxis craft workflow with user checkpoints between stages. Use when the user mentions Praxis craft, `/craft`, or wants clarification, design, TDD, review, improvement, and verification as one guided flow.
---

# Craft

Use this as the Codex entry point for the Praxis `craft` workflow.

## Shared Workflow Source

Load and follow `../../workflow/pipelines/craft.md`.

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
- `../../workflow/scripts/run_state.py`
- `../../workflow/scripts/story_boundary.py`

## Codex Adapter Rules

- This file is a thin Codex wrapper. Do not duplicate shared workflow logic here.
- Keep orchestration in the main session.
- Use these sibling stage skills as workers:
  - `../clarifying-intent/SKILL.md`
  - `../slicing-stories/SKILL.md`
  - `../sketching-design/SKILL.md`
  - `../driving-tdd/SKILL.md`
  - `../code-reviewing/SKILL.md`
  - `../code-improving/SKILL.md`
  - `../verifying-and-adapting/SKILL.md`
- Read and write workflow state through `.praxis/`.
- Use `{artifact-dir}/results/<stage>.json` as the routing API. Do not rely only on human-readable markers in Markdown.
- Use `../../workflow/scripts/run_state.py` as the runtime API for non-boundary stage-to-stage `run.json` updates.
- For multi-slice runs, use `../../workflow/scripts/story_boundary.py` as the runtime API for queue initialization, story-boundary checkpointing, activation, autopilot pauses, and resume. Do not re-implement those transitions in this wrapper.
- Before invoking slice-level `clarifying-intent` for a newly activated story, load `.praxis/run.json`; if `routing.boundary_handoff_path` is set, load that handoff JSON and include it in the fresh worker context.
- If this wrapper and `../../workflow/pipelines/craft.md` ever disagree, the shared pipeline file wins for workflow semantics.
