# Evals

Praxis ships a local eval pack and contract tests for the shared runtime
behavior.

## Eval Pack

Run the full local eval pack with:

```bash
python3 -m praxis.runtime.observability.eval_pack run --fixtures-dir tests/evals/fixtures
```

Run the native-harness CI subset with:

```bash
python3 -m praxis.runtime.observability.eval_pack native-gate --fixtures-dir tests/evals/fixtures
```

Primary shared source:

- `src/praxis/runtime/observability/eval_pack.py`

`native-gate` selects `native_harness`, `native_trace`, and `adapter_parity`
fixtures only. It fails closed when any of those fixture kinds are missing.

## Current Eval Coverage

The bundled fixtures currently exercise:

- routing outcomes
- story-boundary stop and handoff budget enforcement
- worker dispatch bookkeeping and resume fallbacks
- provider-native resume success and failure paths
- native Claude and Codex session-start hooks, including invalid-handoff
  launch-failure telemetry
- `praxis status` trace reconstruction and `active_runtime` inspection
- Claude/Codex semantic parity for both fresh-launch and manual-resume runtime
  artifacts

## Contract Tests

The repo also includes contract-style unit coverage under `tests/contracts/`.

Current coverage areas include:

- public CLI behavior and packaging smoke tests
- orchestrator runtime behavior
- worker planning, dispatch, projected-policy reporting, and provider resume
- story-boundary transitions and recovery
- harness configuration loading and hook integration
- adapter runtime launch, resume, status, and cancel surfaces
- real sidecar execution plus non-owner result guards
- brokered tool-use recording, denials, and operator summaries
- trace summaries, eval gating, and documentation references

## Fixtures

The eval fixtures live under `tests/evals/fixtures/` and verify shared runtime
behavior instead of one adapter-specific transcript.

Notable native fixtures include:

- `adapter_parity.json` for launch and handoff semantics
- `adapter_parity_resume.json` for manual-resume parity over the public status
  surface
- `native_codex_harness.json` and `native_claude_harness.json` for native hook
  contract coverage
