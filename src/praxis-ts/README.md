# Praxis TypeScript CLI

The TypeScript orchestrator that drives the Praxis workflow. This is the implementation; see the repo-root [README](../../README.md) for what Praxis is.

## Install, Build, Test

```bash
npm install
npm run typecheck
npm run build
npm test
```

## Docs

All architecture, CLI, workflow, and product detail lives in [`docs/`](../../docs/):

- [Architecture](../../docs/architecture.md) — runtime planes, module layout, durable state, adapter model.
- [CLI Reference](../../docs/cli-reference.md) — commands, flags, worker lifecycle.
- [Workflow](../../docs/workflow.md) — stage graph, execution policy, convergence loop.
- [Product Spec](../../docs/product-spec.md) — goals, non-goals, core invariants.
