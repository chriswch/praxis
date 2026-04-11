# Praxis

Spec-driven software engineering workflows for Claude Code and Codex.

Praxis turns vague requests into clarified specs, implementation work, review, and verification. The shared workflow lives in `workflow/`; Claude and Codex entrypoints are thin adapters over the same contract.

## Workflows

### Craft

```text
clarifying-intent -> [slicing-stories] -> sketching-design -> driving-tdd
  -> code-reviewing -> code-improving -> verifying-and-adapting
```

`craft` is the full spec-driven and test-driven workflow. It is checkpoint-heavy in `manual` mode and can advance across stories in `autopilot` mode when no stop condition exists.

### Forge

```text
clarifying-intent -> [slicing-stories] -> sketching-design -> rapid-implementing
  -> code-reviewing -> code-improving -> done
```

`forge` keeps the same clarified-spec entrypoint, then auto-advances unless a stage or story boundary needs an operator stop.

## Skills

| Skill | What it does |
| --- | --- |
| `clarifying-intent` | Turns a vague idea into a feature brief or story-level behavioral spec |
| `slicing-stories` | Splits a large feature into thin, ordered vertical slices |
| `sketching-design` | Finds the files and patterns that fit the next story |
| `driving-tdd` | Implements a story through Red -> Green -> Refactor |
| `rapid-implementing` | Implements a story quickly without writing new tests |
| `code-reviewing` | Reviews changed code for structural, practical, and breaking-change risks |
| `code-improving` | Fixes critical, high, and medium review findings |
| `verifying-and-adapting` | Verifies the delivered behavior and routes to `done`, `next_slice`, `rework`, or `escalate` |

## Fast Paths

- Trivial change: clarify the change, implement it, finish.
- Bug fix: `clarifying-intent` -> `driving-tdd`.
- Refactor: rely on existing tests, refactor, re-run, finish.
- Small story: `clarifying-intent` -> `sketching-design` (optional) -> implementation workflow.
- Fast delivery: use `forge`.

## Workflow Architecture

Praxis v3 separates workflow semantics from runtime adapters:

- `workflow/pipelines/` defines shared `craft` and `forge` orchestration rules.
- `workflow/contracts/` defines machine-readable state and result contracts.
- `workflow/scripts/orchestrator.py` is the shared runtime entrypoint for run initialization, stage-result advancement, manual confirmations, and durable resume.
- `workflow/scripts/harness_config.py` loads repo-scoped adapter harness config and builds the fresh-worker launch payload for Claude/Codex wrappers.
- `workflow/scripts/eval_pack.py` runs the local eval pack for routing, resume, handoff, stop-reason, and adapter-parity checks.
- `workflow/scripts/run_state.py` is the shared runtime helper for normal stage-to-stage `run.json` updates.
- `workflow/scripts/story_boundary.py` is the shared runtime helper for queue initialization, story-boundary checkpointing, activation, autopilot pauses, and resume.
- `commands/` and `skills/craft` / `skills/forge` are thin Claude/Codex adapters over those shared files.

If an adapter wrapper and a shared workflow file disagree, the shared workflow file wins.

## `.praxis/` Contract

Praxis uses `.praxis/` as durable workflow state.

Core runtime artifacts:

- `.praxis/run.json` is the active workflow cursor.
- `.praxis/story-ledger.json` is the durable queue owner for multi-slice runs.
- `.praxis/events.jsonl` is the lifecycle event log.
- `.praxis/results/<stage>.json` is the routing result written by each stage.

Execution semantics:

- `run.execution.mode` is `manual` or `autopilot`.
- `workflow` still means `craft` or `forge`.
- `mode` still means `single_story` or `multi_slice`.
- `run.routing.stop_reason_code` records why `autopilot` paused, blocked, or cancelled.
- `run.routing.boundary_handoff_path` points at the unconsumed handoff artifact that seeds the next story's `clarifying-intent`.

Feature-level artifacts always live at `.praxis/` root:

- `.praxis/brief.md`
- `.praxis/slice-map.json`
- `.praxis/slice-map.md`
- `.praxis/run.json`
- `.praxis/story-ledger.json`
- `.praxis/events.jsonl`
- `.praxis/results/slicing-stories.json`

