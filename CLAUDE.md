# Praxis

Spec-driven software engineering workflows for Claude Code.

Claude commands under `commands/` are thin adapters over the shared Praxis v3 workflow files in `workflow/`. If a Claude wrapper and a shared workflow file disagree, the shared workflow file wins.

## Workflow

`/craft`: `clarifying-intent` -> [`slicing-stories`] -> `sketching-design` -> `driving-tdd` -> `code-reviewing` -> `code-improving` -> `verifying-and-adapting`

`/forge`: `clarifying-intent` -> [`slicing-stories`] -> `sketching-design` -> `rapid-implementing` -> `code-reviewing` -> `code-improving`

Execution policy is separate from workflow shape:

- `workflow`: `craft` or `forge`
- `mode`: `single_story` or `multi_slice`
- `run.execution.mode`: `manual` or `autopilot`

## Shared Runtime Files

- `workflow/pipelines/craft.md`
- `workflow/pipelines/forge.md`
- `workflow/contracts/run.schema.json`
- `workflow/contracts/stage-result.schema.json`
- `workflow/contracts/story-ledger.schema.json`
- `workflow/scripts/orchestrator.py`
- `workflow/scripts/run_state.py`
- `workflow/scripts/routing.py`
- `workflow/scripts/story_boundary.py`

Use `workflow/scripts/orchestrator.py` as the shared runtime entrypoint for initializing runs, advancing stage results, handling manual confirmations, and resuming from `.praxis/`.

Use `workflow/scripts/story_boundary.py` as the lower-level runtime helper for:

- initializing a multi-story queue after `slicing-stories`
- checkpointing a completed story boundary
- pausing `autopilot` on operator-required stage results
- activating the next story after manual confirmation
- resuming an interrupted multi-story run from `.praxis/`

Use `workflow/scripts/run_state.py` as the lower-level helper for ordinary stage-to-stage `run.json` updates.

Do not re-implement these transitions in Claude-specific wrappers.

Read-side handoff contract:

- Before launching slice-level `clarifying-intent` for a newly activated story, load `.praxis/run.json`.
- If `run.routing.boundary_handoff_path` is set, load that handoff JSON and pass it into the fresh worker context as explicit input.
- Treat that handoff as the only cross-story carry-forward context; do not rely on old transcript continuity.
- `workflow/scripts/run_state.py` clears `run.routing.boundary_handoff_path` once `clarifying-intent` advances beyond itself. If clarification loops back to itself, the handoff path remains available for the retry.

## Artifact Paths

Human-readable artifacts:

| Artifact | Path | Producer |
| --- | --- | --- |
| Feature Brief | `brief.md` | `clarifying-intent` |
| Slice Map | `slice-map.json`, `slice-map.md` | `slicing-stories` |
| Story-Level Spec | `spec.md` | `clarifying-intent` |
| Design Sketch | `sketch.md` | `sketching-design` |
| TDD Session | `tdd.md` | `driving-tdd` |
| Implementation Summary | `implementation.md` | `rapid-implementing` |
| Code Review | `review.md` | `code-reviewing` |
| Improvement | `improvement.md` | `code-improving` |
| Verification | `verification.md` | `verifying-and-adapting` |
| Story Handoff | `handoff.json`, `handoff.md` | story-boundary helper |

Structured runtime artifacts:

| Artifact | Path | Purpose |
| --- | --- | --- |
| Run State | `run.json` | Active workflow cursor |
| Story Ledger | `story-ledger.json` | Durable queue owner for multi-slice runs |
| Lifecycle Events | `events.jsonl` | Resume and audit trail |
| Stage Result | `results/<stage>.json` | Stage routing and outcome state |

Single-story artifacts live at `.praxis/`. Multi-slice artifacts live under `.praxis/slices/{slice-id}/`. Feature-level artifacts always live at `.praxis/` root.

Use the markdown artifact as the reading surface for the user, but use `.praxis/results/<stage>.json`, `run.json`, and `story-ledger.json` as the routing source of truth.
