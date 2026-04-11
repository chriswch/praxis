# Praxis Codex Instructions

Praxis keeps workflow semantics in `workflow/` and uses native Codex repo surfaces only as thin runtime wiring.

- Treat `workflow/pipelines/`, `workflow/contracts/`, and `workflow/scripts/` as the semantic source of truth.
- Keep orchestration in the main session; bounded stage work belongs to the current dispatch only.
- Build fresh worker context from `python3 -m workflow.scripts.harness_config build-worker-launch --repo-root .`.
- When Praxis injects a boundary handoff, treat that handoff plus the current dispatch and run metadata as the only cross-story carry-forward context.
- Do not rely on transcript continuity between stories; use `.praxis/run.json`, the current stage artifacts, and the active handoff file instead.
- Native Codex repo surfaces live in `.codex/config.toml`, `.codex/hooks.json`, and `.codex/agents/`.
- `.codex-plugin/` remains a compatibility mirror during migration, not the authoritative Codex runtime path.
