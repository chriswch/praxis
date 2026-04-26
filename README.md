# Praxis

Spec-driven software engineering workflows for Claude Code and Codex, shipped as agent skills.

Praxis is a collection of skills that take a request through clarification, slicing, design, implementation, review, and verification — and two orchestrator entry points (`craft` and `forge`) that chain them.

## Install

### Claude Code

Add the Praxis plugin from your marketplace, or install the `plugin/` directory as a local plugin. The plugin manifest is at `plugin/.claude-plugin/plugin.json`.

### Codex

Add the Praxis plugin from your marketplace, or install the `plugin/` directory as a local plugin. The plugin manifest is at `plugin/.codex-plugin/plugin.json`.

## Entry points

- **Claude Code**: `/craft` and `/forge` slash commands (`plugin/commands/craft.md`, `plugin/commands/forge.md`).
- **Codex**: `craft` and `forge` skills (`plugin/skills/craft/SKILL.md`, `plugin/skills/forge/SKILL.md`).

Both entry points orchestrate the same underlying skills.

## Workflows

### Craft

Full TDD pipeline with user checkpoints between stages.

```
clarifying-intent → [slicing-stories] → sketching-design → driving-tdd
  → code-reviewing → code-improving → verifying-and-adapting
```

### Forge

Fast pipeline with one user checkpoint at the spec, then auto-advance.

```
clarifying-intent → [slicing-stories] → sketching-design → rapid-implementing
  → code-reviewing → code-improving
```

## Skills

| Skill | Purpose |
| --- | --- |
| `clarifying-intent` | Turn an underspecified request into a Feature Brief or Story-Level Behavioral Spec. |
| `slicing-stories` | Split a Feature Brief into an ordered slice map of thin, vertical stories. |
| `sketching-design` | Produce a lightweight design sketch — change map, pattern match, first test. |
| `driving-tdd` | Drive Red → Green → Refactor cycles, one acceptance criterion at a time. |
| `rapid-implementing` | Implement each acceptance criterion without writing new tests. |
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
