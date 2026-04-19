# Workflow

Praxis drives a spec-driven engineering loop. The workflow shape is stable; the execution policy varies per run.

## Craft Stage Graph

```text
clarifying-intent -> [slicing-stories] -> sketching-design -> driving-tdd
  -> code-reviewing -> code-improving -> verifying-and-adapting
```

`slicing-stories` runs only in `multi_slice` mode. In `single_story` mode the run goes straight from `clarifying-intent` to `sketching-design`.

## Execution Policy

Shape and driving mode are independent:

- `workflow`: `craft`
- `mode`: `single_story` or `multi_slice`
- `run.execution.mode`: `manual` or `autopilot`

`manual` pauses at stage boundaries for operator approval. `autopilot` advances until a stop condition fires.

## Converge Loop

`praxis run "<intent>"` converges the repo against the intent over multiple passes. Each pass runs five stages — three in `converge-pre-remediation`, two in a child `craft` run.

1. **Derive target spec.** If the intent contains a backtick-quoted slash command (e.g. `` `/how this system works` ``), Praxis runs that command and captures the output as the target spec. Otherwise Praxis dispatches `clarifying-intent` with the intent text.
2. **Assess gap.** Praxis dispatches `assessing-gaps` with the target spec and repo scope. The adapter writes a `GapAssessmentResult`; Praxis merges findings into the campaign ledger.
3. **Plan remediation.** The deterministic planner selects bounded slices from the ledger by severity, dependencies, and story budget. No agent call.
4. **Remediate via `craft`.** Praxis spawns a child `craft` run scoped to the selected slices and waits for it to finish.
5. **Reassess.** Praxis re-derives the target spec from the original intent, then loops back to step 2.

The loop stops when any of these hold:

- **Converged** — zero unresolved findings at or above the severity threshold.
- **No new findings** — a pass produces the same finding set and no new ones.
- **Stalled** — two consecutive passes fail to reduce unresolved findings.
- **Budget exhausted** — pass count reaches `--max-passes`.
- **Operator cancelled** — `praxis cancel` was invoked.

## Stage Map

| Workflow                 | Stage                  | Worker     | Purpose                             |
| ------------------------ | ---------------------- | ---------- | ----------------------------------- |
| converge-pre-remediation | clarifying-intent      | adapter    | Derive target spec from intent      |
| converge-pre-remediation | assessing-gaps         | adapter    | Find findings against target spec   |
| converge-pre-remediation | planning-remediation   | in-process | Select bounded slices from ledger   |
| craft (child run)        | clarifying-intent      | adapter    | Confirm story scope inside slice    |
| craft (child run)        | sketching-design       | adapter    | Sketch the change                   |
| craft (child run)        | driving-tdd            | adapter    | Implement with TDD                  |
| craft (child run)        | code-reviewing         | adapter    | Review the implementation           |
| craft (child run)        | code-improving         | adapter    | Apply review feedback               |
| craft (child run)        | verifying-and-adapting | adapter    | Verify and route next-slice or done |

Only `planning-remediation` runs in-process; every other stage dispatches to the adapter.
