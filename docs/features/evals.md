# Evals

Praxis currently ships a local eval pack and contract tests for the shared
runtime behavior.

## Eval Pack

Run the full local eval pack with:

```bash
python3 -m workflow.scripts.eval_pack run --fixtures-dir tests/evals/fixtures
```

Run the native-harness CI subset with:

```bash
python3 -m workflow.scripts.eval_pack native-gate --fixtures-dir tests/evals/fixtures
```

Primary shared source:

- `workflow/scripts/eval_pack.py`

## Current Eval Coverage

The bundled fixtures currently exercise:

- routing outcomes
- resume behavior
- fail-closed boundary stops
- handoff budget enforcement
- native Claude and Codex session-start hooks
- `show-run` trace reconstruction
- Claude/Codex semantic parity for native launch and handoff outcomes

## Contract Tests

The repo also includes contract-style unit coverage under `tests/contracts/`.

Current coverage areas include:

- orchestrator runtime behavior
- story-boundary transitions
- harness configuration loading
- hook integration
- trace summaries
- documentation references

## Fixtures

The eval fixtures live under `tests/evals/fixtures/` and are designed to verify
the shared runtime behavior instead of one adapter-specific transcript.
