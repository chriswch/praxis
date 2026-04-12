# Forge Pipeline

This file is the shared source of truth for the Praxis v3 `forge` workflow. Claude and Codex wrappers should load this file instead of duplicating orchestration logic in adapters.

## Purpose

`forge` is the fast-delivery workflow:

`clarifying-intent` -> [`slicing-stories`] -> `sketching-design` -> `rapid-implementing` -> `code-reviewing` -> `code-improving`

Like `craft`, the orchestrator stays in the main session and stage skills do bounded work in isolated contexts. Unlike `craft`, `forge` confirms less and auto-advances more.

## Core Rules

1. The orchestrator owns the user conversation, stage routing, checkpoint policy, and resume flow.
2. Stage skills own stage work only.
3. `.praxis/run.json` is the active workflow cursor.
4. `.praxis/story-ledger.json` is the durable queue owner for multi-slice runs.
5. Each stage writes a structured result file to `{artifact-dir}/results/<stage>.json`.
6. Human-readable artifacts remain the reading surface for the user, but JSON result files, `run.json`, and `story-ledger.json` are the routing source of truth.
7. Prefer the installed `praxis` CLI as the shared runtime entrypoint for run initialization, stage-result advancement, manual confirmations, resume, dispatch, and worker-launch payloads. Use `../scripts/orchestrator.py`, `../scripts/run_state.py`, and `../scripts/story_boundary.py` as lower-level helpers behind it. Do not re-implement those transitions in runtime wrappers.

## Shared Contracts

- Run state: `../contracts/run.schema.json`
- Stage result: `../contracts/stage-result.schema.json`
- Story ledger: `../contracts/story-ledger.schema.json`

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

Single-story artifacts also live at the root. Slice-local artifacts live under their slice directory.

## Stage Names

Use these exact stage identifiers in `run.json` and result files:

- `clarifying-intent`
- `slicing-stories`
- `sketching-design`
- `rapid-implementing`
- `code-reviewing`
- `code-improving`

## Checkpoint Policy

`forge` confirms less and auto-advances more.

Pause only when one of these is true:

- `needs_user_input` is `true`
- `needs_confirmation` is `true`
- the current stage is `clarifying-intent`
- the user explicitly asks to inspect an intermediate artifact
- a story-boundary gate fails or the run records an `autopilot` stop reason

Otherwise, continue automatically.

## Result Routing Model

Route primarily by `route.kind`, then use `data.outcome_code` for stage-specific meaning.
Stage skills should leave `route.next_stage = null`; the shared workflow owns
next-stage resolution from the current workflow, stage, and outcome.

Supported route kinds:

- `proceed`
- `ask_user`
- `done`
- `next_slice`
- `rework`
- `escalate`

## Story-Boundary Runtime API

### Shared orchestrator entrypoint

For normal wrapper execution, prefer the public `praxis` CLI:

```bash
praxis run ...
praxis submit-stage-result ...
praxis continue ...
praxis resume ...
```

It initializes `.praxis/run.json`, routes stage results, invokes the lower-level helpers, and reconstructs the next action from durable state.

Use the same runtime helper described in `craft`.

- After a non-boundary stage result is written, update `.praxis/run.json` with `update-run-from-stage-result`.
- After `slicing-stories`, initialize the queue with `initialize-story-queue`.
- During `autopilot`, evaluate completed stage results with `pause-autopilot-for-stage-result` before auto-advancing.
- When a story completes, checkpoint the boundary with `checkpoint-story-boundary`.
- In `manual`, use `activate-next-story-from-boundary` after confirmation.
- On resume, use `resume-story-run-from-disk` and trust the helper's durable-state decision.

### Normal stage-to-stage run updates

For completed stages that continue to another stage in the same story, use the shared run-state helper:

```bash
python3 -m workflow.scripts.run_state update-run-from-stage-result \
  --repo-root . \
  --stage-result-path <artifact-dir>/results/<stage>.json \
  --timestamp <iso-8601-utc>
```

This command resolves `next_stage` from the shared workflow routing table and updates `.praxis/run.json` without trusting workflow-specific `route.next_stage` values from stage skills.

### Read-side story handoff before next-story `clarifying-intent`

When a story boundary activates the next slice, `run.routing.boundary_handoff_path`
points at the previous story's `.praxis/slices/<slice-id>/handoff.json`.

Before launching slice-level `clarifying-intent` in a fresh worker context, the
orchestrator must build the worker-launch payload with
`praxis build-worker-launch --repo-root . --json`.

