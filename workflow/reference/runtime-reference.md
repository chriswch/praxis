# Praxis Runtime Reference

This file is the shared reference for the current Praxis runtime.

Use it as the canonical prose source for:
- runtime architecture
- `.praxis/` durable-state semantics
- public CLI commands
- handoff and harness launch contracts
- eval and trace entrypoints

Use `README.md` for the project overview and `docs/` for committed feature docs.
Use this file when you need the operational runtime contract.

Do not use this file for target-state planning or migration-gap notes. Keep
local WIP runtime notes under `.praxis/runtime/docs/` instead.

If `README.md`, `CLAUDE.md`, `commands/*.md`, or `skills/*/SKILL.md` need to
describe these behaviors, they should point here instead of restating the same
rules in full.

## Runtime Architecture

- `workflow/pipelines/` defines shared `craft` and `forge` orchestration rules.
- `workflow/contracts/` defines machine-readable state, result, harness, handoff, and eval fixture contracts.
- `workflow/scripts/praxis_cli.py` exposes the stable `praxis` command tree and JSON envelope.
- `workflow/scripts/orchestrator.py` is the shared implementation entrypoint behind `praxis run`, `praxis submit-stage-result`, `praxis continue`, `praxis resume`, `praxis dispatch`, and `praxis status`.
- `workflow/scripts/harness_config.py` loads repo-scoped adapter harness config and builds the fresh-worker launch payload.
- `workflow/scripts/run_state.py` handles ordinary stage-to-stage `run.json` updates.
- `workflow/scripts/story_boundary.py` handles queue initialization, story-boundary checkpointing, activation, autopilot pauses, and multi-slice resume.
- `workflow/scripts/eval_pack.py` runs the local workflow eval suite.
- `workflow/scripts/trace_summary.py` builds the richer trace block surfaced by `praxis status`.

Shared workflow semantics live in `workflow/`. Adapter wrappers stay thin and
defer to these runtime surfaces.

## `.praxis/` Durable State

Core runtime artifacts:
- `.praxis/run.json` - active workflow cursor
- `.praxis/story-ledger.json` - durable queue owner for multi-slice runs
- `.praxis/events.jsonl` - lifecycle event log
- `.praxis/results/<stage>.json` - routing result written by each stage
- `.praxis/runtime/launches/<adapter>/...` - native launch records
- `.praxis/runtime/workers/<worker-id>.json` - worker records
- `.praxis/runtime/sessions/<adapter>/<session-id>.json` - provider session records
- `.praxis/runtime/traces/<worker-id>.jsonl` - worker trace streams

Execution semantics:
- `workflow` is `craft` or `forge`
- `mode` is `single_story` or `multi_slice`
- `run.execution.mode` is `manual` or `autopilot`
- `run.routing.stop_reason_code` records why progression paused, blocked, or cancelled
- `run.routing.boundary_handoff_path` points at the unconsumed handoff artifact for the next story
- `run.current.worker_id` and `run.current.session_id` identify the active worker plan
- `run.routing.pending_worker_action` and `run.routing.resume_strategy` make launch vs resume intent explicit

Single-story runs write stage artifacts at `.praxis/`. Multi-slice runs write story-local artifacts under `.praxis/slices/{slice-id}/`.

## Public CLI

Use the installed `praxis` CLI instead of re-implementing transitions in wrappers.

```bash
praxis run \
  --repo-root . \
  --workflow forge \
  --entry-task "Clarify and deliver a workflow change" \
  --adapter codex \
  --execution-mode manual \
  --json

praxis submit-stage-result \
  --repo-root . \
  --stage-result-path .praxis/results/sketching-design.json \
  --json

praxis continue \
  --repo-root . \
  --timestamp 2026-04-12T00:00:00Z \
  --json

praxis dispatch \
  --repo-root . \
  --timestamp 2026-04-12T00:00:00Z \
  --json

praxis resume \
  --repo-root . \
  --timestamp 2026-04-12T00:00:00Z \
  --json

praxis status --repo-root . --json
```

Lower-level helpers in `workflow/scripts/` remain internal implementation
surfaces behind that stable command tree.

## Handoff and Harness Launch Contract

Before launching any fresh worker context:

1. build the worker-launch payload with `praxis build-worker-launch --repo-root . --json`
2. pass `inputs.boundary_handoff` into the fresh worker context when present
3. treat that handoff as the only cross-story carry-forward input
4. load repo-scoped settings, hook config or hook entrypoints, agent patterns,
   and extension points from the active adapter harness config

When `run.routing.pending_worker_action = resume_or_launch`, use
`praxis dispatch --repo-root . --json` to let
the control plane execute that intent. The dispatcher rebuilds context from
durable Praxis state first, records an explicit `resume_fallback_used` event
when provider resume is unavailable, and then records the fresh native launch.

Repo-scoped harness surfaces:
- `.claude/adapter.json`
- `CLAUDE.md`
- `.claude/settings.json`
- `.claude/hooks/`
- `.claude/agents/`
- `.claude-plugin/settings.md`
- `.claude-plugin/hooks/`
- `.claude-plugin/subagents/`
- `.claude-plugin/extensions.md`
- `.codex/adapter.json`
- `AGENTS.md`
- `.codex/config.toml`
- `.codex/hooks.json`
- `.codex/agents/`
- `.codex-plugin/settings.md`
- `.codex-plugin/hooks/`
- `.codex-plugin/subagents/`
- `.codex-plugin/extensions.md`

For Claude, `CLAUDE.md` and `.claude/` are the authoritative native repo
surfaces. The current runtime also includes `.claude-plugin/` compatibility
surfaces.

For Codex, `AGENTS.md` and `.codex/` are the authoritative native repo
surfaces. The current runtime also includes `.codex-plugin/` compatibility
surfaces.

Shared skills should stay neutral about MCP servers, resources, and tool
wrappers.

## Eval and Trace Entry Points

Run the local eval pack with:

```bash
python3 -m workflow.scripts.eval_pack run --fixtures-dir tests/evals/fixtures
```

Run the fail-closed native harness gate with:

```bash
python3 -m workflow.scripts.eval_pack native-gate --fixtures-dir tests/evals/fixtures
```

The bundled eval fixtures currently grade:
- routing outcomes
- resume behavior
- fail-closed boundary stops
- handoff budget enforcement
- native Claude and Codex session-start hooks through the shared harness entrypoints
- `status` trace reconstruction for pause and resume paths
- Claude/Codex semantic parity over native launch and handoff outcomes

`native-gate` is the CI-friendly subset. It only selects `native_harness`,
`native_trace`, and `adapter_parity` fixtures, and it fails closed when any of
those kinds are missing or regressing.

`praxis status --repo-root . --json` also returns a `trace` block that summarizes:
- current dispatch
- recent boundary signals
- recent stop signals
- recovery state
