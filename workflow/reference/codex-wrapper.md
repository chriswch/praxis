# Codex Wrapper Reference

This file is the shared prose reference for `skills/craft/SKILL.md` and `skills/forge/SKILL.md`.

Codex wrappers should:
- stay thin and defer workflow semantics to `workflow/pipelines/`
- keep orchestration in the main session
- read and write workflow state through `.praxis/`
- use `{artifact-dir}/results/<stage>.json` as the routing API
- prefer `workflow/scripts/orchestrator.py` as the runtime API
- use `workflow/scripts/harness_config.py build-worker-launch --repo-root .` before launching any fresh worker context
- treat `inputs.boundary_handoff` from that launch payload as the only cross-story carry-forward input
- keep repo-specific settings, hooks, and subagent behavior in `.codex-plugin/` rather than in shared workflow prose
