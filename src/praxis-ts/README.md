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

All architecture and workflow detail lives in [`docs/`](../../docs/):

- [Workflow](../../docs/workflow.md) — stage graph, execution policy, converge loop.
- [Architecture](../../docs/architecture.md) — layers, contracts, data flow, file structure.
