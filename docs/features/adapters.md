# Adapters

Praxis currently integrates with Claude Code and Codex through native repo
surfaces plus thin wrapper entrypoints.

## Claude

Current Claude surfaces:

- `CLAUDE.md`
- `.claude/adapter.json`
- `.claude/settings.json`
- `.claude/hooks/session_start.py`
- `.claude/agents/`
- `commands/craft.md`
- `commands/forge.md`

Current behavior:

- Claude commands stay thin and defer shared semantics to `workflow/`
- the session-start hook loads the current Praxis launch context
- launch metadata is written to `.praxis/runtime/`

## Codex

Current Codex surfaces:

- `AGENTS.md`
- `.codex/adapter.json`
- `.codex/config.toml`
- `.codex/hooks.json`
- `.codex/hooks/session_start.py`
- `.codex/agents/`
- `skills/craft/SKILL.md`
- `skills/forge/SKILL.md`

Current behavior:

- Codex skills stay thin and defer shared semantics to `workflow/`
- the session-start hook loads the current Praxis launch context
- launch metadata is written to `.praxis/runtime/`

## Shared Adapter Behavior

Praxis currently shares these adapter behaviors across Claude and Codex:

- repo-scoped harness config loaded by `workflow/scripts/harness_config.py`
- worker-launch payload generation through `build-worker-launch`
- session-start hook logic implemented in `workflow/scripts/claude_hooks.py` and
  `workflow/scripts/codex_hooks.py`
- native launch, worker, and session records written by
  `workflow/scripts/native_launch.py`

## Current Context Model

When Praxis prepares a fresh worker context, it currently supplies:

- current dispatch
- run metadata from `.praxis/run.json`
- active boundary handoff when one exists

The handoff is the only supported cross-story carry-forward input.
