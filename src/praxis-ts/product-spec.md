# Praxis TypeScript CLI Product Spec

Status: Proposed v2
Last revised: 2026-04-18

Praxis is a CLI agent. The user gives it an intent; Praxis iterates against the
repo until the implementation matches that intent or the loop exhausts its
budget. Each iteration produces a target spec, finds the gap to that spec,
remediates the gap through the `craft` workflow, and reassesses. Praxis owns
the loop; Claude Code and Codex CLIs do the bounded work.

## Product Decisions

- The CLI is the product. The `praxis` binary is the only entrypoint a user
  invokes; plugin slash commands are convenience launchers, not the product
  surface.
- Claude Code and Codex are integrated as **CLI subprocesses**. Praxis spawns
  them with stage prompts and reads their results back. No agent SDK. No
  in-process provider clients.
- Gap assessment runs through the agent. `gap-assessor` dispatches the active
  adapter (Claude or Codex) with the target spec and repo scope, then parses
  the agent's findings into the `GapAssessmentResult` contract. The legacy
  `LexicalGapAssessor` is removed; no fallback heuristic remains.
- The plugin and the CLI stay decoupled. Skills under `skills/` and slash
  commands under `commands/` never read CLI state; the CLI invokes them only
  through the `/praxis:<stage>` slash command convention.
- Workflow truth lives in durable Praxis state and artifacts under `.praxis/`.
  Provider transcripts explain what happened; they never advance the workflow
  on their own.
- One owning worker runs at a time per run. Parallel workers are out of scope
  for v1.
- Per-phase adapter selection is **deferred**. v1 uses one adapter for the
  whole run.

## Goals

- Accept a user intent string and converge the repo against it without further
  prompting once defaults are set.
- Support an intent that names how to derive the target spec (e.g.,
  `` "refactor the system by result of `/how this system works. Also critique the design.`" ``)
  and an intent that states the target directly (e.g., `"add feature XXX"`).
- Run the iterative loop with bounded budgets: pass count, finding count per
  pass, story count per pass.
- Reconstruct the next valid action from `.praxis/` after any interruption.
- Keep stage workers thin: one bounded assignment per dispatch, fresh context
  by default, same-stage resume only when safe.

## Non-Goals For v1

- Parallel workers, parallel stages, or agent teams inside one run.
- A skill-owned runtime whose true state lives inside one interactive session.
- Provider SDK integration. The CLI subprocess is the integration surface.
- Per-phase adapter mixing (e.g., Claude derives, Codex remediates).
- A heuristic gap assessor. The agent finds gaps; if the agent fails, the
  pass fails.

## Public CLI Surface

The user-facing surface is one command and a small set of lifecycle verbs.

```bash
praxis run "<intent>" [--adapter claude|codex] [--max-passes N] [--severity-threshold critical|high|medium|low] [--scope <path>...]
praxis status
praxis inspect
praxis continue
praxis approve  [--note "..."]
praxis cancel   [--note "..."]
praxis doctor
```

`praxis run` is the entry point for the iterative agent. It takes the user
intent as a positional argument, persists it as `.praxis/objective.md`, and
starts the convergence loop.

Defaults that make `praxis run "<intent>"` work without flags:

- `--adapter`: detected from the environment (`claude` if the Claude Code CLI
  resolves; otherwise `codex`).
- `--max-passes`: 8.
- `--severity-threshold`: `medium`.
- `--scope`: repo root.
- Loop mode: autopilot. The loop advances passes without operator
  intervention until a stop condition fires.

`praxis converge run --objective <path>` remains as an internal/advanced entry
that takes a pre-written objective file. `praxis run "<intent>"` is the
preferred surface; `converge run` exists for scripts that already have an
objective document.

Internal control-plane commands stay available for automation and debugging:
`praxis dispatch`, `praxis submit-stage-result`, `praxis build-worker-launch`,
`praxis register-worker-session`, `praxis run-claude-worker`,
`praxis run-codex-worker`.

## End-to-End Loop

Each iteration of `praxis run "<intent>"` runs five stages. Stages 1–3 belong
to the `converge-pre-remediation` workflow; stages 4–5 belong to the `craft`
workflow embedded as a child run.

1. **Derive target spec.** If the intent contains a backtick-quoted
   command (e.g., `` `/how this system works` ``), Praxis dispatches the
   active adapter to run that command and captures the output as the target
   spec. If the intent is plain text, Praxis dispatches the
   `clarifying-intent` stage with the text as the brief and persists the
   resulting spec.
2. **Assess gap.** Praxis dispatches `assessing-gaps` to the adapter with
   the target spec and the repo scope. The adapter writes a
   `GapAssessmentResult` payload (findings with severity, kind, evidence,
   affected paths). Praxis merges findings into the campaign ledger.
3. **Plan remediation.** Praxis selects bounded slices from the ledger
   (severity, dependencies, story budget) and writes
   `.praxis/remediation-map.{md,json}`. No agent call; the planner is
   deterministic over agent-produced findings.
4. **Remediate via `craft`.** Praxis spawns a child `craft` run scoped to
   the selected slices and waits for it to complete.
5. **Reassess.** Praxis re-derives the target spec from the original intent
   (the repo has changed; the spec may have changed too), then loops to
   stage 2.

The loop stops when one of these holds:

- **Converged.** Zero unresolved findings at or above the severity threshold.
- **No new findings.** A pass produces the same finding set as the previous
  pass and zero new ones.
- **Stalled.** Two consecutive passes fail to reduce unresolved findings.
- **Budget exhausted.** Pass count reaches `--max-passes`.
- **Operator cancelled.** `praxis cancel` was invoked.

## Adapter Model

