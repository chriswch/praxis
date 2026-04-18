# Praxis

Spec-driven software engineering workflows for Claude Code and Codex, plus an orchestrator CLI that drives them end to end.

Praxis has two layers:

- **Plugin** — a set of skills (`skills/`) and entry points (`commands/` for Claude, `skills/craft/SKILL.md` for Codex) an agent can run interactively. The plugin delivers a shared workflow — clarify, slice, sketch, implement, review, improve, verify — without depending on the CLI.
- **CLI** — a TypeScript orchestrator at `src/praxis-ts/` that drives the same workflow iteratively across stories, stage by stage. Useful for work too large to finish in one agent session (refactors, multi-slice features, UI-wide changes).

The two layers stay decoupled: the CLI invokes skills through the plugin's slash command, and skills never read CLI state.

## Install & Build

```bash
cd src/praxis-ts
npm install
npm run build
npm test
```

## Plugin Entry Points

- Claude: `/craft` (slash command, see `commands/craft.md`)
- Codex: the `craft` skill at `skills/craft/SKILL.md`

Both invoke the same stage skills: `clarifying-intent`, `slicing-stories`, `sketching-design`, `driving-tdd`, `code-reviewing`, `code-improving`, `verifying-and-adapting`.

## CLI Surface

Public commands:

```bash
praxis run --repo-root . --adapter claude --execution-mode manual \
  --entry-task "Describe the change" --json
praxis continue --repo-root . --json
praxis resume   --repo-root . --json
praxis approve  --repo-root . --note "..." --json
praxis cancel   --repo-root . --note "..."
praxis status   --repo-root . --json
praxis inspect  --repo-root . --json
praxis doctor   --repo-root . --json
```

Internal control-plane commands (used by workers and automation):

- `praxis dispatch`
- `praxis build-worker-launch`
- `praxis submit-stage-result`
- `praxis run-claude-worker`, `praxis run-codex-worker`
- `praxis register-worker-session`
- `praxis converge-run`, `praxis converge-continue`, `praxis converge-resume`, `praxis converge-cancel`, `praxis converge-status`, `praxis converge-inspect`

## Workflow

```text
clarifying-intent -> [slicing-stories] -> sketching-design -> driving-tdd
  -> code-reviewing -> code-improving -> verifying-and-adapting
```

Execution policy is separate from workflow shape:

- `workflow`: `craft`
- `mode`: `single_story` or `multi_slice`
- `run.execution.mode`: `manual` or `autopilot`

## Architecture

- `src/praxis-ts/src/workflows/` — workflow graph and stage artifact contracts.
- `src/praxis-ts/src/contracts/` — machine-readable state, result, handoff, and harness contracts.
- `src/praxis-ts/src/runtime/` — run control plane, dispatch compiler, recovery, worker hosts, and status projection.
- `.praxis/` — runtime state area for run cursors, story ledgers, stage results, dispatch bundles, approvals, policies, launch records, worker and session records, resume records, and traces.
- `.claude-plugin/` — authoritative Claude plugin surfaces (adapter, agents, extension notes).
- `.codex-plugin/` — authoritative Codex plugin surfaces (adapter, agents, config, extension notes).
- `CLAUDE.md` and `AGENTS.md` — repo-level instructions for each runtime.

## How the CLI Calls Skills

The CLI spawns a provider worker (Claude or Codex) and prepends the stage's slash command (for example `/praxis:driving-tdd`). The agent runs the skill, writes a small routing payload to a scratch file, and exits. The CLI then assembles the full stage-result record (filling in run, dispatch, session, and route metadata) and advances the run. Skills therefore stay pure — they emit prose, not CLI state.

## License

MIT
