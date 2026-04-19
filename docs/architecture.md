# Architecture

Praxis separates two layers that stay decoupled.

- **Plugin** — skills and entry points that an agent runs interactively. Delivers the workflow without depending on the CLI.
- **CLI** — the TypeScript orchestrator at `src/praxis-ts/` that drives the same workflow iteratively across stories, stage by stage. Useful for work too large to finish in one agent session.

The CLI calls skills only through the slash-command prefix `/praxis:<stage>`. Skills never read CLI state.

## Layers and Concerns

| Layer         | Directory                             | Concern                                       |
| ------------- | ------------------------------------- | --------------------------------------------- |
| CLI surface   | `src/praxis-ts/src/cli/`              | Argument parsing, output, exit codes          |
| Workflow      | `src/praxis-ts/src/workflows/`        | Stage graphs and routing rules                |
| Contracts     | `src/praxis-ts/src/contracts/`        | Machine-readable state and result schemas     |
| Control plane | `src/praxis-ts/src/runtime/control/`  | Run supervisor, dispatch compiler, recovery   |
| Converge      | `src/praxis-ts/src/runtime/converge/` | Campaign, pass, ledger, planner, gap assessor |
| Adapters      | `src/praxis-ts/src/runtime/adapters/` | Claude and Codex subprocess wrappers          |
| Workers       | `src/praxis-ts/src/runtime/workers/`  | Worker host, prompt builder, result composer  |
| State         | `src/praxis-ts/src/runtime/state/`    | Durable repository, event log, projections    |
| Tools         | `src/praxis-ts/src/runtime/tools/`    | Tool policy profiles and telemetry            |

## Data Model

Nine contract families carry all shared meaning. Schemas live in `src/praxis-ts/src/contracts/`.

- **Workflow** — stages, order, stop conditions.
- **Run** — run cursor and routing position.
- **Dispatch** — what one worker was asked to do, see, and write.
- **Session** — provider session linkage for safe resume.
- **Policy** — tools, permissions, writable scopes.
- **Stage-result** — completion, blockers, rework, route.
- **Handoff** — bounded cross-story carry-forward.
- **Gap-assessment** — agent-produced findings with severity, kind, evidence, and affected paths.
- **Observability** — traces, lifecycle events, health records.

Every contract is durable, small enough to rebuild worker context from scratch, and provider-agnostic above the adapter layer.

## Data Flow

A single stage advances through five steps:

1. **Compile dispatch.** The run supervisor reads the run cursor, resolves the current stage, and writes a dispatch record describing inputs, artifact paths, and tool policy.
2. **Launch worker.** The active adapter spawns the provider CLI with a prompt that starts with `/praxis:<stage>` and includes the scratch path for the routing payload.
3. **Run skill.** The agent runs the stage skill, emits work-product artifacts (spec, gap report, code changes), and writes a small routing payload to the scratch path.
4. **Validate and accept.** On worker exit, Praxis reads the routing payload, composes the stage-result record with dispatch and session provenance, validates against the contract, and appends to `stage-history.jsonl`.
5. **Advance.** The supervisor reads the stage-result, updates the run cursor, and either pauses (manual) or compiles the next dispatch (autopilot).

If provenance is incomplete or a contract fails validation, Praxis fails closed instead of guessing.

## File Structure

### Repo Layout

- `src/praxis-ts/` — TypeScript CLI. Install, build, and test from here.
- `.claude-plugin/` — authoritative Claude plugin surfaces.
- `.codex-plugin/` — authoritative Codex plugin surfaces.
- `skills/<stage>/SKILL.md` — stage skills shared by both runtimes.
- `commands/<command>.md` — Claude slash-command entry points.
- `CLAUDE.md`, `AGENTS.md` — repo-level instructions per runtime.
- `.praxis/` — runtime state (created per repo; see below).

### Durable State Layout

All runtime state lives under `<repo-root>/.praxis/`.

**Orchestration state**

- `run.json` — active run cursor and next-action truth.
- `story-ledger.json` — multi-slice queue and completion status.
- `stage-history.jsonl` — accepted stage results, in order.
- `events.jsonl`, `lifecycle-events.jsonl` — lifecycle events.
- `dispatches/*.json` — worker dispatch payloads.
- `approvals/*.json` — operator approval records.
- `sessions/`, `traces/` — provider session linkage and traces.

**Task artifacts**

- `objective.md` — the user intent, persisted at run start.
- `target-spec.md` — the current pass's target behavior.
- `gap.md`, `gap.json` — latest repo-to-target findings.
- `remediation-map.md`, `remediation-map.json` — bounded remediation plan.
- `campaign.json`, `campaign-ledger.json` — converge runtime state and findings ledger.
- `results/<stage>.json` — latest stage result per stage.
- `passes/P-*/`, `reviews/R-*/`, `clarifications/C-*/` — per-pass snapshots.

Orchestration state answers "what is the run doing?" Task artifacts answer "what work has been produced?"

## Core Invariants

- Praxis owns the loop; agents own the bounded work.
- Fresh context is the default at stage boundaries.
- Same-stage resume is an optimization, not a dependency.
- Cross-story context passes only through the handoff contract.
- Gap findings come from the agent. If the agent fails, the pass fails.
- Workflow truth lives in durable state, not transcripts.
