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
- `run.routing.boundary_handoff_path` points at the handoff artifact that seeds the next story.

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

## Story-Boundary Helper

Use `workflow/scripts/story_boundary.py` as the shared runtime API for multi-story execution. Do not re-implement story-boundary transitions in wrappers.

Use `workflow/scripts/run_state.py` as the shared runtime API for non-boundary stage-to-stage `run.json` updates. Do not re-implement ordinary stage routing in wrappers.

Available commands:

```bash
python3 -m workflow.scripts.story_boundary initialize-story-queue \
  --repo-root . \
  --slice-map-path .praxis/slice-map.json

python3 -m workflow.scripts.run_state update-run-from-stage-result \
  --repo-root . \
  --stage-result-path .praxis/results/sketching-design.json

python3 -m workflow.scripts.story_boundary checkpoint-story-boundary \
  --repo-root . \
  --stage-result-path .praxis/slices/S-001/results/verifying-and-adapting.json \
  --commit-meta-path /tmp/commit-meta.json \
  --handoff-data-path /tmp/handoff-data.json

python3 -m workflow.scripts.story_boundary pause-autopilot-for-stage-result \
  --repo-root . \
  --stage-result-path .praxis/slices/S-001/results/clarifying-intent.json

python3 -m workflow.scripts.story_boundary activate-next-story-from-boundary \
  --repo-root .

python3 -m workflow.scripts.story_boundary resume-story-run-from-disk \
  --repo-root .
```

Boundary helper JSON inputs:

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

The helper prints a machine-readable state summary after each command so wrappers can inspect the updated cursor and queue state.

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
- Both runtimes use the same run contract, story-ledger contract, shared run-state helper, shared routing table, and story-boundary helper.

## License

MIT
