# Praxis Runtime Reference

This file is the shared reference for the shipped Praxis runtime.

Use it as the canonical prose source for:
- runtime architecture
- `.praxis/` durable-state semantics
- public CLI commands
- handoff and harness launch contracts
- eval, status, doctor, sidecar, and trace entrypoints

Use `README.md` for the project overview and `docs/` for committed feature
summaries. Use this file when you need the operational runtime contract.

Do not use this file for target-state planning or migration-gap notes. Keep
local WIP runtime notes under `.praxis/runtime/docs/` only while a runtime gap
is still open.

If `README.md`, `CLAUDE.md`, `commands/*.md`, or `skills/*/SKILL.md` need to
describe these behaviors, they should point here instead of restating the same
rules in full.

## Runtime Architecture

- `src/praxis/workflows/` defines shared `craft` and `forge` orchestration
  rules.
- `src/praxis/contracts/` defines machine-readable state, result, harness,
  policy, sidecar, tool-record, handoff, and eval contracts.
- `src/praxis/runtime/orchestrator.py` is the shared implementation entrypoint
  behind `praxis run`, `praxis submit-stage-result`, `praxis continue`,
  `praxis resume`, and `praxis status`.
- `src/praxis/runtime/workers/planning.py` selects worker plans, stage
  permission profiles, and durable worker cursors.
- `src/praxis/runtime/context/` compiles bounded worker context, dispatch
  bundles, and broker-backed tool manifests.
- `src/praxis/runtime/policy.py` and `src/praxis/runtime/policy_records.py`
  translate permission profiles into concrete runtime policy and durable
  policy evidence.
- `src/praxis/runtime/adapters/runtime_contract.py` defines the adapter-owned
  launch, resume, status, and cancel contract.
- `src/praxis/runtime/workers/dispatch.py` resolves `resume_or_launch` for the
  active owner worker, while `src/praxis/runtime/workers/sidecar.py` handles
  explicit non-owning sidecar dispatch.
- `src/praxis/runtime/story_boundary.py` handles queue initialization,
  story-boundary checkpointing, autopilot/manual activation, and multi-slice
  resume.
- `src/praxis/runtime/tool_broker.py` mediates the bounded runtime tool
  surface and persists durable tool-use records.
- `src/praxis/commands/_support.py` and `src/praxis/commands/doctor.py` build
  the public inspection and health-check surfaces.
- `src/praxis/runtime/observability/trace_summary.py` and
  `src/praxis/runtime/observability/eval_pack.py` provide trace reconstruction
  and local eval execution.

Shared workflow semantics live in `src/praxis/`. Adapter wrappers stay thin and
defer to these runtime surfaces.

## `.praxis/` Durable State

Core runtime artifacts:
- `.praxis/run.json` - active workflow cursor
- `.praxis/story-ledger.json` - durable queue owner for multi-slice runs
- `.praxis/events.jsonl` - lifecycle event log
- `.praxis/results/<stage>.json` - routing result written by each stage
- `.praxis/slices/<slice-id>/...` - slice-local specs, sketches, summaries,
  results, handoffs, and handoff inputs
- `.praxis/runtime/dispatches/<dispatch-id>/worker-launch.json` - bounded owner
  worker launch payload
- `.praxis/runtime/dispatches/<dispatch-id>/dispatch-record.json` - durable
  dispatch intent and resolution
- `.praxis/runtime/dispatches/<dispatch-id>/context-manifest.json` - injected
  context items, reasons, and concrete runtime policy
- `.praxis/runtime/dispatches/<dispatch-id>/tool-manifest.json` - bounded,
  broker-backed tool surface for the dispatch
- `.praxis/runtime/dispatches/sidecars/<dispatch-id>/...` - sidecar dispatch
  bundles and request metadata
- `.praxis/runtime/launches/<adapter>/...` - native launch records
- `.praxis/runtime/workers/<worker-id>.json` - worker records
- `.praxis/runtime/sidecars/<worker-id>/...` - sidecar-local artifact outputs
  and notes
- `.praxis/runtime/sessions/<adapter>/<session-id>.json` - provider session
  records
- `.praxis/runtime/resumes/<adapter>/...` - provider resume attempt records
- `.praxis/runtime/approvals/...` - explicit user approval and denial evidence
- `.praxis/runtime/policies/...` - policy-gate outcomes with stable reason
  codes, including story-boundary and runtime denials
- `.praxis/runtime/tools/<dispatch-id>/...` - durable tool-use records for the
  active broker surface
- `.praxis/runtime/traces/<worker-id>.jsonl` - worker trace streams, including
  brokered tool-use events
- `.praxis/runtime/logs/<worker-id>.*.log` - worker launcher logs

