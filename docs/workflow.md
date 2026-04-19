# Workflow

Praxis drives a spec-driven engineering loop. The workflow shape is stable; the execution policy varies per run.

## Stage Graph

```text
clarifying-intent -> [slicing-stories] -> sketching-design -> driving-tdd
  -> code-reviewing -> code-improving -> verifying-and-adapting
```

`slicing-stories` runs only in `multi_slice` mode. In `single_story` mode the run proceeds directly from `clarifying-intent` to `sketching-design`.

## Execution Policy

Workflow shape is separate from how the run is driven:

- `workflow`: `craft`
- `mode`: `single_story` or `multi_slice`
- `run.execution.mode`: `manual` or `autopilot`

`manual` pauses at stage boundaries for operator approval; `autopilot` advances without prompting until a stop condition fires.

## Plugin Entry Points

Both Claude and Codex invoke the same stage skills via the `/praxis:<stage>` slash command convention.

- Claude: `/craft` (see `commands/craft.md`)
- Codex: the `craft` skill at `skills/craft/SKILL.md`

Stage skills: `clarifying-intent`, `slicing-stories`, `sketching-design`, `driving-tdd`, `code-reviewing`, `code-improving`, `verifying-and-adapting`, `assessing-gaps`.

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

Both pre-remediation and craft stages route through `compileDispatch` and append to `.praxis/stage-history.jsonl`. The single difference is the worker: pre-remediation `clarifying-intent` and `assessing-gaps` dispatch to the adapter; `planning-remediation` runs in-process because its inputs are already structured.

## Convergence Loop

`praxis run "<intent>"` converges the repo against the user intent over multiple passes. Each pass runs five stages; stages 1–3 belong to `converge-pre-remediation`, stages 4–5 to `craft` embedded as a child run.

1. **Derive target spec.** If the intent contains a backtick-quoted slash command (e.g., `` `/how this system works` ``), Praxis dispatches the active adapter to run that command and captures the output as the target spec. Otherwise Praxis dispatches `clarifying-intent` with the intent text as the brief.
2. **Assess gap.** Praxis dispatches `assessing-gaps` with the target spec and the repo scope. The adapter writes a `GapAssessmentResult` payload; Praxis merges findings into the campaign ledger.
3. **Plan remediation.** Praxis selects bounded slices from the ledger (severity, dependencies, story budget) and writes `.praxis/remediation-map.{md,json}`. Deterministic, no agent call.
4. **Remediate via `craft`.** Praxis spawns a child `craft` run scoped to the selected slices and waits for it to complete.
5. **Reassess.** The target spec is re-derived (the repo has changed; the spec may have too), then the loop returns to stage 2.

The loop stops when any of these hold:

- **Converged** — zero unresolved findings at or above the severity threshold.
- **No new findings** — pass produces the same finding set and zero new ones.
- **Stalled** — two consecutive passes fail to reduce unresolved findings.
- **Budget exhausted** — pass count reaches `--max-passes`.
- **Operator cancelled** — `praxis cancel` was invoked.

## Plugin Decoupling

The CLI talks to the plugin only through the slash-command prefix `/praxis:<stage>`. The plugin never reads `.praxis/` state and never depends on CLI types; the CLI never edits plugin assets.

- Stage skills live under `skills/<stage>/SKILL.md`.
- Top-level command surfaces live under `commands/<command>.md` (Claude) and `skills/<command>/SKILL.md` (Codex).
- New orchestration logic lives in `src/praxis-ts/` only.