That launch payload must:

1. include the current dispatch block for the target stage
2. if `run.current.scope = slice`, `run.current.stage = clarifying-intent`, and
   `run.routing.boundary_handoff_path` is non-null, load that handoff JSON into
   `inputs.boundary_handoff`
3. point at repo-scoped harness config for the active adapter so settings,
   hooks, and subagent patterns come from committed repo artifacts
4. treat that handoff as the only cross-story carry-forward context; do not
   rely on transcript continuity from the previous story

`workflow/scripts/run_state.py` clears `run.routing.boundary_handoff_path` once
`clarifying-intent` advances beyond itself. If `clarifying-intent` routes back
to itself for more user input, the handoff path stays in place so the retry can
be seeded from the same durable context.

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

### 2. `slicing-stories`

Expected outputs:

- `.praxis/slice-map.json`
- `.praxis/slice-map.md`
- `.praxis/results/slicing-stories.json`

Expected outcome codes:

- `slice_map_ready`
- `blocking_questions`

Routing:

- `slice_map_ready` -> initialize the story queue with `initialize-story-queue`, activate the first slice, then run `clarifying-intent` for that slice
- `blocking_questions` -> ask the user, update the brief if needed, then re-run `slicing-stories`

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
- `spec_issue` -> ask the user, return to `clarifying-intent` for the same artifact directory, then re-run `sketching-design` if needed

### 4. `rapid-implementing`

Expected outputs:

- `{artifact-dir}/implementation.md`
- `{artifact-dir}/results/rapid-implementing.json`

Expected outcome codes:

- `implementation_complete`
- `spec_feedback`

Routing:

- `implementation_complete` -> run `code-reviewing`
- `spec_feedback` -> ask the user, return to `clarifying-intent` for the same artifact directory, then re-run `rapid-implementing`

### 5. `code-reviewing`

Expected outputs:

- `{artifact-dir}/review.md` when review runs
- `{artifact-dir}/results/code-reviewing.json`

Expected outcome codes:

- `review_ready`
- `review_skipped`

Routing:

- `review_ready` -> run `code-improving`
- `review_skipped` -> complete the current story or slice through the
  story-boundary helper

### 6. `code-improving`

Expected outputs:

- `{artifact-dir}/improvement.md` when improvements run
- `{artifact-dir}/results/code-improving.json`

Expected outcome codes:

- `improvement_ready`
- `improvement_skipped`
- `spec_feedback`

Routing:

- `improvement_ready` -> complete the current story or slice through the
  story-boundary helper
- `improvement_skipped` -> complete the current story or slice through the
  story-boundary helper
- `spec_feedback` -> ask the user, return to `clarifying-intent` for the same artifact directory, then re-run `code-improving`

## Completion and Slice Advancement

When the current story or slice completes:

- if this is a single-story run, finish the workflow
- if more slices remain, checkpoint the completed story in `.praxis/story-ledger.json`, write the story handoff artifacts, and activate the next slice according to `run.execution.mode`
- if no slices remain, finish the workflow

In `forge`, story completion often arrives as `route.kind = proceed` with the
shared routing table resolving `next_stage = null` (for example
`review_skipped`, `improvement_ready`, or `improvement_skipped`). Treat that
terminal `proceed` result as a completed story boundary:

- `update-run-from-stage-result` should reject it for multi-slice runs
- `checkpoint-story-boundary` should derive `next_slice` vs final `done` from
  story-ledger order

`autopilot` may advance across story boundaries only after the durable checkpoint succeeds. Stop `autopilot` when a stage needs user input, a route asks for rework or escalation, the worktree is dirty, commit metadata is missing, the test or commit gate fails, or the run is cancelled.

## Run State Updates

After each completed stage, update `.praxis/run.json` through `../scripts/run_state.py` or `../scripts/story_boundary.py` with:

- `current.scope`
- `current.slice_id`
- `current.artifact_dir`
- `current.stage`
- `routing.next_action`
- `routing.next_stage`
- `routing.next_slice_id` when relevant
- `routing.reason`
- `routing.stop_reason_code`
- `routing.boundary_handoff_path`
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
- a single-story run completes after `rapid-implementing`, `code-reviewing`, or `code-improving`
- a multi-slice run completes after the last slice is finished

When complete:

1. Set `status` to `completed`.
2. Set `routing.next_action` to `finish`.
3. Leave `current.stage` as `null`.
4. Report the final artifact summary to the user.
