# Claude Wrapper Reference

This file is the shared prose reference for `commands/craft.md` and `commands/forge.md`.

Claude wrappers should:
- stay thin and defer workflow semantics to `workflow/pipelines/`
- keep orchestration in the main session
- read and write workflow state through `.praxis/`
- use `{artifact-dir}/results/<stage>.json` as the routing API
- prefer `workflow/scripts/orchestrator.py` as the runtime API
- use `workflow/scripts/harness_config.py build-worker-launch --repo-root .` before launching any fresh worker context
- treat `inputs.boundary_handoff` from that launch payload as the only cross-story carry-forward input
- keep authoritative Claude repo behavior in `CLAUDE.md` and `.claude/`, while leaving `.claude-plugin/` as a compatibility mirror rather than shared workflow prose
- treat this reference and the shared pipeline files as canonical over duplicated wrapper prose
