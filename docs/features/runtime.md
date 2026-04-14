# Runtime

Praxis keeps control-plane truth under `.praxis/` and rebuilds execution
context from durable state instead of transcript continuity.

## Durable State

Core runtime artifacts:

- `.praxis/run.json`
- `.praxis/story-ledger.json`
- `.praxis/events.jsonl`
- `.praxis/results/<stage>.json`
- `.praxis/slices/<slice-id>/...`
- `.praxis/runtime/dispatches/<dispatch-id>/worker-launch.json`
- `.praxis/runtime/dispatches/<dispatch-id>/dispatch-record.json`
- `.praxis/runtime/dispatches/<dispatch-id>/context-manifest.json`
- `.praxis/runtime/dispatches/<dispatch-id>/tool-manifest.json`
- `.praxis/runtime/launches/<adapter>/...`
- `.praxis/runtime/workers/<worker-id>.json`
- `.praxis/runtime/worktrees/<worker-id>/`
- `.praxis/runtime/sessions/<adapter>/<session-id>.json`
- `.praxis/runtime/resumes/<adapter>/...`
- `.praxis/runtime/approvals/...`
- `.praxis/runtime/policies/...`
- `.praxis/runtime/traces/<worker-id>.jsonl`
- `.praxis/runtime/logs/<worker-id>.*.log`

Single-story runs write stage artifacts at `.praxis/`. Multi-slice runs write
story-local artifacts under `.praxis/slices/<slice-id>/`.

## Worker Planning

Praxis currently plans workers through `src/praxis/runtime/workers/planning.py`.

Shipped worker classes:

- `interactive_orchestrator` for root `clarifying-intent` in manual runs
- `session_worker` for slice work and in-place implementation stages
- `worktree_worker` for isolated review or verification stages
- `subagent_worker` for explicit non-owning sidecar work recorded durably

Current worker-planning rules:

- implementation stages can reuse the active story worker
- `code-reviewing` and `verifying-and-adapting` get fresh
  `worktree_worker` plans when review independence is required
- isolated review workers run in a git worktree that shares the root `.praxis/`
  runtime directory through a symlink
- sidecar workers are tracked with explicit non-owning ownership metadata so
  they cannot silently advance the run
- worker records keep the owning `launcher_pid`, `worktree_path`, permission
  profile, isolation metadata, and terminal worker status so cleanup and
  diagnostics can reason from durable state

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

`inputs.boundary_handoff` is the only supported cross-story carry-forward
input.

Before a native launch or resume, Praxis persists a dispatch bundle under
`.praxis/runtime/dispatches/<dispatch-id>/`. The bundle includes the
worker-launch payload, a dispatch record, a context manifest that explains
which inputs were injected and why, and a bounded tool manifest.

## Dispatch, Launch, And Provider Resume

`praxis dispatch` is the current control-plane entrypoint for
`run.routing.pending_worker_action = resume_or_launch`.

Current shipped behavior:

- it dispatches `session_worker` and `worktree_worker` plans
- it records dispatch intent before adapter launch or resume begins
- it may attempt provider-native resume through
  `src/praxis/runtime/adapters/provider_resume.py`
- `run.current.session_id` stays the durable Praxis cursor, while
  `session.provider_locator` stores the provider-issued locator when one exists
- session records carry `resumable`, `resumable_reason_code`,
  `resumable_reason`, and `last_resume_outcome`
- provider-native resume fails closed when the stored session is non-resumable,
  missing a provider locator, or mismatched with the active dispatch
- successful resume writes a resume record, updates the durable session record,
  keeps `run.current.session_id` on the durable Praxis cursor even when the
  provider locator rotates, and appends resume lifecycle events to the trace
- unsafe or rejected resume records `resume_fallback_used` before Praxis writes
  fresh launch, worker, and session bookkeeping
- fresh launch persists native launch evidence, starts a background worker
  launcher, and records worker-process telemetry
- isolated `worktree_worker` launches recreate stale worktrees from `HEAD`,
  block reuse while a live launcher still owns the path, and clean the
  worktree on success, failure, explicit cancellation, and terminal cleanup
- `praxis cancel` terminates the launcher process group when one is recorded,
  marks the worker cancelled, and cleans isolated worktrees best-effort

## Story Boundary

Praxis currently provides a durable story-boundary flow for multi-slice runs.

Implemented behavior:

- initialize the story queue from `.praxis/slice-map.json`
- checkpoint a completed story boundary after the final stage result for that
  slice
- create a bounded `handoff.json` and human-readable `handoff.md`
- record story-boundary policy outcomes with stable reason codes
- activate the next story after manual confirmation or autopilot continuation
- finish the run cleanly on the final story while still writing the completed
  handoff artifact
- resume a multi-slice run from disk without relying on transcript continuity

Primary shared source:

- `src/praxis/runtime/story_boundary.py`

## Status, Inspect, Doctor, Recovery, And Trace

`praxis status --repo-root . --json` reconstructs the current runtime boundary
from durable state.

Current status surface includes:

- the active run cursor and dispatch summary
- `dispatch_bundle` with bundle availability and recovery state
- `active_runtime` for the linked worker, session, launch, resume, and trace
  artifacts
- approval and policy summaries
- `trace` summaries for recent boundary, launch, resume, stop, and recovery
  signals

`praxis inspect` turns those durable artifacts into operator views:

- `praxis inspect` and `praxis inspect run` for a detailed active-run snapshot
- `praxis inspect worker` and `praxis inspect session` for linked record detail
- `praxis inspect watch` for live progress without raw-log-first output
- `praxis inspect logs`, `trace`, and `events` for focused stream inspection

`praxis doctor` reports machine-readable health checks with stable `status`,
`reason_code`, `message`, and `details` fields.

Current checks cover:

- recovery state and run-state validation
- adapter harness loading and provider CLI availability
- worker-launch command resolvability
- active dispatch-bundle completeness and recovery markers
- active worker, session, launch, resume, and trace linkage consistency
- git worktree readiness for isolated workers and stale worktree cleanup
- failed or cancelled worker logs

Primary shared sources:

- `src/praxis/runtime/state/durable_state.py`
- `src/praxis/runtime/observability/trace_summary.py`
- `src/praxis/commands/_support.py`
- `src/praxis/commands/inspect.py`
- `src/praxis/commands/doctor.py`
