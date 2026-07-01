# Praxis

Spec-driven software engineering workflows for Claude Code and Codex, shipped as agent skills.

Praxis is a collection of skills that take a request through clarification, slicing, design, implementation, review, and verification — and one orchestrator entry point (`craft`) that chains them, with a manual mode (default) for stage-by-stage checkpoints and an `--autopilot` mode for end-to-end runs.

## Install

### Claude Code

Add the Praxis plugin from your marketplace, or install the `plugin/` directory as a local plugin. The plugin manifest is at `plugin/.claude-plugin/plugin.json`.

### Codex

Add the Praxis plugin from your marketplace, or install the `plugin/` directory as a local plugin. The plugin manifest is at `plugin/.codex-plugin/plugin.json`.

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
