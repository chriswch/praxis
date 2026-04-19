# Architecture

Praxis has two layers that stay decoupled.

- **Plugin** — skills (`skills/`) and entry points (`commands/` for Claude, `skills/craft/SKILL.md` for Codex) an agent can run interactively. Delivers the shared workflow without depending on the CLI.
- **CLI** — a TypeScript orchestrator at `src/praxis-ts/` that drives the same workflow iteratively across stories, stage by stage. Useful for work too large to finish in one agent session.

The CLI invokes skills through the plugin's slash command convention (`/praxis:<stage>`); skills never read CLI state.

## Repo Layout

- `src/praxis-ts/src/workflows/` — workflow graph and stage artifact contracts.
- `src/praxis-ts/src/contracts/` — machine-readable state, result, handoff, and harness contracts.
- `src/praxis-ts/src/runtime/` — run control plane, dispatch compiler, recovery, worker hosts, and status projection.
- `.praxis/` — runtime state area for run cursors, story ledgers, stage results, dispatch bundles, approvals, policies, launch records, worker and session records, resume records, and traces.
- `.claude-plugin/` — authoritative Claude plugin surfaces (adapter, agents, extension notes).
- `.codex-plugin/` — authoritative Codex plugin surfaces (adapter, agents, config, extension notes).
- `CLAUDE.md` and `AGENTS.md` — repo-level instructions for each runtime.

## Module Layout

TypeScript source stays close to plane boundaries:

- `src/cli/` — Commander.js registry, argument parsing, output formatting, exit codes.
- `src/workflows/` — workflow graphs, stage definitions, routing rules.
- `src/contracts/` — shared contracts and validators used across all planes.
- `src/runtime/control/` — run supervisor, dispatch compiler, stage-result validator, recovery, status projection.
- `src/runtime/converge/` — campaign service, pass service, ledger, pre-remediation service, agent-backed `gap-assessor`, planner.
- `src/runtime/adapters/` — Claude adapter, Codex adapter, command probe.
- `src/runtime/workers/` — worker host protocol, stage prompt builder, stage-result composer.
- `src/runtime/state/` — durable repository, event log, projections.
- `src/runtime/tools/` — tool policy profiles and telemetry evidence records.

## How the CLI Calls Skills

The CLI spawns a provider worker (Claude or Codex) and prepends the stage's slash command (for example `/praxis:driving-tdd`). The agent runs the skill, writes a small routing payload to a scratch file, and exits. The CLI then assembles the full stage-result record (filling in run, dispatch, session, and route metadata) and advances the run. Skills therefore stay pure — they emit prose, not CLI state.

## Adapter Model

Adapters are CLI subprocess wrappers. Each adapter knows how to launch its provider binary, hand it a stage prompt, and read the result back through a file-based handshake. Adapters do not own workflow routing or artifact meaning.

Adapter contract:

- `launch(request)` — spawn a fresh provider session for the dispatch.
- `resume(sessionId, request)` — resume an existing provider session for the same stage.
- `cancel(handle)` — stop the worker process.
- `health()` — probe the provider binary for availability and version.

The Claude adapter spawns `claude -p --session-id <uuid> --permission-mode acceptEdits --add-dir <workspace> "<prompt>"`. The Codex adapter spawns the equivalent Codex CLI invocation. Both prepend the stage's `/praxis:<stage>` slash command so the provider runs the matching skill.

The agent writes a routing payload (JSON with `outcome_code`, `status`, `summary_path`, `artifacts_written`, `data`) to a scratch path the CLI provided in the prompt. When the worker exits, Praxis reads the routing payload, composes the stage-result record, validates provenance, and advances the run.

## Durable State Layout

Praxis stores two scopes under `<repo-root>/.praxis/`.

**Per-run orchestration state**

- `run.json` — active run cursor and next-action truth.
- `story-ledger.json` — multi-slice queue and completion status.
- `events.jsonl` / `lifecycle-events.jsonl` — lifecycle events.
- `stage-history.jsonl` — accepted stage results.
- `dispatches/*.json` — durable worker dispatch payloads.
- `approvals/*.json` — approval records.
- `policy/tool-records.jsonl` / `policies/` — tool and policy evidence.
- `sessions/`, `traces/` — provider session linkage and traces.

**Per-run task artifacts**

- `objective.md` — converge objective manifest summary.
- `target-spec.md` — authoritative remediation target behavior for the active campaign scope.
- `gap.md` / `gap.json` — latest assessed repo-to-target gaps (human + machine readable).
- `remediation-map.md` / `remediation-map.json` — latest bounded remediation plan from selected findings.
- `campaign.json` / `campaign-ledger.json` — converge campaign runtime state and durable findings ledger.
- `results/<stage>.json` — latest stage result per stage (e.g., `results/assessing-gaps.json`, `results/planning-remediation.json`).
- `reviews/R-*/` — converge assessment snapshots per pass.
- `passes/P-*/` — pass snapshots (batch compatibility artifacts, child-run state, pass summaries).
- `clarifications/C-###/` — per-pass clarification snapshots.

## Contracts

The runtime preserves these contract families. Schemas live in `src/praxis-ts/src/contracts/`.

- **Workflow** — stages, order, stop conditions.
- **Run** — current run cursor and routing position.
- **Dispatch** — what one worker was asked to do, see, and write.
- **Session** — provider session linkage for safe resume.
- **Policy** — tools, permissions, writable scopes.
- **Stage-result** — completion, blockers, rework, route.
- **Handoff** — bounded cross-story carry-forward.
- **Gap-assessment** — agent-produced findings (`GapFinding[]`, severity, kind, evidence, affected paths, recommended direction).
- **Observability** — traces, lifecycle events, health records.

Every contract is durable, small enough to rebuild worker context without transcript dependence, provider-agnostic above the adapter layer, sufficient for recovery, and versionable.

## Core Invariants

- The TypeScript `praxis` CLI is the product entrypoint.
- Codex and Claude are CLI subprocess workers, not workflow owners.
- Praxis owns the loop; agents own the bounded work.
- Fresh context is the default at stage boundaries.
- Same-stage resume is an optimization, not a dependency.
- Cross-story carry-forward happens only through the explicit handoff contract.
- The state plane stores orchestration truth; the artifact plane stores work-product truth.
- Gap findings come from the agent. If the agent fails, the pass fails.
- If provenance is incomplete or contracts do not validate, Praxis fails closed instead of guessing.
