# Forge Pipeline

This file is the shared source of truth for the Praxis v2 `forge` workflow.
Claude and Codex wrappers should load this file instead of duplicating the
orchestration logic in `commands/` and `skills/forge/`.

## Purpose

`forge` is the fast-delivery workflow:

`clarifying-intent` -> [`slicing-stories`] -> `sketching-design` ->
`rapid-implementing` -> [`code-reviewing` -> `code-improving`] -> done

Like `craft`, the orchestrator stays in the main session and stage skills do
bounded work in isolated contexts. Unlike `craft`, `forge` does not pause at
every stage. The spec confirmation is the main gate; the rest auto-advances
unless a downstream stage reports a blocker or required confirmation.

## Core Rules

1. The orchestrator owns the user conversation, stage routing, and checkpoint
   policy.
2. Stage skills own stage work only.
3. `.praxis/run.json` is the workflow cursor for the active run.
4. Each stage writes a structured result file to
   `{artifact-dir}/results/<stage>.json`.
5. Human-readable artifacts remain the main reading surface, but JSON result
   files are the routing source of truth.

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
- `rapid-implementing`
- `code-reviewing`
- `code-improving`

## Orchestrator Responsibilities

For each step of the workflow, the orchestrator should:

1. Load `.praxis/run.json`.
2. Determine the current scope and artifact directory.
3. Invoke the current stage skill with the current artifact directory when
   needed.
4. Read `{artifact-dir}/results/<stage>.json`.
5. Apply `forge` checkpoint policy.
6. Update `.praxis/run.json` with the next stage, scope, and routing state.

## Checkpoint Policy

`forge` confirms less and auto-advances more.

Pause only when one of these is true:

- `needs_user_input` is `true`
- `needs_confirmation` is `true`
- the current stage is `clarifying-intent`
- the user explicitly asks to inspect an intermediate artifact

Otherwise, continue automatically.

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
- `bug_fix_ready` -> confirm, then run `rapid-implementing`
- `story_spec_ready` -> confirm, then run `sketching-design`
- `feature_brief_ready` -> confirm, then run `slicing-stories`
- `clarification_needed` -> ask the user, then re-run `clarifying-intent`

Notes:

- `clarifying-intent` is the main human checkpoint in `forge`.
- For feature-level clarification, use root scope `.praxis/`.
- For slice-level clarification, use `.praxis/slices/<slice-id>/`.

### 2. `slicing-stories`

Expected outputs:

- `.praxis/slice-map.json`
- `.praxis/slice-map.md`
- `.praxis/results/slicing-stories.json`

Expected outcome codes:

- `slice_map_ready`
- `blocking_questions`

Routing:

- `slice_map_ready` -> initialize slice order in `.praxis/run.json`, activate
  the first slice, then run `clarifying-intent` for that slice
- `blocking_questions` -> ask the user, update the brief if needed, then
  re-run `slicing-stories`

Notes:

- Do not add a second confirmation step after the slice map unless the user
  explicitly asks for it.
- `slicing-stories` always runs at root scope.

### 3. `sketching-design`

Expected outputs:

- `{artifact-dir}/sketch.md` when a sketch is needed
- `{artifact-dir}/results/sketching-design.json`

Expected outcome codes:

- `sketch_ready`
- `sketch_skipped`
- `spec_issue`

Routing:

- `sketch_ready` -> auto-advance to `rapid-implementing`
- `sketch_skipped` -> auto-advance to `rapid-implementing`
- `spec_issue` -> ask the user, return to `clarifying-intent` for the same
  artifact directory, then re-run `sketching-design` if needed

### 4. `rapid-implementing`

Expected outputs:

- `{artifact-dir}/implementation.md`
- `{artifact-dir}/results/rapid-implementing.json`

Expected outcome codes:

- `implementation_complete`
- `spec_feedback`

Routing:

- `implementation_complete` -> run `code-reviewing`
- `spec_feedback` -> ask the user, return to `clarifying-intent` for the same
  artifact directory, then re-run `rapid-implementing`

### 5. `code-reviewing`

Expected outputs:

- `{artifact-dir}/review.md` when review runs
- `{artifact-dir}/results/code-reviewing.json`

Expected outcome codes:

- `review_ready`
- `review_skipped`

Routing:

- `review_ready` -> run `code-improving`
- `review_skipped` -> complete the current story or slice

### 6. `code-improving`

Expected outputs:

- `{artifact-dir}/improvement.md` when improvements run
- `{artifact-dir}/results/code-improving.json`

Expected outcome codes:

- `improvement_ready`
- `improvement_skipped`
- `spec_feedback`

Routing:

- `improvement_ready` -> complete the current story or slice
- `improvement_skipped` -> complete the current story or slice
- `spec_feedback` -> ask the user, return to `clarifying-intent` for the same
  artifact directory, then re-run `code-improving`

## Completion and Slice Advancement

When the current story or slice completes:

- if this is a single-story run, finish the workflow
- if more slices remain, checkpoint the completed story in
  `.praxis/story-ledger.json`, write the story handoff artifacts, and activate
  the next slice according to the configured execution mode
- if no slices remain, finish the workflow

Shared story-boundary rules:

- Use `.praxis/run.json` as the active cursor and `.praxis/story-ledger.json`
  as the durable queue/history record.
- Use `.praxis/slices/<slice-id>/handoff.json` and `handoff.md` as the bounded
  carry-forward context for the next story.
- Do not advance past the boundary if the product worktree is dirty or required
  commit metadata is missing.
- `forge` may auto-advance across the boundary only when the configured
  execution mode permits it; the durable checkpoint still happens first.

Completion for `forge` should summarize:

- the final `implementation.md`
- `review.md` if review ran
- `improvement.md` if improvement ran
- any low-severity or explicitly deferred items still left for the user

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

A `forge` run is complete when either:

- a trivial change ends at `clarifying-intent`
- a single-story run completes after `rapid-implementing`,
  `code-reviewing`, or `code-improving`
- a multi-slice run completes after the last slice is finished

When complete:

1. Set `status` to `completed`.
2. Clear `routing.next_action` to `finish`.
3. Leave `current.stage` as `null`.
4. Report the final artifact summary to the user.
