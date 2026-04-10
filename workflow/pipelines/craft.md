# Craft Pipeline

This file is the shared source of truth for the Praxis v2 `craft` workflow.
Claude and Codex wrappers should load this file instead of duplicating the
orchestration logic in `commands/` and `skills/craft/`.

## Purpose

`craft` is the full spec-driven and test-driven workflow:

`clarifying-intent` -> [`slicing-stories`] -> `sketching-design` ->
`driving-tdd` -> `code-reviewing` -> `code-improving` ->
`verifying-and-adapting`

The orchestrator stays in the main session. Stage skills do bounded work in
isolated contexts and communicate through `.praxis/` artifacts plus structured
result files.

## Core Rules

1. The orchestrator owns the user conversation, stage routing, and checkpoint
   decisions.
2. Stage skills own stage work only. They do not decide the whole workflow.
3. `.praxis/run.json` is the workflow cursor for the active run.
4. Each stage writes a structured result file to
   `{artifact-dir}/results/<stage>.json`.
5. Human-readable artifacts remain the primary reading surface for the user,
   but JSON result files are the routing source of truth.

## Shared Contracts

- Run state: `../contracts/run.schema.json`
- Stage result: `../contracts/stage-result.schema.json`

## Artifact Layout

- Root scope: `.praxis/`
- Slice scope: `.praxis/slices/<slice-id>/`

Feature-level artifacts always live at the root:

- `.praxis/brief.md`
- `.praxis/slice-map.json`
- `.praxis/slice-map.md`
- `.praxis/run.json`
- `.praxis/story-ledger.json`
- `.praxis/events.jsonl`

Single-story artifacts also live at the root. Slice-local artifacts live under
their slice directory.

## Stage Names

Use these exact stage identifiers in `run.json` and result files:

- `clarifying-intent`
- `slicing-stories`
- `sketching-design`
- `driving-tdd`
- `code-reviewing`
- `code-improving`
- `verifying-and-adapting`

## Orchestrator Responsibilities

For each step of the workflow, the orchestrator should:

1. Load `.praxis/run.json`.
2. Determine the current scope and artifact directory.
3. Invoke the current stage skill with the current artifact directory when
   needed.
4. Read `{artifact-dir}/results/<stage>.json`.
5. Present the relevant artifact summary to the user.
6. Wait for confirmation or clarification before advancing.
7. Update `.praxis/run.json` with the next stage, scope, and routing state.

## Checkpoint Policy

`craft` is stage-by-stage and artifact-driven.

- Pause after every completed non-trivial stage.
- Always pause when `needs_user_input` is `true`.
- Always honor `route.kind`.
- Present summaries, not full artifacts, unless the user asks for the full
  text.

## Result Routing Model

The orchestrator should route primarily by `route.kind`, then use
`data.outcome_code` for stage-specific meaning.

Supported route kinds:

- `proceed`
- `ask_user`
- `done`
- `next_slice`
- `rework`
- `escalate`

## Stage Routing

### 1. `clarifying-intent`

Expected outputs:

- `.praxis/brief.md` for feature-level work
- `{artifact-dir}/spec.md` for story-level work
- `{artifact-dir}/results/clarifying-intent.json`

Expected outcome codes:

- `trivial_change`
- `bug_fix_ready`
- `story_spec_ready`
- `feature_brief_ready`
- `clarification_needed`

Routing:

- `trivial_change` -> `route.kind = done`
- `bug_fix_ready` -> confirm, then run `driving-tdd`
- `story_spec_ready` -> confirm, then run `sketching-design`
- `feature_brief_ready` -> confirm, then run `slicing-stories`
- `clarification_needed` -> ask the user, then re-run `clarifying-intent`

Notes:

- For feature-level clarification, use root scope `.praxis/`.
- For slice-level clarification, use `.praxis/slices/<slice-id>/`.
- A bug fix skips `sketching-design` and enters TDD directly.

### 2. `slicing-stories`

Expected outputs:

- `.praxis/slice-map.json`
- `.praxis/slice-map.md`
- `.praxis/results/slicing-stories.json`

Expected outcome codes:

- `slice_map_ready`
- `blocking_questions`

Routing:

- `slice_map_ready` -> confirm the slice map, initialize slice order in
  `.praxis/run.json`, then run `clarifying-intent` for the first slice
