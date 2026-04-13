# Runtime

Praxis keeps control-plane truth under `.praxis/` and rebuilds execution
context from durable state instead of transcript continuity.

## Durable State

Core runtime artifacts:

- `.praxis/run.json`
- `.praxis/story-ledger.json`
- `.praxis/events.jsonl`
- `.praxis/results/<stage>.json`
- `.praxis/runtime/dispatches/<worker-id>.json`
- `.praxis/runtime/launches/<adapter>/...`
- `.praxis/runtime/logs/<worker-id>.*.log`
- `.praxis/runtime/workers/<worker-id>.json`
- `.praxis/runtime/sessions/<adapter>/<session-id>.json`
- `.praxis/runtime/resumes/<adapter>/...`
- `.praxis/runtime/traces/<worker-id>.jsonl`

Single-story runs write stage artifacts at `.praxis/`. Multi-slice runs write
story-local artifacts under `.praxis/slices/<slice-id>/`.

## Worker Planning

Praxis currently plans workers through `src/praxis/runtime/workers/planning.py`.

Shipped worker classes:

- `interactive_orchestrator` for root `clarifying-intent` in manual runs
- `session_worker` for slice work and in-place implementation stages
- `worktree_worker` for isolated review or verification stages

Current worker-planning rules:

- implementation stages can reuse the active story worker
- `code-reviewing` and `verifying-and-adapting` get fresh
  `worktree_worker` plans when review independence is required
- isolated review workers run in a git worktree that shares the root `.praxis/`
  runtime directory through a symlink
- `subagent_worker` stays out of the public runtime contract

## Launch Payloads And Handoffs

`praxis build-worker-launch --repo-root . --json` returns the bounded launch
payload defined by `src/praxis/contracts/worker-launch.schema.json`.

Current payload areas include:

- `dispatch`
- `inputs`
- `context_policy`
- `harness`
- `worker`
- `permissions`
- `budgets`
- `artifact_inputs`
- `artifact_outputs_expected`
- `resume`

Fresh worker context may read only:

- the current dispatch
- run metadata from `.praxis/run.json`
- the active boundary handoff when one exists

`inputs.boundary_handoff` is the only supported cross-story carry-forward input.

## Dispatch And Provider Resume

`praxis dispatch` is the current control-plane entrypoint for
`run.routing.pending_worker_action = resume_or_launch`.

Current shipped behavior:

- it dispatches `session_worker` and `worktree_worker` plans
- it may attempt provider-native resume through
  `src/praxis/runtime/adapters/provider_resume.py`
- successful resume writes a resume record, updates the durable session record,
  appends `provider_resume_requested`, `provider_resume_succeeded`, and
  `worker_resumed`, and keeps the run in `await_stage_result`
- unsafe or rejected resume records `resume_fallback_used` before Praxis writes
  fresh launch, worker, and session bookkeeping
- fresh launch persists a bounded dispatch payload, starts a background worker
  launcher, and records worker-process lifecycle telemetry
- worker records include the actual launch surface that started the worker

Current boundary:

- provider-native resume still applies to `session_worker` launches only
- `subagent_worker` remains design-only

## Story Boundary

Praxis currently provides a durable story-boundary flow for multi-slice runs.

Implemented behavior:

- initialize the story queue from `.praxis/slice-map.json`
- checkpoint a completed story boundary
- create a bounded `handoff.json` and human-readable `handoff.md`
- activate the next story after manual confirmation or autopilot continuation
- resume a multi-slice run from disk

Primary shared source:

- `src/praxis/runtime/story_boundary.py`

## Recovery And Trace

Praxis currently supports:

- atomic state transactions for runtime files
- recovery from partially written transactions on the next command
- event-log based run inspection
- `praxis status` trace summaries for recent boundary, launch, worker-process,
  resume, stop, and recovery signals

Primary shared sources:

- `src/praxis/runtime/state/durable_state.py`
- `src/praxis/runtime/observability/trace_summary.py`
