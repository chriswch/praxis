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

## Skills

| Skill | Purpose |
| --- | --- |
| `clarifying-intent` | Turn an underspecified request into a Feature Brief or Story-Level Behavioral Spec. |
| `slicing-stories` | Split a Feature Brief into an ordered slice map of thin, vertical stories. |
| `sketching-design` | Produce a lightweight design sketch — change map, pattern match, first test. |
| `driving-tdd` | Drive Red → Green → Refactor cycles, one acceptance criterion at a time. |
| `code-reviewing` | Independent five-layer review (data, special cases, complexity, breaking changes, practicality). |
| `code-improving` | Apply fixes for critical/high/medium review findings. |
| `verifying-and-adapting` | Reconcile spec vs. reality, update the spec, recommend the next action. |
| `clear-writing` | Revise prose for clarity, precision, and concision. Reusable across skills. |

## Skill contract

Every skill follows the same prompt-in / prose-out contract:

- **Input**: pass the prior artifact (brief, spec, sketch, review, etc.) inline in the prompt, or as a path/handle the skill should read.
- **Output**: the artifact is returned inline in the response. The caller decides whether to persist it and where.

There is no enforced artifact layout. Skills focus on what they resolve; the calling agent or user owns input and output handling.

## License

MIT
