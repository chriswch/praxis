# Praxis Codex Instructions

Praxis is a TypeScript CLI at `src/praxis-ts/`. All workflow semantics, contracts, and runtime control live there; repo-native Codex surfaces are thin wiring on top.

- Treat `src/praxis-ts/src/workflows/`, `src/praxis-ts/src/contracts/`, and `src/praxis-ts/src/runtime/` as the source of truth.
- Install and work from `src/praxis-ts/` (`npm install`, `npm run build`, `npm test`).
- Keep orchestration in the main session; bounded stage work belongs to the current dispatch only.
- When Praxis injects a boundary handoff, treat that handoff plus the current dispatch and run metadata as the only cross-story carry-forward context.
- Do not rely on transcript continuity between stories; use `.praxis/run.json`, the current stage artifacts, and the active handoff file instead.
- Authoritative Codex plugin surfaces live under `.codex-plugin/` (adapter, agents, config, extension notes).