Single-story runs write stage artifacts at `.praxis/`. Multi-slice runs write story-local artifacts under `.praxis/slices/{slice-id}/`, for example:

- `.praxis/slices/{slice-id}/spec.md`
- `.praxis/slices/{slice-id}/sketch.md`
- `.praxis/slices/{slice-id}/tdd.md` or `implementation.md`
- `.praxis/slices/{slice-id}/review.md`
- `.praxis/slices/{slice-id}/improvement.md`
- `.praxis/slices/{slice-id}/verification.md`
- `.praxis/slices/{slice-id}/handoff.json`
- `.praxis/slices/{slice-id}/handoff.md`
- `.praxis/slices/{slice-id}/results/<stage>.json`

The markdown artifact is for people. The result JSON is for orchestration.

## Orchestrator

Use `workflow/scripts/orchestrator.py` as the shared runtime API for end-to-end workflow execution. Do not re-implement orchestration in wrappers.

Use `workflow/scripts/run_state.py` and `workflow/scripts/story_boundary.py` as lower-level building blocks behind the shared orchestrator.

Available commands:

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

Boundary helper JSON inputs for `advance-run` story completion:

```json
{
  "start_commit": "abc1111",
  "end_commit": "def2222",
  "commits": ["abc1111", "def2222"]
}
```

```json
{
  "summary": "What the story delivered.",
  "carry_forward_context": [
    "Only the context the next story actually needs."
  ],
  "changed_paths": [
    "workflow/scripts/story_boundary.py"
  ]
}
```

The orchestrator prints a machine-readable state summary plus a dispatch block after each command so wrappers can inspect the updated cursor and the next stage to run. `show-run` also includes a `trace` block summarizing dispatch, recent boundary/stop signals, and recovery state from durable artifacts.

Read-side handoff contract:

- Build the fresh-worker launch payload with `python3 -m workflow.scripts.harness_config build-worker-launch --repo-root .`.
- If `inputs.boundary_handoff` is present in that payload, pass it into the fresh worker context as explicit input.
- Treat that handoff as the only cross-story carry-forward context; do not rely on old transcript continuity.
- `workflow/scripts/run_state.py` clears `run.routing.boundary_handoff_path` once `clarifying-intent` advances beyond itself. If clarification loops back to itself, the handoff path remains available for the retry.

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

Those files define repo-local settings, hook entrypoints, subagent patterns, and neutral extension points for MCP/resources/tools without putting team-specific assumptions into shared Praxis skills.

## Eval Pack

Run the local eval pack with:

```bash
python3 -m workflow.scripts.eval_pack run --fixtures-dir tests/evals/fixtures
```

The bundled fixtures grade:

- routing outcomes
- resume behavior
- fail-closed boundary stops
- handoff budget enforcement
- Claude/Codex semantic parity

## Plugin Structure

```text
praxis/
├── workflow/
│   ├── contracts/
│   │   ├── run.schema.json
│   │   ├── stage-result.schema.json
│   │   └── story-ledger.schema.json
│   ├── pipelines/
│   │   ├── craft.md
│   │   └── forge.md
│   └── scripts/
│       ├── orchestrator.py
│       ├── run_state.py
│       ├── routing.py
│       └── story_boundary.py
├── commands/
│   ├── craft.md
│   └── forge.md
├── skills/
│   ├── craft/
│   ├── forge/
│   ├── clarifying-intent/
│   ├── slicing-stories/
│   ├── sketching-design/
│   ├── driving-tdd/
│   ├── rapid-implementing/
│   ├── code-reviewing/
│   ├── code-improving/
│   └── verifying-and-adapting/
├── .codex-plugin/
├── .claude-plugin/
├── CLAUDE.md
└── README.md
```

## Runtime Support

- Claude uses `commands/` as thin wrappers over `workflow/pipelines/`.
- Codex uses `skills/craft/SKILL.md` and `skills/forge/SKILL.md` as thin wrappers over the same shared workflow files.
- Both runtimes use the same run contract, story-ledger contract, shared orchestrator, shared run-state helper, shared routing table, and story-boundary helper.

## License

MIT
