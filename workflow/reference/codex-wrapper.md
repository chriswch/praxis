# Codex Wrapper Reference

This file is the shared prose reference for `skills/craft/SKILL.md` and `skills/forge/SKILL.md`.

Codex wrappers should:
- stay thin and defer workflow semantics to `workflow/pipelines/`
- keep orchestration in the main session
- read and write workflow state through `.praxis/`
- use `{artifact-dir}/results/<stage>.json` as the routing API
- prefer the installed `praxis --json` CLI as the runtime API
- use `praxis build-worker-launch --repo-root . --json` before launching any fresh worker context
- treat `inputs.boundary_handoff` from that launch payload as the only cross-story carry-forward input
- keep authoritative Codex repo behavior in `AGENTS.md` and `.codex/`, while leaving `.codex-plugin/` as a compatibility mirror rather than shared workflow prose
