# Praxis Codex Instructions

Praxis is a TypeScript CLI at `src/praxis-ts/`. All workflow semantics, contracts, and runtime control live there; native Codex repo surfaces are thin wiring on top.

- Treat `src/praxis-ts/src/workflows/`, `src/praxis-ts/src/contracts/`, and `src/praxis-ts/src/runtime/` as the source of truth.
- Install and work from `src/praxis-ts/` (`npm install`, `npm run build`, `npm test`). The legacy Python package was removed.
- Keep orchestration in the main session; bounded stage work belongs to the current dispatch only.
- When Praxis injects a boundary handoff, treat that handoff plus the current dispatch and run metadata as the only cross-story carry-forward context.
- Do not rely on transcript continuity between stories; use `.praxis/run.json`, the current stage artifacts, and the active handoff file instead.
- Native Codex repo surfaces live in `.codex/config.toml`, `.codex/hooks.json`, and `.codex/agents/`.
- `.codex-plugin/` remains a compatibility mirror during migration, not the authoritative Codex runtime path.
