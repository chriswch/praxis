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
- optional `compatibility`

`praxis harness show-adapter` and `praxis build-worker-launch` read this config.
Praxis validates only the native surfaces referenced by the active adapter
config. Compatibility metadata remains informational.

## Claude

Current Claude surfaces:

- `CLAUDE.md`
- `.claude/adapter.json`
- `.claude/extensions.md`
- `.claude/settings.json`
- `.claude/hooks/session_start.py`
- `.claude/agents/`
- `commands/craft.md`
- `commands/forge.md`

Current behavior:

- the session-start hook calls `src/praxis/runtime/adapters/claude/hooks.py`
- startup records native launch metadata under `.praxis/runtime/`
- startup records the interactive Claude session id as the provider locator
- resume validates the durable Praxis session cursor, resumability, and stored
  provider locator before allowing the native session to continue
- the hook injects bounded Praxis context into the SessionStart response

## Codex

Current Codex surfaces:

- `AGENTS.md`
- `.codex/adapter.json`
- `.codex/extensions.md`
- `.codex/config.toml`
- `.codex/hooks.json`
- `.codex/hooks/session_start.py`
- `.codex/agents/`
- `skills/craft/SKILL.md`
- `skills/forge/SKILL.md`

Current behavior:

- the session-start hook calls `src/praxis/runtime/adapters/codex/hooks.py`
- startup records native launch metadata under `.praxis/runtime/`
- startup records the interactive Codex session id as the provider locator
- resume validates the durable Praxis session cursor, resumability, and stored
  provider locator before allowing the native session to continue
- the hook injects bounded Praxis context into the SessionStart response

## Shared Adapter Behavior

Praxis currently shares these adapter behaviors across Claude and Codex:

- repo-scoped harness config loaded by `src/praxis/runtime/adapters/harness.py`
- worker-launch payload generation through `praxis build-worker-launch`
- fresh background worker launch through
  `python3 -m praxis.runtime.workers.launcher --repo-root .`
- session-start launch bookkeeping written by `src/praxis/runtime/adapters/native_launch.py`
- provider-native resume bookkeeping written by `src/praxis/runtime/adapters/native_resume.py`
- manual resume safety checks implemented in `src/praxis/runtime/adapters/provider_resume.py`
- fresh background launches keep the durable Praxis session cursor separate from
  the provider-issued resume locator
- successful resume updates the stored provider locator without rotating the
  durable Praxis cursor
- the launcher updates launch and session records when the provider later emits
  a real resume locator
- fresh worker context rebuilt from dispatch, run metadata, and the active
  boundary handoff only

## Current Boundaries

Current adapter limits and dependencies:

- `.claude-plugin/` and `.codex-plugin/` remain compatibility mirrors, not
  authoritative runtime surfaces
- native harness loads never require compatibility mirrors at runtime
- worker-launch payloads may preserve compatibility metadata for reporting, but
  runtime validation does not require those files to exist
- the public adapter contract still omits `subagent_worker`
