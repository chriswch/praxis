# Adapters

Praxis integrates with Claude Code and Codex through repo-scoped harness config
plus an adapter-owned runtime contract.

## Adapter Harness

Each adapter declares its repo-scoped native surfaces in `.claude/adapter.json`
or `.codex/adapter.json`.

Current harness fields include:

- `instructions_path`
- `project_config_path`
- `hooks_path`
- `agents_path`
- `worker_launch_command`
- `extension_points`
- optional `compatibility`

`praxis harness show-adapter` and `praxis build-worker-launch` read this
config. Praxis validates only the native surfaces referenced by the active
adapter config. Compatibility metadata remains informational.

## Shared Adapter Contract

`src/praxis/runtime/adapters/runtime_contract.py` defines the shipped adapter
surface used by the shared runtime.

Current adapter responsibilities:

- build the native launch command for a bounded worker payload
- probe provider-native resume capability
- run the provider-native resume command
- report provider CLI health for status and doctor
- attempt adapter-native cancellation and return a durable result shape

Shared runtime callers resolve adapters through `get_adapter_runtime(adapter)`
instead of branching on provider names in launcher, resume, doctor, or cancel
code.

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

Current runtime behavior:

- the session-start hook calls `src/praxis/runtime/adapters/claude/hooks.py`
- `src/praxis/runtime/adapters/claude/adapter_runtime.py` owns launch-command
  construction, headless-resume capability probing, resume command execution,
  and provider status checks
- startup records native launch metadata under `.praxis/runtime/`
- startup records the interactive Claude session id as the provider locator
- resume validates the durable Praxis session cursor, resumability, and stored
  provider locator before allowing the native session to continue
- autopilot doctor/status checks warn when the installed Claude CLI lacks
  headless-resume support

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

Current runtime behavior:

- the session-start hook calls `src/praxis/runtime/adapters/codex/hooks.py`
- `src/praxis/runtime/adapters/codex/adapter_runtime.py` owns launch-command
  construction, resume capability, resume command execution, and provider
  status checks
- startup records native launch metadata under `.praxis/runtime/`
- startup records the interactive Codex session id as the provider locator
- resume validates the durable Praxis session cursor, resumability, and stored
  provider locator before allowing the native session to continue
- launch-command construction honors the bounded filesystem sandbox requested by
  the compiled payload

## Shared Adapter Behavior

Praxis currently shares these adapter behaviors across Claude and Codex:

- repo-scoped harness config loaded by `src/praxis/runtime/adapters/harness.py`
- worker-launch payload generation through `praxis build-worker-launch`
- fresh background worker launch through
  `python3 -m praxis.runtime.workers.launcher --repo-root .`
- session-start launch bookkeeping written by
  `src/praxis/runtime/adapters/native_launch.py`
- provider-native resume bookkeeping written by
  `src/praxis/runtime/adapters/native_resume.py`
- manual resume safety checks implemented in
  `src/praxis/runtime/adapters/provider_resume.py`
- fresh background launches keep the durable Praxis session cursor separate from
  the provider-issued resume locator
- successful resume updates the stored provider locator without rotating the
  durable Praxis cursor
- fresh worker context rebuilt from dispatch, run metadata, artifact inputs,
  and the active boundary handoff only
- sidecar `subagent_worker` launches use the same adapter runtime contract as
  owner workers while remaining explicitly non-owning

## Current Boundaries

Current adapter limits and dependencies:

- `.claude-plugin/` and `.codex-plugin/` remain compatibility mirrors, not
  authoritative runtime surfaces
- native harness loads never require compatibility mirrors at runtime
- worker-launch payloads may preserve compatibility metadata for reporting, but
  runtime validation does not require those files to exist
- adapters currently return `native_cancel_unsupported` for bounded worker
  sessions, so Praxis records the native attempt and then falls back locally
- provider transcripts remain outside the Praxis runtime contract
