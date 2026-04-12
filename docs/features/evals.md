# Evals

Praxis currently ships a local eval pack and contract tests for the shared
runtime behavior.

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

## Current Eval Coverage

The bundled fixtures currently exercise:

- routing outcomes
- story-boundary stop and handoff budget enforcement
- worker dispatch bookkeeping and resume fallbacks
- provider-native resume success and failure paths
- native Claude and Codex session-start hooks
- `status` trace reconstruction
- Claude/Codex semantic parity for native launch and handoff outcomes

## Contract Tests

The repo also includes contract-style unit coverage under `tests/contracts/`.

Current coverage areas include:

- public CLI behavior and packaging smoke tests
- orchestrator runtime behavior
- worker planning, dispatch, and provider resume
- story-boundary transitions and recovery
- harness configuration loading and hook integration
- trace summaries and documentation references

## Fixtures

The eval fixtures live under `tests/evals/fixtures/` and are designed to verify
shared runtime behavior instead of one adapter-specific transcript.
