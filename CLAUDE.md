# Praxis

Praxis keeps workflow semantics in `src/praxis/` and uses Claude-native repo surfaces only as thin runtime wiring.

- Treat `src/praxis/workflows/`, `src/praxis/contracts/`, and `src/praxis/runtime/` as the semantic source of truth.
- Build each fresh worker context from `praxis build-worker-launch --repo-root .` after installing Praxis with `uv tool install --editable .` or bootstrapping `src/` onto `PYTHONPATH`.
- When Praxis injects a boundary handoff, treat that handoff plus the current dispatch and run metadata as the only cross-story carry-forward context.
- Do not rely on transcript continuity between stories; use `.praxis/run.json`, the current stage artifacts, and the active handoff file instead.
- Native Claude repo surfaces live in `.claude/settings.json`, `.claude/hooks/`, and `.claude/agents/`.
- `.claude-plugin/` remains a compatibility mirror during migration, not the authoritative Claude runtime path.

Claude commands under `commands/` are thin adapters over the shared Praxis workflow files in `src/praxis/workflows/`. If a Claude wrapper and a shared workflow file disagree, the shared workflow file wins.

## Commands

- `/craft`
- `/forge`

Execution policy is separate from workflow shape:
- `workflow`: `craft` or `forge`
- `mode`: `single_story` or `multi_slice`
- `run.execution.mode`: `manual` or `autopilot`

## Canonical References

- Shared runtime reference: `src/praxis/workflows/reference/runtime-reference.md`
- Shared Claude wrapper guidance: `src/praxis/workflows/reference/claude-wrapper.md`
- Shared workflows: `src/praxis/workflows/craft.md`, `src/praxis/workflows/forge.md`
- Shared runtime helpers: `src/praxis/runtime/orchestrator.py`, `src/praxis/runtime/adapters/harness.py`, `src/praxis/runtime/run_state.py`, `src/praxis/runtime/story_boundary.py`, `src/praxis/runtime/observability/eval_pack.py`

## Artifact Paths

Use `.praxis/results/<stage>.json`, `run.json`, and `story-ledger.json` as the routing source of truth. Human-readable artifacts remain the reading surface.

`show-run` also surfaces a `trace` block for dispatch, recent boundary and stop signals, and recovery state.
