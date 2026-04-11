# Codex Harness Settings

- Treat `workflow/pipelines/` and `workflow/contracts/` as the source of truth.
- Build each fresh worker context from the worker-launch payload emitted by `workflow/scripts/harness_config.py`.
- Load boundary handoff input only from `inputs.boundary_handoff` in that payload.
- Keep repo-specific MCP, resources, and tool overrides in the extension points referenced by `.codex-plugin/adapter.json`.
