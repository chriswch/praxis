# Codex Compatibility Settings

`AGENTS.md`, `.codex/config.toml`, `.codex/hooks.json`, and `.codex/agents/` are the authoritative Codex repo surfaces for Praxis.

This file remains as a migration mirror so shared Praxis helpers can reference the same semantics without making `.codex-plugin/` the runtime source of truth.

- Treat `workflow/pipelines/` and `workflow/contracts/` as the source of truth.
- Build each fresh worker context from the worker-launch payload emitted by `workflow/scripts/harness_config.py`.
- Load cross-story context only from `inputs.boundary_handoff` in that payload.
- Keep repo-specific MCP, resources, and tool overrides in the extension points referenced by `.codex-plugin/adapter.json`.