Execution semantics:
- `workflow` is `craft` or `forge`
- `mode` is `single_story` or `multi_slice`
- `run.execution.mode` is `manual` or `autopilot`
- `run.routing.stop_reason_code` records why progression paused, blocked,
  cancelled, or failed a gate
- `run.routing.boundary_handoff_path` points at the unconsumed handoff artifact
  for the next story
- `run.current.worker_id` and `run.current.session_id` identify the active
  owner worker and durable session cursor
- `run.routing.pending_worker_action` and `run.routing.resume_strategy` make
  launch-vs-resume intent explicit

Single-story runs write stage artifacts at `.praxis/`. Multi-slice runs write
story-local artifacts under `.praxis/slices/{slice-id}/`.

## Public CLI

Use the installed `praxis` CLI instead of re-implementing transitions in
wrappers.

```bash
praxis run \
  --repo-root . \
  --workflow forge \
  --entry-task "Clarify and deliver a workflow change" \
  --adapter codex \
  --execution-mode autopilot \
  --json

praxis build-worker-launch --repo-root . --json

praxis dispatch \
  --repo-root . \
  --timestamp 2026-04-12T00:00:00Z \
  --json

praxis dispatch-sidecar \
  --repo-root . \
  --worker-id wrk_helper_01 \
  --reason "Inspect the adapter parity fixtures" \
  --json

praxis submit-stage-result \
  --repo-root . \
  --stage-result-path .praxis/results/sketching-design.json \
  --handoff-data-path .praxis/handoff-data.json \
  --json

praxis continue --repo-root . --timestamp 2026-04-12T00:00:00Z --json
praxis resume --repo-root . --timestamp 2026-04-12T00:00:00Z --json
praxis cancel --repo-root . --json

praxis inspect --repo-root .
praxis inspect watch --repo-root .
praxis inspect logs --repo-root . --follow

praxis doctor --repo-root . --json
praxis status --repo-root . --json
```

Lower-level helpers under `src/praxis/runtime/` remain internal implementation
surfaces behind that stable command tree. The tool broker is currently exposed
as an internal runtime module, not as a top-level `praxis` subcommand.

## Status, Inspect, And Doctor Surfaces

`praxis status --repo-root . --json` reconstructs the active runtime boundary
from durable state and returns:

- the current run cursor and dispatch summary
- `dispatch_bundle` with bundle availability, linked paths, and recovery state
- `active_runtime` with linked worker, session, launch, resume, and trace
  artifact summaries
- `sidecars` with separate non-owning sidecar worker summaries
- `tool_usage` with active-dispatch and overall recent brokered tool history
- `approvals` and `policies` summaries
- `trace` with recent boundary, launch, resume, stop, recovery, and tool-use
  signals

`praxis inspect` is the human-first read surface over the same runtime
artifacts:

- `praxis inspect` or `praxis inspect run` for the active run
- `praxis inspect worker` for worker, launch, resume, trace, and log linkage
- `praxis inspect session` for durable resumability and provider-locator state
- `praxis inspect watch` for live progress snapshots
- `praxis inspect logs`, `trace`, and `events` for focused stream inspection

Current `inspect` limits:

- `praxis inspect run` only resolves the active run in v1
- `--json` is supported for non-streaming reads only
- provider transcripts are not part of the Praxis runtime contract

`praxis doctor --repo-root . --json` reports machine-readable checks with
stable `status`, `reason_code`, `message`, and `details` fields.

Current checks cover:

- recovery state and run-state validation
- adapter harness loading and provider CLI availability
- worker-launch command resolvability through the adapter contract
- active dispatch-bundle completeness and recovery markers
- active worker, session, launch, resume, and trace linkage consistency
- git worktree readiness for isolated workers and stale-worktree cleanup
- failed or cancelled worker logs
- sidecar visibility and sidecar worker health
- recent brokered tool-use risk summaries

## Handoff And Harness Launch Contract

Before launching any fresh worker context:

1. build the worker-launch payload with
   `praxis build-worker-launch --repo-root . --json`
2. pass `inputs.boundary_handoff` into the fresh worker context when present
3. treat that handoff as the only cross-story carry-forward input
4. load repo-scoped settings, hook config or hook entrypoints, agent patterns,
   and extension points from the active adapter harness config

When `run.routing.pending_worker_action = resume_or_launch`, use
`praxis dispatch --repo-root . --json` to let the control plane execute that
intent. The dispatcher rebuilds context from durable Praxis state first,
persists the bounded dispatch bundle, records an explicit
`resume_fallback_used` event when provider resume is unavailable, and starts
the background worker launcher declared by the active adapter harness.

