# Praxis

Spec-driven software engineering workflows for Claude Code and Codex, plus an orchestrator CLI that drives them end to end.

Praxis has two layers:

- **Plugin** — skills and slash commands an agent can run interactively. Lives at [`plugin/`](plugin/). Delivers the shared clarify → slice → sketch → implement → review → improve → verify workflow.
- **CLI** — a TypeScript orchestrator at [`cli/`](cli/) that drives the same workflow iteratively across stories. Useful for work too large to finish in one agent session.

The two layers stay decoupled: the CLI composes plugin-facing prompts through `cli/src/runtime/dispatch/`, and skills never read CLI state.

## Usage

From the plugin:

- Claude: `/craft`
- Codex: run the `craft` skill.

From the CLI — give Praxis an intent and let it converge:

```bash
praxis run "<your intent>"
praxis status
praxis continue   # advance after a checkpoint
praxis cancel     # stop the run
```

## Getting Started

```bash
cd cli
npm install
npm run build
npm test
```

## Development

- Source of truth for workflow, contracts, and runtime: `cli/src/workflows/`, `cli/src/contracts/`, `cli/src/runtime/`.
- Install and work from `cli/` (`npm install`, `npm run build`, `npm test`).
- Runtime state for each repo lives under `<repo-root>/.praxis/`; see [docs/architecture.md](docs/architecture.md#durable-state-layout).
- Plugin surfaces live under `plugin/`; new orchestration logic goes in `cli/` only.

## Documentation

- [Workflow](docs/workflow.md) — stage graph and converge loop.
- [Architecture](docs/architecture.md) — layers, contracts, data flow, file structure.

## License

MIT
