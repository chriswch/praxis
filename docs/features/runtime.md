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
- `.praxis/runtime/worktrees/<worker-id>/`
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
- worker records keep the owning `launcher_pid`, `worktree_path`, and terminal
  worker status so cleanup and diagnostics can reason from durable state
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

The worker payload also carries:

- `worker.worktree_path` so the launcher can start the provider in the correct
  shared or isolated workspace
- `resume.resumable` so adapter hooks and tooling can tell whether the durable
  session cursor is still eligible for provider-native resume

## Dispatch And Provider Resume

`praxis dispatch` is the current control-plane entrypoint for
`run.routing.pending_worker_action = resume_or_launch`.

Current shipped behavior:

- it dispatches `session_worker` and `worktree_worker` plans
- it may attempt provider-native resume through
  `src/praxis/runtime/adapters/provider_resume.py`
- `run.current.session_id` stays the durable Praxis cursor, while
  `session.provider_locator` stores the provider-issued locator when one exists
- session records carry `resumable`, `resumable_reason_code`, and
  `resumable_reason`; fresh background launches default to non-resumable until
  the launcher captures a real provider locator
- provider-native resume fails closed when the stored session is non-resumable,
  missing a provider locator, or mismatched with the active dispatch
- successful resume writes a resume record, updates the durable session record,
  keeps `run.current.session_id` on the durable Praxis cursor even when the
  provider locator rotates, appends `provider_resume_requested`,
  `provider_resume_succeeded`, and `worker_resumed`, and keeps the run in
  `await_stage_result`
- unsafe or rejected resume records `resume_fallback_used` before Praxis writes
  fresh launch, worker, and session bookkeeping
- fresh launch persists a bounded dispatch payload, starts a background worker
  launcher, and records `worker_process_started`,
  `worker_process_completed`, or `worker_process_failed`
- when a fresh provider launch emits a real locator, the launcher updates the
  durable session and launch records before the next dispatch
- isolated `worktree_worker` launches recreate stale worktrees from `HEAD`,
  block reuse while a live launcher still owns the path, and clean the worktree
  on success, failure, explicit cancellation, and terminal control-plane cleanup
- `praxis cancel` terminates the launcher process group when one is recorded,
  marks the worker cancelled, and cleans isolated worktrees best-effort

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

## Runtime Diagnostics

`praxis doctor` reports machine-readable runtime health checks with stable
`status`, `reason_code`, `message`, and `details` fields.

Current checks cover:

- recovery state
- run-state validation
- adapter harness loading
- provider CLI availability
- worker-launch command resolvability
- fresh worker-launch payload validation
- git worktree readiness for isolated workers
- stale isolated worktrees
- recorded worktree cleanup failures
- failed or cancelled worker logs

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
