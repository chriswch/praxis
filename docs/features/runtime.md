# Runtime

Praxis currently uses `.praxis/` as its durable runtime area.

## Durable State

Core runtime artifacts:

- `.praxis/run.json`
- `.praxis/story-ledger.json`
- `.praxis/events.jsonl`
- `.praxis/results/<stage>.json`
- `.praxis/runtime/launches/<adapter>/...`
- `.praxis/runtime/workers/<worker-id>.json`
- `.praxis/runtime/sessions/<adapter>/<session-id>.json`
- `.praxis/runtime/traces/<worker-id>.jsonl`

Single-story runs write stage artifacts at `.praxis/`. Multi-slice runs write
story-local artifacts under `.praxis/slices/<slice-id>/`.

## Orchestrator

The shared runtime entrypoint is `workflow/scripts/orchestrator.py`.

It currently provides:

- run initialization
- stage-result advancement
- manual continue flow
- resume from durable state
- `show-run` snapshots with trace data

Primary commands:

```bash
python3 -m workflow.scripts.orchestrator initialize-run ...
python3 -m workflow.scripts.orchestrator advance-run ...
python3 -m workflow.scripts.orchestrator continue-run ...
python3 -m workflow.scripts.orchestrator resume-run ...
python3 -m workflow.scripts.orchestrator show-run ...
```

## Story Boundary

Praxis currently provides a durable story-boundary flow for multi-slice runs.

Implemented behavior:

- initialize the story queue from `.praxis/slice-map.json`
- checkpoint a completed story boundary
- create a bounded `handoff.json` and human-readable `handoff.md`
- activate the next story after manual confirmation or autopilot continuation
- resume a multi-slice run from disk

Primary shared source:

- `workflow/scripts/story_boundary.py`

## Handoff Rules

Praxis currently keeps cross-story context bounded.

Implemented rules:

- the next story reads only the active boundary handoff plus current dispatch and
  run metadata
- handoff payloads are budgeted and validated
- handoff inspection and validation are fail-closed

Primary shared source:

- `workflow/scripts/handoff_policy.py`

## Recovery And Trace

Praxis currently supports:

- atomic state transactions for runtime files
- recovery from partially written transactions
- event-log based run inspection
- `show-run` trace summaries for recent launch, handoff, boundary, stop, and
  resume signals

Primary shared sources:

- `workflow/scripts/durable_state.py`
- `workflow/scripts/trace_summary.py`
