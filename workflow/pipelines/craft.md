# Craft Pipeline

This file is the shared source of truth for the Praxis v3 `craft` workflow. Claude and Codex wrappers should load this file instead of duplicating orchestration logic in adapters.

## Purpose

`craft` is the full spec-driven and test-driven workflow:

`clarifying-intent` -> [`slicing-stories`] -> `sketching-design` -> `driving-tdd` -> `code-reviewing` -> `code-improving` -> `verifying-and-adapting`

The orchestrator stays in the main session. Stage skills do bounded work in isolated contexts and communicate through `.praxis/` artifacts plus structured result files.

## Core Rules

1. The orchestrator owns the user conversation, stage routing, checkpoint decisions, and resume flow.
2. Stage skills own stage work only. They do not decide the whole workflow.
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
- `driving-tdd`
- `code-reviewing`
- `code-improving`
- `verifying-and-adapting`

## Execution Modes

`craft` supports two execution policies:

- `manual`: pause after every completed non-trivial stage and after each story boundary checkpoint.
- `autopilot`: auto-run `proceed` and `next_slice` routes when no stop condition exists.

Always pause when either of these is true:

- `needs_user_input` is `true`
- `route.kind` is `ask_user`, `rework`, or `escalate`
- a story-boundary gate fails

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

### Initialize the queue after `slicing-stories`

When a slice map is accepted for a multi-slice run, initialize the durable queue before starting the first story:

```bash
python3 -m workflow.scripts.story_boundary initialize-story-queue \
  --repo-root . \
  --slice-map-path .praxis/slice-map.json \
  --timestamp <iso-8601-utc>
```

This command creates `.praxis/story-ledger.json`, activates the first story, updates `.praxis/run.json`, and appends a `story_queue_initialized` event.

### Pause `autopilot` on stage-level stop conditions

After a completed stage result is written during `autopilot`, evaluate whether the run must stop before auto-advancing:

```bash
python3 -m workflow.scripts.story_boundary pause-autopilot-for-stage-result \
  --repo-root . \
  --stage-result-path <artifact-dir>/results/<stage>.json \
  --timestamp <iso-8601-utc>
```

If the helper reports `paused = true`, stop and show the operator the recorded reason from `.praxis/run.json`.

### Checkpoint a completed story boundary

When `verifying-and-adapting` returns `route.kind = next_slice` or `route.kind = done`, checkpoint the story boundary through the helper.

Required JSON inputs:

```json
{
  "start_commit": "abc1111",
  "end_commit": "def2222",
  "commits": ["abc1111", "def2222"]
}
```

```json
{
  "summary": "What this story delivered.",
  "carry_forward_context": [
    "Only the context the next story actually needs."
  ],
  "changed_paths": [
    "path/to/file"
  ]
}
```

Invoke:

```bash
python3 -m workflow.scripts.story_boundary checkpoint-story-boundary \
  --repo-root . \
  --stage-result-path .praxis/slices/<slice-id>/results/verifying-and-adapting.json \
  --commit-meta-path /tmp/commit-meta.json \
  --handoff-data-path /tmp/handoff-data.json \
  --timestamp <iso-8601-utc>
```

Pass `--dirty-path <path>` for each dirty product-worktree path and `--gate-failure <code>` for each failed boundary gate. In `autopilot`, pass `--cancel-requested` if the operator cancelled before the next story activates.

The helper writes story handoff artifacts, updates `run.json` and `story-ledger.json`, appends lifecycle events, and either arms or activates the next story based on `run.execution.mode`.

### Activate the next story after manual confirmation

In `manual`, once the user confirms continuing from a checkpointed boundary:

```bash
python3 -m workflow.scripts.story_boundary activate-next-story-from-boundary \
  --repo-root . \
  --timestamp <iso-8601-utc>
```

### Resume from durable state

On a resumed multi-slice run, let the helper reconstruct the exact next action from `.praxis/` artifacts:

```bash
python3 -m workflow.scripts.story_boundary resume-story-run-from-disk \
  --repo-root . \
  --timestamp <iso-8601-utc>
```

Trust the helper's returned state summary. Resume decisions come from durable artifacts, not transcript continuity.

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

### 2. `slicing-stories`

Expected outputs:

- `.praxis/slice-map.json`
- `.praxis/slice-map.md`
- `.praxis/results/slicing-stories.json`

Expected outcome codes:

- `slice_map_ready`
- `blocking_questions`

Routing:

- `slice_map_ready` -> confirm the slice map, initialize the story queue with `initialize-story-queue`, then run `clarifying-intent` for the first slice
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

- `sketch_ready` -> confirm, then run `driving-tdd`
- `sketch_skipped` -> inform the user, then run `driving-tdd`
- `spec_issue` -> ask the user, return to `clarifying-intent` for the same artifact directory, then re-run `sketching-design` if needed

### 4. `driving-tdd`

Expected outputs:

- `{artifact-dir}/tdd.md`
- `{artifact-dir}/results/driving-tdd.json`

Expected outcome codes:

- `tdd_complete`
- `spec_feedback`

Routing:

- `tdd_complete` -> confirm, then run `code-reviewing`
- `spec_feedback` -> ask the user, return to `clarifying-intent` for the same artifact directory, then re-run `driving-tdd`

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
- `spec_feedback` -> ask the user, return to `clarifying-intent` for the same artifact directory, then re-run `code-improving`

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

- `done` -> checkpoint the story boundary, then finish the run if this is a single story or the last slice
- `next_slice` -> checkpoint the completed story boundary, then either arm the next slice behind manual confirmation or activate it immediately in `autopilot`
- `rework` -> confirm the gap, then return to `driving-tdd` for the same artifact directory
- `escalate` -> confirm the scope issue, switch back to root scope `.praxis/`, and run `clarifying-intent` at feature level

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

A `craft` run is complete when either:

- a trivial change ends at `clarifying-intent`
- a single-story run reaches `verifying-and-adapting` with `route.kind = done`
- a multi-slice run has no remaining slices after the last `verifying-and-adapting` result with `route.kind = done`

When complete:

1. Set `status` to `completed`.
2. Set `routing.next_action` to `finish`.
3. Leave `current.stage` as `null`.
4. Report the final artifact summary to the user.
