# Praxis Runtime Reference

This file is the shared runtime reference for Praxis.

Use it as the canonical prose source for:
- runtime architecture
- `.praxis/` durable-state semantics
- orchestrator commands
- handoff and harness launch contracts
- eval and trace entrypoints

If `README.md`, `CLAUDE.md`, `commands/*.md`, or `skills/*/SKILL.md` need to describe these behaviors, they should point here instead of restating the same rules in full.

## Runtime Architecture

- `workflow/pipelines/` defines shared `craft` and `forge` orchestration rules.
- `workflow/contracts/` defines machine-readable state, result, harness, handoff, and eval fixture contracts.
- `workflow/scripts/orchestrator.py` is the shared runtime entrypoint for run initialization, stage-result advancement, manual confirmations, resume, and `show-run` snapshots.
- `workflow/scripts/harness_config.py` loads repo-scoped adapter harness config and builds the fresh-worker launch payload.
- `workflow/scripts/run_state.py` handles ordinary stage-to-stage `run.json` updates.
- `workflow/scripts/story_boundary.py` handles queue initialization, story-boundary checkpointing, activation, autopilot pauses, and multi-slice resume.
- `workflow/scripts/eval_pack.py` runs the local workflow eval suite.
- `workflow/scripts/trace_summary.py` builds the richer trace block surfaced by `show-run`.

Shared workflow semantics live in `workflow/`. Adapter wrappers should stay thin.

## `.praxis/` Durable State

Core runtime artifacts:
- `.praxis/run.json` - active workflow cursor
- `.praxis/story-ledger.json` - durable queue owner for multi-slice runs
- `.praxis/events.jsonl` - lifecycle event log
- `.praxis/results/<stage>.json` - routing result written by each stage

Execution semantics:
- `workflow` is `craft` or `forge`
- `mode` is `single_story` or `multi_slice`
- `run.execution.mode` is `manual` or `autopilot`
- `run.routing.stop_reason_code` records why progression paused, blocked, or cancelled
- `run.routing.boundary_handoff_path` points at the unconsumed handoff artifact for the next story

Single-story runs write stage artifacts at `.praxis/`. Multi-slice runs write story-local artifacts under `.praxis/slices/{slice-id}/`.

## Orchestrator Commands

Use the shared orchestrator instead of re-implementing transitions in wrappers.

```bash
python3 -m workflow.scripts.orchestrator initialize-run \
  --repo-root . \
  --workflow forge \
  --entry-task "Add a real orchestrator entrypoint" \
  --adapter codex \
  --execution-mode autopilot

python3 -m workflow.scripts.orchestrator advance-run \
  --repo-root . \
  --stage-result-path .praxis/results/sketching-design.json

python3 -m workflow.scripts.orchestrator continue-run \
  --repo-root . \
  --timestamp 2026-04-12T00:00:00Z

python3 -m workflow.scripts.orchestrator resume-run \
  --repo-root . \
  --timestamp 2026-04-12T00:00:00Z

python3 -m workflow.scripts.orchestrator show-run \
  --repo-root .
```

## Handoff and Harness Launch Contract

Before launching any fresh worker context:

1. build the worker-launch payload with `python3 -m workflow.scripts.harness_config build-worker-launch --repo-root .`
2. pass `inputs.boundary_handoff` into the fresh worker context when present
3. treat that handoff as the only cross-story carry-forward input
4. load repo-scoped settings, hooks, subagent patterns, and extension points from the active adapter harness config

Repo-scoped harness surfaces:
- `.claude-plugin/adapter.json`
- `.claude-plugin/settings.md`
- `.claude-plugin/hooks/`
- `.claude-plugin/subagents/`
- `.claude-plugin/extensions.md`
- `.codex-plugin/adapter.json`
- `.codex-plugin/settings.md`
- `.codex-plugin/hooks/`
- `.codex-plugin/subagents/`
- `.codex-plugin/extensions.md`

These files hold repo-local behavior. Shared skills should stay neutral about MCP servers, resources, and tool wrappers.

## Eval and Trace Entry Points

Run the local eval pack with:

```bash
python3 -m workflow.scripts.eval_pack run --fixtures-dir tests/evals/fixtures
```

The bundled eval fixtures currently grade:
- routing outcomes
- resume behavior
- fail-closed boundary stops
- handoff budget enforcement
- Claude/Codex semantic parity

`python3 -m workflow.scripts.orchestrator show-run --repo-root .` also returns a `trace` block that summarizes:
- current dispatch
- recent boundary signals
- recent stop signals
- recovery state