Adapters are CLI subprocess wrappers. Each adapter knows how to launch its
provider binary, hand it a stage prompt, and read the result back through a
file-based handshake. They do not own workflow routing or artifact meaning.

The adapter contract:

- `launch(request)`: spawn a fresh provider session for the dispatch.
- `resume(sessionId, request)`: resume an existing provider session for the
  same stage.
- `cancel(handle)`: stop the worker process.
- `health()`: probe the provider binary for availability and version.

The Claude adapter spawns `claude -p --session-id <uuid> --permission-mode
acceptEdits --add-dir <workspace> "<prompt>"`. The Codex adapter spawns the
equivalent Codex CLI invocation. Both prepend the stage's `/praxis:<stage>`
slash command to the prompt so the provider runs the matching skill.

The agent writes a routing payload (a JSON file with `outcome_code`, `status`,
`summary_path`, `artifacts_written`, `data`) to a scratch path the CLI
provided in the prompt. When the worker exits, Praxis reads the routing
payload, composes the stage-result record, validates provenance, and advances
the run.

## Stage Map

| Workflow | Stage | Worker | Purpose |
| --- | --- | --- | --- |
| converge-pre-remediation | clarifying-intent | adapter | Derive target spec from intent |
| converge-pre-remediation | assessing-gaps | adapter | Find findings against target spec |
| converge-pre-remediation | planning-remediation | in-process | Select bounded slices from ledger |
| craft (child run) | clarifying-intent | adapter | Confirm story scope inside slice |
| craft (child run) | sketching-design | adapter | Sketch the change |
| craft (child run) | driving-tdd | adapter | Implement with TDD |
| craft (child run) | code-reviewing | adapter | Review the implementation |
| craft (child run) | code-improving | adapter | Apply review feedback |
| craft (child run) | verifying-and-adapting | adapter | Verify and route next-slice/done |

Both pre-remediation and craft stages route through `compileDispatch` and
append to `.praxis/stage-history.jsonl`. The single difference is the worker:
pre-remediation `clarifying-intent` and `assessing-gaps` dispatch to the
adapter; `planning-remediation` runs in-process because its inputs are
already structured.

## Plugin Decoupling

The CLI talks to the plugin only through the slash-command prefix
`/praxis:<stage>`. The plugin owns:

- Stage skills under `skills/<stage>/SKILL.md` (clarifying-intent,
  sketching-design, driving-tdd, code-reviewing, code-improving,
  verifying-and-adapting, slicing-stories).
- Top-level command surfaces under `commands/<command>.md` for Claude
  (`/craft`, `/forge`) and `skills/<command>/SKILL.md` for Codex.

The plugin never reads `.praxis/` state and never depends on CLI types. The
CLI never edits plugin assets; new orchestration logic lives in
`src/praxis-ts/` only.

## Storage Layout

Praxis stores two scopes under `.praxis/`:

- **Per-run orchestration state** — `run.json`, `dispatch.json`,
  `story-ledger.json`, `stage-history.jsonl`, `lifecycle-events.jsonl`,
  `approvals/`, `policies/`, `traces/`, `sessions/`.
- **Per-run task artifacts** — `objective.md`, `target-spec.md`, `gap.md`,
  `gap.json`, `remediation-map.md`, `remediation-map.json`,
  `clarifications/C-###/`, `reviews/<review-id>/`, `passes/<pass-id>/`,
  `results/<stage>.json`.

Repo-level Praxis assets live in version control: workflow definitions,
contract validators, plugin surfaces, and adapter configuration.

## Required Contracts

The runtime preserves these contract families. Schema details live in
`src/praxis-ts/src/contracts/`.

- **Workflow contract** — stages, order, stop conditions.
- **Run contract** — current run cursor and routing position.
- **Dispatch contract** — what one worker was asked to do, see, and write.
- **Session contract** — provider session linkage for safe resume.
- **Policy contract** — tools, permissions, writable scopes.
- **Stage-result contract** — completion, blockers, rework, route.
- **Handoff contract** — bounded cross-story carry-forward.
- **Gap-assessment contract** — agent-produced findings (`GapFinding[]`,
  severity, kind, evidence, affected paths, recommended direction).
- **Observability contract** — traces, lifecycle events, health records.

Every contract is durable, small enough to rebuild worker context without
transcript dependence, provider-agnostic above the adapter layer, sufficient
for recovery, and versionable.

## Module Layout

The TypeScript source stays close to plane boundaries:

- `src/cli/` — Commander.js registry, argument parsing, output formatting,
  exit codes.
- `src/workflows/` — workflow graphs, stage definitions, routing rules.
- `src/contracts/` — shared contracts and validators used across all planes.
- `src/runtime/control/` — run supervisor, dispatch compiler, stage-result
  validator, recovery, status projection.
- `src/runtime/converge/` — campaign service, pass service, ledger,
  pre-remediation service, agent-backed `gap-assessor`, planner.
- `src/runtime/adapters/` — Claude adapter, Codex adapter, command probe.
- `src/runtime/workers/` — worker host protocol, stage prompt builder,
  stage-result composer.
- `src/runtime/state/` — durable repository, event log, projections.

## Core Invariants

- The TypeScript `praxis` CLI is the product entrypoint.
- Codex and Claude are CLI subprocess workers, not workflow owners.
- Praxis owns the loop; agents own the bounded work.
- Fresh context is the default at stage boundaries.
- Same-stage resume is an optimization, not a dependency.
- Cross-story carry-forward happens only through the explicit handoff
  contract.
- The state plane stores orchestration truth; the artifact plane stores
  work-product truth.
- Gap findings come from the agent. If the agent fails, the pass fails.
- If provenance is incomplete or contracts do not validate, Praxis fails
  closed instead of guessing.