When bounded helper work should run without stealing ownership, use
`praxis dispatch-sidecar --repo-root . --json`. Sidecars compile their own
bounded dispatch bundle, worker, session, launch, and trace artifacts, but they
do not update run routing and they do not satisfy the owner stage-result
contract.

The durable Praxis session cursor and the provider-issued locator are separate
values. `run.current.session_id` remains the Praxis control-plane cursor.
`session.provider_locator` becomes non-null only after Praxis captures a real
provider locator. Provider-native resume fails closed when the stored session is
non-resumable, missing that locator, or no longer matches the bounded dispatch.

Repo-scoped harness surfaces:
- `.claude/adapter.json`
- `CLAUDE.md`
- `.claude/extensions.md`
- `.claude/settings.json`
- `.claude/hooks/`
- `.claude/agents/`
- `.codex/adapter.json`
- `AGENTS.md`
- `.codex/extensions.md`
- `.codex/config.toml`
- `.codex/hooks.json`
- `.codex/agents/`

For Claude, `CLAUDE.md` and `.claude/` are the authoritative native repo
surfaces. `.claude-plugin/` remains an optional compatibility mirror.

For Codex, `AGENTS.md` and `.codex/` are the authoritative native repo
surfaces. `.codex-plugin/` remains an optional compatibility mirror.

Compatibility metadata may remain in adapter config for reporting, but Praxis
does not require the compatibility-mirror files to exist at runtime.

## Dispatch, Resume, Tool, And Story-Boundary Semantics

Current dispatch semantics:

- dispatch intent is recorded before provider launch or resume begins
- the bounded launch payload, dispatch record, context manifest, and tool
  manifest persist under one dispatch-id directory
- the tool manifest is broker-oriented and points workers at the Praxis-owned
  runtime broker surface
- successful fresh launches write worker, session, native launch, and trace
  evidence
- successful provider-native resume writes a resume record, updates the durable
  session record, preserves the Praxis session cursor, and records
  `last_resume_outcome`
- sidecars launch through the same adapter-backed runtime path but remain
  explicitly non-owning: `run_routing_owned = false` and
  `stage_result_expected = false`
- `praxis submit-stage-result` rejects non-owner sidecar results instead of
  letting them rewrite the run cursor

Current runtime-policy semantics:

- permission profiles compile into explicit runtime policy with concrete
  filesystem, network, destructive-command, enforcement, control-plane, and
  writable-root fields
- projected workers and sidecars use `control_plane_access =
  projected_read_only`
- isolated projected worktrees receive read-only runtime inputs plus writable
  links only for declared artifact outputs
- runtime denials such as `control_plane_write_denied`, `network_denied`, and
  `destructive_command_denied` produce durable policy and tool-use evidence
- policy history is ordered by recorded timestamp so operator views see the
  latest denial or approval first

Current cancel semantics:

- `praxis cancel` asks the active adapter for a native cancel attempt first
- adapters currently return a durable unsupported result for bounded worker
  sessions
- Praxis then falls back to local launcher process-group termination when
  needed and records that fallback separately

Current story-boundary semantics:

- completed stories checkpoint through `praxis submit-stage-result`
- the boundary helper writes `handoff.json` and `handoff.md`
- `story-ledger.json` records the active story, last completed story, boundary
  status, and per-story commit metadata
- autopilot activates the next story only after the boundary gate succeeds
- manual mode pauses for confirmation before activating the next story
- the final story still writes a completed handoff artifact, but the run ends
  with `run.status = completed`, `run.routing.next_action = finish`, and no
  next story

## Eval And Trace Entry Points

Run the local eval pack with:

```bash
python3 -m praxis.runtime.observability.eval_pack run --fixtures-dir tests/evals/fixtures
```

Run the fail-closed native harness gate with:

```bash
python3 -m praxis.runtime.observability.eval_pack native-gate --fixtures-dir tests/evals/fixtures
```

The bundled eval fixtures currently grade:
- routing outcomes
- resume behavior and explicit resume fallbacks
- fail-closed boundary stops and handoff budget enforcement
- worker dispatch bookkeeping and provider-native resume outcomes
- native Claude and Codex session-start hooks, including invalid-handoff
  launch-failure telemetry
- `praxis status` trace reconstruction and `active_runtime` summaries
- Claude/Codex semantic parity over both fresh-launch and manual-resume runtime
  artifacts

The contract suite under `tests/contracts/` adds focused coverage for:
- projected isolated-worktree policy behavior and operator policy reporting
- adapter-runtime launch, resume, status, and cancel surfaces
- real sidecar execution plus non-owner stage-result guards
- brokered tool-use recording, denials, and status/doctor summaries

`native-gate` is the CI-friendly subset. It only selects `native_harness`,
`native_trace`, and `adapter_parity` fixtures, and it fails closed when any of
those kinds are missing or regressing.
