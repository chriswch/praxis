# Praxis TypeScript CLI

A new TypeScript-first Praxis runtime implemented with Commander.js.

This package is intentionally independent from the legacy Python control plane.
Workflow routing, durable state, and lifecycle decisions are implemented in this
TypeScript codebase.

## Install

```bash
cd src/praxis-ts
npm install
```

## Build and Test

```bash
npm run typecheck
npm run build
npm test
```

## CLI Surface

Public commands:

- `praxis run`
- `praxis continue`
- `praxis resume`
- `praxis approve`
- `praxis cancel`
- `praxis status`
- `praxis inspect`
- `praxis doctor`
- `praxis converge run`
- `praxis converge status`
- `praxis converge inspect`
- `praxis converge resume`
- `praxis converge continue`
- `praxis converge cancel`

Internal commands:

- `praxis dispatch`
- `praxis submit-stage-result`
- `praxis build-worker-launch`
- `praxis register-worker-session`
- `praxis run-codex-worker`

Global flags:

- `--repo-root <path>`
- `--json`

## Runtime Planes

- `src/cli/`: Commander command plane, envelopes, exit-code behavior.
- `src/workflows/`: workflow graph and routing rules for `craft` and `forge`.
- `src/runtime/control/`: run supervisor, dispatch compiler, stage-result
  validator, boundary checkpointing, and status projections.
- `src/runtime/adapters/`: Codex and Claude adapter abstractions.
- `src/runtime/tools/`: tool policy profiles and telemetry evidence records.
- `src/runtime/state/`: durable state storage under `.praxis/`.
- `src/contracts/`: shared runtime contracts and validation errors.

## Durable State Layout

This runtime stores operational state at `<repo-root>/.praxis/`:

- `run.json`: active run cursor and next-action truth.
- `story-ledger.json`: multi-slice queue and completion status.
- `events.jsonl`: lifecycle events.
- `stage-history.jsonl`: accepted stage results.
- `dispatches/*.json`: durable worker dispatch payloads.
- `approvals/*.json`: approval records.
- `policy/tool-records.jsonl`: tool and policy evidence.
- `objective.md`: converge objective manifest summary.
- `campaign.json`: converge campaign runtime state.
- `campaign-ledger.json`: durable converge findings ledger.
- `reviews/R-*/`: converge assessment artifacts per pass.
- `passes/P-*/`: converge remediation batch and pass summaries.

## Worker Lifecycle (Operator Sequence)

1. Run `praxis dispatch`.
2. Run `praxis build-worker-launch` and start the worker from that payload.
3. Once a worker session is live, run `praxis register-worker-session`.
4. Worker writes a stage result file, then run `praxis submit-stage-result`.

## Notes

- v1 supports one owning worker at a time.
- Every stage runs in the target repo's current worktree. Review stays fresh
  through a new Praxis-owned session, not a detached review worktree.
- Workflow progression is routed from stage-result artifacts, not transcripts.
- Multi-slice carry-forward is explicit through `handoff.json` at story
  boundaries.
