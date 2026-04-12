# Adapters

Praxis integrates with Claude Code and Codex through repo-scoped harness config
plus thin session-start hooks.

## Adapter Harness

Each adapter declares its runtime surfaces in `.claude/adapter.json` or
`.codex/adapter.json`.

Current harness fields include:

- `instructions_path`
- `project_config_path`
- `hooks_path`
- `agents_path`
- `worker_launch_command`
- `extension_points`
- `compatibility`

`praxis harness show-adapter` and `praxis build-worker-launch` read this config.

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

- the session-start hook calls `workflow/scripts/claude_hooks.py`
- startup records native launch metadata under `.praxis/runtime/`
- resume validates the durable Praxis session cursor before allowing the native
  session to continue
- the hook injects bounded Praxis context into the SessionStart response

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

- the session-start hook calls `workflow/scripts/codex_hooks.py`
- startup records native launch metadata under `.praxis/runtime/`
- resume validates the durable Praxis session cursor before allowing the native
  session to continue
- the hook injects bounded Praxis context into the SessionStart response

## Shared Adapter Behavior

Praxis currently shares these adapter behaviors across Claude and Codex:

- repo-scoped harness config loaded by `workflow/scripts/harness_config.py`
- worker-launch payload generation through `praxis build-worker-launch`
- session-start launch bookkeeping written by `workflow/scripts/native_launch.py`
- provider-native resume bookkeeping written by `workflow/scripts/native_resume.py`
- manual resume safety checks implemented in `workflow/scripts/provider_resume.py`
- fresh worker context rebuilt from dispatch, run metadata, and the active
  boundary handoff only

## Current Boundaries

Current adapter limits and dependencies:

- fresh background worker process creation is not yet fully automated by the
  control plane
- current harness configs still reference `.claude-plugin/` and
  `.codex-plugin/` compatibility surfaces
- those compatibility paths remain a runtime dependency while they are declared
  in adapter config
