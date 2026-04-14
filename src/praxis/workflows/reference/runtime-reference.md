# Praxis Runtime Reference

This file is the shared reference for the current Praxis runtime.

Use it as the canonical prose source for:
- runtime architecture
- `.praxis/` durable-state semantics
- public CLI commands
- handoff and harness launch contracts
- eval, status, doctor, and trace entrypoints

Use `README.md` for the project overview and `docs/` for committed feature
docs. Use this file when you need the operational runtime contract.

Do not use this file for target-state planning or migration-gap notes. Keep
local WIP runtime notes under `.praxis/runtime/docs/` instead.

If `README.md`, `CLAUDE.md`, `commands/*.md`, or `skills/*/SKILL.md` need to
describe these behaviors, they should point here instead of restating the same
rules in full.

## Runtime Architecture

- `src/praxis/workflows/` defines shared `craft` and `forge` orchestration
  rules.
- `src/praxis/contracts/` defines machine-readable state, result, harness,
  handoff, and eval fixture contracts.
- `src/praxis/runtime/orchestrator.py` is the shared implementation entrypoint
  behind `praxis run`, `praxis submit-stage-result`, `praxis continue`,
  `praxis resume`, and `praxis status`.
- `src/praxis/runtime/workers/planning.py` selects worker plans and keeps the
  worker cursor consistent with `run.json`.
- `src/praxis/runtime/workers/dispatch.py` resolves `resume_or_launch` for the
  active primary worker.
- `src/praxis/runtime/context/` and
  `src/praxis/runtime/adapters/harness.py` compile bounded worker context and
  repo-scoped harness config.
- `src/praxis/runtime/adapters/provider_resume.py` runs provider-native resume
  safety checks and adapter-specific resume bridges.
- `src/praxis/runtime/story_boundary.py` handles queue initialization,
  story-boundary checkpointing, autopilot/manual activation, and multi-slice
  resume.
- `src/praxis/commands/_support.py` and `src/praxis/commands/doctor.py` build
  the public inspection and health-check surfaces.
- `src/praxis/runtime/observability/eval_pack.py` runs the local workflow eval
  suite.
- `src/praxis/runtime/observability/trace_summary.py` builds the trace block
  surfaced by `praxis status`.

Shared workflow semantics live in `src/praxis/`. Adapter wrappers stay thin and
defer to these runtime surfaces.

## `.praxis/` Durable State

Core runtime artifacts:
- `.praxis/run.json` - active workflow cursor
- `.praxis/story-ledger.json` - durable queue owner for multi-slice runs
- `.praxis/events.jsonl` - lifecycle event log
- `.praxis/results/<stage>.json` - routing result written by each stage
- `.praxis/slices/<slice-id>/...` - slice-local specs, sketches, summaries,
  results, and handoffs
- `.praxis/runtime/dispatches/<dispatch-id>/worker-launch.json` - bounded worker
  launch payload
- `.praxis/runtime/dispatches/<dispatch-id>/dispatch-record.json` - durable
  dispatch intent and resolution
- `.praxis/runtime/dispatches/<dispatch-id>/context-manifest.json` - explicit
  injected context items and reasons
- `.praxis/runtime/dispatches/<dispatch-id>/tool-manifest.json` - bounded tool
  surface for the dispatch
- `.praxis/runtime/launches/<adapter>/...` - native launch records
- `.praxis/runtime/workers/<worker-id>.json` - worker records
- `.praxis/runtime/sessions/<adapter>/<session-id>.json` - provider session
  records
- `.praxis/runtime/resumes/<adapter>/...` - provider resume attempt records
- `.praxis/runtime/approvals/...` - explicit user approval and denial evidence
- `.praxis/runtime/policies/...` - policy-gate outcomes with stable reason codes
- `.praxis/runtime/traces/<worker-id>.jsonl` - worker trace streams
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
  worker plan and durable session cursor
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
  --execution-mode manual \
  --json

praxis inspect --repo-root .
praxis inspect watch --repo-root .
praxis inspect logs --repo-root . --follow

praxis build-worker-launch --repo-root . --json

praxis dispatch \
  --repo-root . \
  --timestamp 2026-04-12T00:00:00Z \
  --json

praxis submit-stage-result \
  --repo-root . \
  --stage-result-path .praxis/results/sketching-design.json \
  --handoff-data-path .praxis/handoff-data.json \
  --json

praxis continue \
  --repo-root . \
  --timestamp 2026-04-12T00:00:00Z \
  --json

praxis doctor --repo-root . --json
praxis status --repo-root . --json
```

Lower-level helpers in `src/praxis/runtime/` remain internal implementation
surfaces behind that stable command tree.

## Status, Inspect, And Doctor Surfaces

`praxis status --repo-root . --json` reconstructs the active runtime boundary
from durable state and returns:

- the current run cursor and dispatch summary
- `dispatch_bundle` with bundle availability, linked paths, and recovery state
- `active_runtime` with linked worker, session, launch, resume, and trace
  artifact summaries
- `approvals` and `policies` summaries
- `trace` with recent boundary, launch, resume, stop, and recovery signals

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
- worker-launch command resolvability
- active dispatch-bundle completeness and recovery markers
- active worker, session, launch, resume, and trace linkage consistency
- git worktree readiness for isolated workers and stale-worktree cleanup
- failed or cancelled worker logs

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

## Dispatch, Resume, And Story-Boundary Semantics

Current dispatch semantics:

- dispatch intent is recorded before provider launch or resume begins
- the bounded launch payload, dispatch record, context manifest, and tool
  manifest persist under one dispatch-id directory
- successful fresh launches write worker, session, and native launch evidence
- successful provider-native resume writes a resume record, updates the durable
  session record, preserves the Praxis session cursor, and records
  `last_resume_outcome`
- sidecar `subagent_worker` artifacts are durable and explicit, but run-routing
  ownership remains with the primary worker for the active stage

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

`native-gate` is the CI-friendly subset. It only selects `native_harness`,
`native_trace`, and `adapter_parity` fixtures, and it fails closed when any of
those kinds are missing or regressing.