- `blocking_questions` -> ask the user, update the brief if needed, then
  re-run `slicing-stories`

Notes:

- `slicing-stories` always runs at root scope.
- The root run state should record the ordered slice ids and the active slice.

### 3. `sketching-design`

Expected outputs:

- `{artifact-dir}/sketch.md` when a sketch is needed
- `{artifact-dir}/results/sketching-design.json`

Expected outcome codes:

- `sketch_ready`
- `sketch_skipped`
- `spec_issue`

Routing:

- `sketch_ready` -> confirm, then run `driving-tdd`
- `sketch_skipped` -> inform the user, then run `driving-tdd`
- `spec_issue` -> ask the user, return to `clarifying-intent` for the same
  artifact directory, then re-run `sketching-design` if needed

### 4. `driving-tdd`

Expected outputs:

- `{artifact-dir}/tdd.md`
- `{artifact-dir}/results/driving-tdd.json`

Expected outcome codes:

- `tdd_complete`
- `spec_feedback`

Routing:

- `tdd_complete` -> confirm, then run `code-reviewing`
- `spec_feedback` -> ask the user, return to `clarifying-intent` for the same
  artifact directory, then re-run `driving-tdd`

### 5. `code-reviewing`

Expected outputs:

- `{artifact-dir}/review.md` when review runs
- `{artifact-dir}/results/code-reviewing.json`

Expected outcome codes:

- `review_ready`
- `review_skipped`

Routing:

- `review_ready` -> confirm, then run `code-improving`
- `review_skipped` -> inform the user, then run `verifying-and-adapting`

### 6. `code-improving`

Expected outputs:

- `{artifact-dir}/improvement.md` when improvements run
- `{artifact-dir}/results/code-improving.json`

Expected outcome codes:

- `improvement_ready`
- `improvement_skipped`
- `spec_feedback`

Routing:

- `improvement_ready` -> confirm, then run `verifying-and-adapting`
- `improvement_skipped` -> inform the user, then run `verifying-and-adapting`
- `spec_feedback` -> ask the user, return to `clarifying-intent` for the same
  artifact directory, then re-run `code-improving`

### 7. `verifying-and-adapting`

Expected outputs:

- `{artifact-dir}/verification.md`
- `{artifact-dir}/results/verifying-and-adapting.json`

Expected outcome codes:

- `done`
- `next_slice`
- `rework`
- `escalate`

Routing:

- `done` -> confirm the verification summary and finish the run if this is a
  single story or the last slice
- `next_slice` -> confirm, mark the current slice complete in `.praxis/run.json`,
  checkpoint the completed story into `.praxis/story-ledger.json`, write
  `.praxis/slices/<slice-id>/handoff.json` and `handoff.md`, then arm the next
  slice behind a manual confirmation before `clarifying-intent` runs
- `rework` -> confirm the gap, then return to `driving-tdd` for the same
  artifact directory
- `escalate` -> confirm the scope issue, switch back to root scope `.praxis/`,
  and run `clarifying-intent` at feature level

Manual story-boundary rules for multi-slice runs:

- Treat `.praxis/run.json` as the active cursor and `.praxis/story-ledger.json`
  as the durable queue/history record.
- When a story completes and another slice remains, do not rely on transcript
  continuity; write bounded carry-forward context to the story handoff
  artifacts.
- Do not activate the next story if the product worktree is dirty or required
  commit metadata is missing.
- In manual mode, stop after boundary checkpointing with
  `routing.next_action = confirm_then_run`.

## Run State Updates

After each completed stage, update `.praxis/run.json` with:

- `current.scope`
- `current.slice_id`
- `current.artifact_dir`
- `current.stage`
- `routing.next_action`
- `routing.next_stage`
- `routing.next_slice_id` when relevant
- `status`
- `timestamps.updated_at`

Recommended status values:

- `running`
- `waiting_for_user`
- `completed`
- `cancelled`
- `failed`

## Completion Rules

A `craft` run is complete when either:

- a trivial change ends at `clarifying-intent`
- a single-story run reaches `verifying-and-adapting` with `route.kind = done`
- a multi-slice run has no remaining slices after the last
  `verifying-and-adapting` result with `route.kind = done`

When complete:

1. Set `status` to `completed`.
2. Clear `routing.next_action` to `finish`.
3. Leave `current.stage` as `null`.
4. Report the final artifact summary to the user.
