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

Also use these shared contracts:

- `../../workflow/contracts/run.schema.json`
- `../../workflow/contracts/stage-result.schema.json`

## Codex Adapter Rules

- This file is a thin Codex wrapper. Do not duplicate the shared workflow logic
  here.
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
- Use `{artifact-dir}/results/<stage>.json` as the routing API. Do not rely only
  on human-readable markers in Markdown.
- If this wrapper and `../../workflow/pipelines/craft.md` ever disagree, the
  shared pipeline file wins for workflow semantics.
