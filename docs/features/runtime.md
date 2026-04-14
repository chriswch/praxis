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
- `.praxis/runtime/dispatches/sidecars/<dispatch-id>/...`
- `.praxis/runtime/launches/<adapter>/...`
- `.praxis/runtime/workers/<worker-id>.json`
- `.praxis/runtime/sidecars/<worker-id>/...`
- `.praxis/runtime/worktrees/<worker-id>/`
- `.praxis/runtime/sessions/<adapter>/<session-id>.json`
- `.praxis/runtime/resumes/<adapter>/...`
- `.praxis/runtime/approvals/...`
- `.praxis/runtime/policies/...`
- `.praxis/runtime/tools/<dispatch-id>/...`
- `.praxis/runtime/traces/<worker-id>.jsonl`
- `.praxis/runtime/logs/<worker-id>.*.log`

Single-story runs write stage artifacts at `.praxis/`. Multi-slice runs write
story-local artifacts under `.praxis/slices/<slice-id>/`.

## Worker Planning

Praxis plans workers through `src/praxis/runtime/workers/planning.py`.

Shipped worker classes:

- `interactive_orchestrator` for root `clarifying-intent` in manual runs
- `session_worker` for slice work and in-place implementation stages
- `worktree_worker` for isolated review or verification stages
- `subagent_worker` for explicit non-owning sidecar work

Current worker-planning rules:

- implementation stages can reuse the active story worker
- `code-reviewing` and `verifying-and-adapting` get fresh
  `worktree_worker` plans when independence matters
- projected isolated workers compile a concrete runtime policy before launch
- isolated projected worktrees receive read-only control-plane inputs plus
  writable links only for the declared artifact outputs
- sidecar workers are tracked with explicit non-owning ownership metadata so
  they cannot silently advance the run
- worker records keep the owning `launcher_pid`, `worktree_path`, permission
  profile, isolation metadata, and terminal worker status so cleanup and
  diagnostics can reason from durable state

## Launch Payloads, Policy, And Handoffs

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

`permissions` now carries concrete runtime policy, including:

- `filesystem_scope`
- `network_access`
- `destructive_commands_allowed`
- `enforcement_mode`
- `control_plane_access`
- `writable_roots`
- `blocked_paths`

Fresh worker context may read only:

- the current dispatch
- run metadata from `.praxis/run.json`
- the active boundary handoff when one exists
- declared artifact inputs for the active stage

`inputs.boundary_handoff` is the only supported cross-story carry-forward
input.

Before a native launch or resume, Praxis persists a dispatch bundle under
`.praxis/runtime/dispatches/<dispatch-id>/`. The bundle includes the
worker-launch payload, a dispatch record, a context manifest that explains
which inputs were injected and why, and a broker-backed bounded tool manifest.

## Dispatch, Launch, Resume, And Cancel

`praxis dispatch` is the owner-worker control-plane entrypoint for
`run.routing.pending_worker_action = resume_or_launch`.

Current shipped behavior:

- it dispatches `session_worker` and `worktree_worker` plans
- it records dispatch intent before adapter launch or resume begins
- it may attempt provider-native resume through the adapter contract
- `run.current.session_id` stays the durable Praxis cursor, while
  `session.provider_locator` stores the provider-issued locator when one exists
- successful resume writes a resume record, updates the durable session record,
  keeps `run.current.session_id` stable, and appends resume lifecycle events to
  the trace
- unsafe or rejected resume records `resume_fallback_used` before Praxis writes
  fresh launch, worker, and session bookkeeping
- fresh launch persists native launch evidence, starts a background worker
  launcher, and records worker-process telemetry
- isolated `worktree_worker` launches recreate stale worktrees from `HEAD`,
  block reuse while a live launcher still owns the path, and clean the
  worktree on success, failure, explicit cancellation, and terminal cleanup

`praxis dispatch-sidecar` is the explicit non-owner path for `subagent_worker`.

Current sidecar behavior:

- it compiles a bounded sidecar dispatch bundle under the sidecar dispatch
  namespace
- it records sidecar worker, session, launch, and trace artifacts durably
- it keeps `run_routing_owned = false` and `stage_result_expected = false`
- it writes sidecar-local outputs under `.praxis/runtime/sidecars/<worker-id>/`
- it never updates `run.json` or satisfies the owner stage-result contract

`praxis cancel` is adapter-first:

- it asks the active adapter for a native cancel attempt first
- it records that native attempt durably even when the adapter returns
  `native_cancel_unsupported`
- it falls back to local launcher process-group termination when needed
- it marks the worker cancelled and cleans isolated worktrees best-effort

## Tool Broker

Praxis now owns a real runtime tool broker in `src/praxis/runtime/tool_broker.py`.

Current broker behavior:

- workers load a broker-oriented tool manifest from the dispatch bundle
- brokered tool records persist under `.praxis/runtime/tools/<dispatch-id>/...`
- the first helper set includes repo read, repo search, repo shell, repo patch,
  and network fetch
- brokered shell and patch helpers enforce declared write paths
- brokered requests enforce network, destructive-command, undeclared-write, and
  control-plane-write policy before executing native helpers
- denied and failed brokered requests produce durable tool-use records and, when
  appropriate, policy records

## Story Boundary

Praxis provides a durable story-boundary flow for multi-slice runs.

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
- `sidecars` for separate non-owning sidecar worker summaries
- `tool_usage` for active-dispatch and recent brokered tool history
- approval and policy summaries
- `trace` summaries for recent boundary, launch, resume, stop, recovery, and
  brokered tool-use signals

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
- git worktree readiness for isolated workers and stale-worktree cleanup
- failed or cancelled worker logs
- sidecar visibility and sidecar worker health
- risky brokered tool-use summaries
