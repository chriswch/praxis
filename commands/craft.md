---
description: Drive the full Praxis craft workflow with user checkpoints between stages.
allowed-tools: Skill(praxis:clarifying-intent), Skill(praxis:slicing-stories), Skill(praxis:sketching-design), Skill(praxis:driving-tdd), Skill(praxis:code-reviewing), Skill(praxis:code-improving), Skill(praxis:verifying-and-adapting)
---

# Craft

## Task

$ARGUMENTS

## Shared Workflow Source

Load and follow `../workflow/pipelines/craft.md`.

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
- Use `../workflow/scripts/run_state.py` as the runtime API for non-boundary stage-to-stage `run.json` updates.
- For multi-slice runs, use `../workflow/scripts/story_boundary.py` as the runtime API for queue initialization, story-boundary checkpointing, activation, autopilot pauses, and resume. Do not re-implement those transitions in this wrapper.
- If this wrapper and `../workflow/pipelines/craft.md` ever disagree, the shared pipeline file wins for workflow semantics.
