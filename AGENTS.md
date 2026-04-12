# Praxis Codex Instructions

Praxis keeps workflow semantics in `src/praxis/` and uses native Codex repo surfaces only as thin runtime wiring.

- Treat `src/praxis/workflows/`, `src/praxis/contracts/`, and `src/praxis/runtime/` as the semantic source of truth.
- Keep orchestration in the main session; bounded stage work belongs to the current dispatch only.
- Build fresh worker context from `praxis build-worker-launch --repo-root .` after installing the repo in editable mode or bootstrapping `src/` onto `PYTHONPATH`.
- When Praxis injects a boundary handoff, treat that handoff plus the current dispatch and run metadata as the only cross-story carry-forward context.
- Do not rely on transcript continuity between stories; use `.praxis/run.json`, the current stage artifacts, and the active handoff file instead.
- Native Codex repo surfaces live in `.codex/config.toml`, `.codex/hooks.json`, and `.codex/agents/`.
- `.codex-plugin/` remains a compatibility mirror during migration, not the authoritative Codex runtime path.
