# Praxis CLI

Praxis is a TypeScript CLI at `cli/`. It is the orchestrator that
drives plugin-side skills via prompt-based dispatch. All workflow semantics,
contracts, and runtime control live in the CLI; the plugin supplies skills
that the CLI composes prompts for at dispatch time.

- Treat `cli/src/workflows/`, `cli/src/contracts/`, and
  `cli/src/runtime/` as the source of truth.
- Install and work from `cli/` (`npm install`, `npm run build`,
  `npm test`).
- The CLI→plugin boundary is the `cli/src/runtime/dispatch/`
  module — stage-dispatch, prompt-templates, input-stager, output-parser.
  Every plugin-facing prompt routes through it.
- When the CLI carries cross-story context, it stages a normal input
  envelope at `.praxis/dispatch/<stage>/input.json`; the plugin skill reads
  that path as ordinary input.
- Do not rely on transcript continuity between stories; use
  `.praxis/run.json`, the current stage artifacts, and the staged dispatch
  input file instead.

## Commands

- `/craft`

Execution policy is separate from workflow shape:
- `workflow`: `craft`
- `mode`: `single_story` or `multi_slice`
- `run.execution.mode`: `manual` or `autopilot`

## Artifact Paths

Use `.praxis/results/<stage>.json`, `.praxis/run.json`, and
`.praxis/story-ledger.json` as the routing source of truth. Human-readable
artifacts remain the reading surface.

`praxis status --repo-root . --json` surfaces the durable run state.

## CLI-Only

The CLI does not read plugin files on disk. Plugin health is the host
adapter's concern; the CLI surfaces errors at dispatch time rather than
pre-flighting the plugin.
