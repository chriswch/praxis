# Praxis

Spec-driven software engineering workflows for Claude Code and Codex.

Praxis keeps the shared workflow semantics in `workflow/` and keeps adapter wrappers thin. Start here for the high-level entrypoints, then use `workflow/reference/runtime-reference.md` for the canonical runtime reference.

## Workflows

### Craft

```text
clarifying-intent -> [slicing-stories] -> sketching-design -> driving-tdd
  -> code-reviewing -> code-improving -> verifying-and-adapting
```

### Forge

```text
clarifying-intent -> [slicing-stories] -> sketching-design -> rapid-implementing
  -> code-reviewing -> code-improving -> done
```

Execution policy stays separate from workflow shape:
- `workflow`: `craft` or `forge`
- `mode`: `single_story` or `multi_slice`
- `run.execution.mode`: `manual` or `autopilot`

## Primary References

- Runtime reference: `workflow/reference/runtime-reference.md`
- Claude wrapper reference: `workflow/reference/claude-wrapper.md`
- Codex wrapper reference: `workflow/reference/codex-wrapper.md`
- Shared workflows: `workflow/pipelines/craft.md`, `workflow/pipelines/forge.md`
- Shared contracts: `workflow/contracts/`
- Shared runtime helpers: `workflow/scripts/`

## Adapter Entry Points

- Claude uses `commands/craft.md` and `commands/forge.md`.
- Codex uses `skills/craft/SKILL.md` and `skills/forge/SKILL.md`.
- Claude repo-scoped harness behavior lives under `CLAUDE.md` and `.claude/`, with `.claude-plugin/` kept as a compatibility mirror during migration.
- Codex repo-scoped harness behavior lives under `AGENTS.md` and `.codex/`, with `.codex-plugin/` kept as a compatibility mirror during migration.

## Eval Pack

```bash
python3 -m workflow.scripts.eval_pack run --fixtures-dir tests/evals/fixtures
```

## License

MIT
