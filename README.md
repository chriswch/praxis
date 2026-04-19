# Praxis

Spec-driven software engineering workflows for Claude Code and Codex, plus an orchestrator CLI that drives them end to end.

Praxis has two layers:

- **Plugin** — skills and slash commands an agent can run interactively. Delivers the shared clarify → slice → sketch → implement → review → improve → verify workflow.
- **CLI** — a TypeScript orchestrator at `src/praxis-ts/` that drives the same workflow iteratively across stories. Useful for work too large to finish in one agent session.

The two layers stay decoupled: the CLI invokes skills through the plugin's slash command, and skills never read CLI state.

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
cd src/praxis-ts
npm install
npm run build
npm test
```

## Development

- Source of truth for workflow, contracts, and runtime: `src/praxis-ts/src/workflows/`, `src/praxis-ts/src/contracts/`, `src/praxis-ts/src/runtime/`.
- Install and work from `src/praxis-ts/` (`npm install`, `npm run build`, `npm test`).
- Runtime state for each repo lives under `<repo-root>/.praxis/`; see [docs/architecture.md](docs/architecture.md#durable-state-layout).
- Plugin surfaces live at `skills/` and `commands/`; new orchestration logic goes in `src/praxis-ts/` only.

## Documentation

- [Workflow](docs/workflow.md) — stage graph and converge loop.
- [Architecture](docs/architecture.md) — layers, contracts, data flow, file structure.

## License

MIT
