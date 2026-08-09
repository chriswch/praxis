# Praxis

Spec-driven software engineering workflows for Claude Code and Codex, shipped as agent skills.

Praxis is a collection of skills that take a request through clarification, slicing, design, implementation, review, and verification — and one orchestrator entry point (`craft`) that chains them, with a manual mode (default) for stage-by-stage checkpoints and an `--autopilot` mode for end-to-end runs.

## Install

Praxis ships as a git-based plugin marketplace hosted in this repo. Both runtimes install straight from GitHub — marketplace source `chriswch/praxis`, marketplace name `chriswch-atelier`, plugin `praxis`.

### Claude Code

```shell
/plugin marketplace add chriswch/praxis
/plugin install praxis@chriswch-atelier
/reload-plugins
```

Every commit to this repo is published as a new plugin version, so you always track `main`. To receive updates automatically, enable auto-update once (third-party marketplaces have it off by default): run `/plugin`, open the **Marketplaces** tab, select **chriswch-atelier**, and choose **Enable auto-update**. Claude Code then refreshes on startup and prompts you to run `/reload-plugins` when a new version lands. To update on demand instead: `/plugin marketplace update chriswch-atelier`.

### Codex

```shell
codex plugin marketplace add chriswch/praxis
```

Then install `praxis` from the in-session `/plugins` directory and run `/reload-plugins`. Codex has no startup auto-update yet — pull new versions with `codex plugin marketplace upgrade`.

### Local install (development)

Point either runtime at a local checkout instead of the remote, from the repo root:

```shell
# Claude Code
/plugin marketplace add ./
/plugin install praxis@chriswch-atelier

# Codex
codex plugin marketplace add ./
```

The Claude Code plugin manifest is at `plugin/.claude-plugin/plugin.json`; the Codex manifest is at `plugin/.codex-plugin/plugin.json`. Codex reads its marketplace catalog from `.agents/plugins/marketplace.json` (repo root); Claude Code reads `.claude-plugin/marketplace.json`.

## Entry points

`craft` is a single agent skill (`plugin/skills/craft/SKILL.md`) that both runtimes read — there is no separate command file:

- **Claude Code**: invoke as `/praxis:craft`.
- **Codex**: invoke as `$craft` (or via the `/skills` picker).

One skill body orchestrates the same underlying skills across both runtimes.

## Workflow

### Craft

Full TDD pipeline. `/praxis:craft <task>` (Claude Code) or `$craft <task>` (Codex) runs in manual mode with user checkpoints between stages; adding `--autopilot` auto-confirms gates and runs end-to-end, stopping only on hard blockers (worker `## Feedback`, **Open questions** from `clarifying-intent`, `## Spec Issue` from `sketching-design`, or **Rework**/**Escalate** from `verifying-and-adapting`).

```
clarifying-intent → [slicing-stories] → sketching-design → driving-tdd
  → code-reviewing → code-improving → verifying-and-adapting
```

### Defaults worth knowing

- **Critical-path tests.** Praxis covers the happy path plus failures that carry real consequence — money, data integrity, security, silent corruption, or something this codebase has actually gotten wrong. Cases the bar leaves out are recorded rather than dropped, and the ship gate asks which you want covered before the story closes. Opt into broader coverage with a `Test scope: standard` line in your steering artifact (`CLAUDE.md`/`AGENTS.md`).
- **No process identifiers in code.** AC numbers, slice ids, and ticket keys stay in `.praxis/`, commit messages, and the PR description — never in source, tests, test names, or comments, where a reader cannot resolve them. Comments carry only what the code cannot say; conventions live in the steering artifact and change-wide decisions in the PR description.
- **Scope discipline.** A review finding that reaches outside the story's files, or needs infrastructure the repo lacks, is recorded in `.praxis/<slug>/deferred.md` instead of being applied — yours to route to a ticket or a follow-up PR at the ship gate.

## Skills

| Skill | Purpose |
| --- | --- |
| `craft` | Orchestrate the whole pipeline end-to-end — manual checkpoints by default, `--autopilot` for unattended runs. |
| `clarifying-intent` | Turn an underspecified request into a Feature Brief or Story-Level Behavioral Spec. |
| `slicing-stories` | Split a Feature Brief into an ordered slice map of thin, vertical stories. |
| `sketching-design` | Produce a lightweight design sketch — change map, pattern match, first test. |
| `driving-tdd` | Drive Red → Green → Refactor cycles, one acceptance criterion at a time. |
| `code-reviewing` | Independent five-layer review (data, special cases, complexity, breaking changes, practicality). |
| `code-improving` | Apply fixes for critical/high/medium review findings. |
| `verifying-and-adapting` | Reconcile spec vs. reality, update the spec, recommend the next action. |
| `composing-documents` | Shape a document before drafting — pick the genre framework, the structure, and the altitude for the audience. |
| `clear-writing` | Revise prose for clarity, precision, and concision. Reusable across skills. |
| `structuring-decisions` | Drive a consequential decision through framing, diagnosis, options, evidence, and a recorded verdict with tripwires. |

## Skill contract

Every skill follows the same prompt-in / prose-out contract:

- **Input**: pass the prior artifact (brief, spec, sketch, review, etc.) inline in the prompt, or as a path/handle the skill should read.
- **Output**: the artifact is returned inline in the response. The caller decides whether to persist it and where.

There is no enforced artifact layout. Skills focus on what they resolve; the calling agent or user owns input and output handling.

## User profiles (`~/.praxis/`)

Two optional files let you carry standing preferences across every project. Both live in your home directory, not in a repo — they travel with you. Neither is required; each skill states what it falls back to when the file is absent.

| File | Covers | Read by | Fallback when absent |
| --- | --- | --- | --- |
| `~/.praxis/taste.md` | Code and architecture philosophy — the forks that research and project conventions leave open. | `sketching-design`, `code-reviewing` | The plugin's `default-philosophy.md` |
| `~/.praxis/voice.md` | Prose conventions — language, register, terminology. | `composing-documents`, `clear-writing` | The reader's language and the register of the surrounding documents |

The two do not overlap and neither reads the other. A repo can still override both: project conventions in the steering artifact (`.praxis/constitution.md`, `CLAUDE.md`/`AGENTS.md`) outrank `voice.md`, since a document serves the project's readers rather than its author. For `taste.md` the precedence runs the other way — taste wins over project convention, and the departure is flagged and explained rather than applied silently.

To start either file, write it directly; there is no generator. `taste.md` replaces `default-philosophy.md` entirely when present, so copy that file as a starting point if you want to edit rather than begin from scratch.

## License

MIT
