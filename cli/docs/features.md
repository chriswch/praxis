# Features

What currently ships and is verified to work. Add an entry here only after the behavior is implemented and exercised end-to-end.

Track planned work in [backlog.md](backlog.md). The product.md document remains the design source of truth.

## Shipped

### S-001 walking skeleton

**Shipped:** 2026-04-26
**Spec reference:** product.md §4, §9, §12

`praxis run "<intent>"` bootstraps a fresh run dir under `<cwd>/.praxis/runs/<run-id>/`, writes the raw intent to `00-intent.txt`, and emits a §9-shaped `state.json` with all three stages marked `pending` and `currentStage: "clarify-assess"`. The §12 module scaffold is in place; stage execution is still stubbed and the `createQueryFn` DI seam is wired through `runStage` for later slices.

- Inputs: a single positional `<intent>` string.
- Outputs: run-id printed to stdout (matches `^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}-[0-9a-f]{4}$`); `00-intent.txt` (verbatim, no trailing newline); `state.json` (pretty-printed §9 schema).
- Notable bounds: empty/whitespace and missing intents fail closed with a stderr message and no `.praxis/runs/` side effects. Run-id timestamp is UTC. No pre-flight, no `.gitignore` append, no agent execution yet.
- Verified by: `cli/tests/e2e/run-walking-skeleton.test.ts`, `cli/tests/e2e/build-smoke.test.ts`, `cli/tests/workflow/run-id.test.ts`, `cli/tests/workflow/runner.test.ts`, `cli/tests/support/scripted-query.test.ts`.

## Format

When entries are added, use this shape:

```
### <feature-or-stage-id>

**Shipped:** <YYYY-MM-DD>
**Spec reference:** product.md §<section>

<one-paragraph behavior summary>

- Inputs: …
- Outputs: …
- Notable bounds / edge cases: …
- Verified by: <test path or manual repro>
```

Keep entries grounded in observed behavior, not intent. If a feature is partially implemented, file the missing pieces in `backlog.md` and describe only the shipped slice here.
