# Praxis

Praxis is a TypeScript CLI at `src/praxis-ts/`. All workflow semantics, contracts, and runtime control live there; native Claude repo surfaces are thin wiring on top.

- Treat `src/praxis-ts/src/workflows/`, `src/praxis-ts/src/contracts/`, and `src/praxis-ts/src/runtime/` as the source of truth.
- Install and work from `src/praxis-ts/` (`npm install`, `npm run build`, `npm test`). The legacy Python package was removed.
- When Praxis injects a boundary handoff, treat that handoff plus the current dispatch and run metadata as the only cross-story carry-forward context.
- Do not rely on transcript continuity between stories; use `.praxis/run.json`, the current stage artifacts, and the active handoff file instead.
- Native Claude repo surfaces live in `.claude/settings.json`, `.claude/hooks/`, and `.claude/agents/`.
- `.claude-plugin/` remains a compatibility mirror during migration, not the authoritative Claude runtime path.

## Commands

- `/craft`
- `/forge`

Execution policy is separate from workflow shape:
- `workflow`: `craft` or `forge`
- `mode`: `single_story` or `multi_slice`
- `run.execution.mode`: `manual` or `autopilot`

## Artifact Paths

Use `.praxis/results/<stage>.json`, `.praxis/run.json`, and `.praxis/story-ledger.json` as the routing source of truth. Human-readable artifacts remain the reading surface.

`praxis status --repo-root . --json` surfaces the durable run state.
