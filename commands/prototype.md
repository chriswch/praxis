---
description: Drive a rapid prototype/MVP workflow — full interactive clarification, then auto-advance through design and implementation without tests or human checkpoints.
allowed-tools: Skill(praxis:clarifying-intent), Skill(praxis:slicing-stories), Skill(praxis:sketching-design), Skill(praxis:rapid-implementing)
---

# Prototype Workflow

This command orchestrates the rapid prototype/MVP workflow. Same spec-driven clarification as `/praxis`, but after requirements are locked, it auto-advances through design and implementation without pausing for human checkpoints and without writing tests.

## Task

$ARGUMENTS

## How It Works

The pipeline has three core stages (four for large features). Non-interactive skills have `context: fork` and run in isolated subagent contexts. Only `clarifying-intent` runs inline (it needs `AskUserQuestion` for interactive questioning).

Skills communicate through `.praxis/` filesystem artifacts — same paths as the full `/praxis` workflow. After `clarifying-intent` finishes, the remaining stages auto-advance without user confirmation.

For multi-slice features, pass the artifact directory as the skill argument (e.g., `.praxis/slices/S-001/`). Skills default to `.praxis/` when no argument is given.

## Workflow

### Stage 1: Clarify Intent (inline, interactive)

Invoke the `clarifying-intent` skill with the task above.

- The skill will triage by size and produce the appropriate artifact.
- **Trivial**: state the change, implement it, done — skip the rest of the workflow.
- **Bug fix**: after this stage, skip directly to Stage 4 (rapid-implementing). No design sketch needed.
- **Large feature**: produces a Feature Brief (`.praxis/brief.md`). Proceed to Stage 2.
- **Small/medium story**: produces a Story-Level Spec (`.praxis/spec.md`). Skip to Stage 3.

After the skill finishes, confirm the artifact with the user before continuing. This is the one human checkpoint in the prototype workflow — the spec must be right before auto-advancing.

### Stage 2: Slice Stories (large features only, auto-advance)

Invoke the `slicing-stories` skill.

When the skill completes:

- If `## Blocking Questions` appears in the output, resolve them with the user using `AskUserQuestion`, then re-invoke the skill.
- Otherwise, auto-advance into slice iteration. Do not pause for slice map confirmation.

**Slice iteration:** Iterate through slices in sequence order. For each slice:

1. Run Stage 1 (clarifying-intent, inline) to produce a Story-Level Spec at `.praxis/slices/{slice-id}/spec.md`. Confirm the spec with the user before continuing.
2. Auto-advance through Stages 3–4, passing `.praxis/slices/{slice-id}/` as the skill argument.

### Stage 3: Sketch Design (auto-advance)

Invoke the `sketching-design` skill, passing the artifact directory as the argument (e.g., `.praxis/slices/S-001/` for multi-slice, or omit for single-story).

When the skill completes:

- If `SKETCH_SKIPPED` appears in the output, proceed directly to Stage 4.
- If `## Spec Issue` appears, resolve it with the user using `AskUserQuestion`, update the spec, then re-invoke the skill.
- Otherwise, auto-advance to Stage 4. Do not pause for sketch confirmation.

### Stage 4: Rapid Implementation (auto-advance)

Invoke the `rapid-implementing` skill, passing the artifact directory as the argument.

When the skill completes:

- **If `## Feedback` exists**: A spec issue needs resolution. Run `clarifying-intent` inline to resolve it with the user. Update the spec. Then re-invoke `rapid-implementing`.
- **If all ACs are implemented**: Done (single story) or move to the next slice (multi-slice).

For multi-slice: after completing a slice, move directly to the next slice's Stage 1. No between-slice verification.

### Completion

When all slices are done (or the single story completes), read the implementation summary from `.praxis/implementation.md` (or the last slice's `implementation.md`) and report completion to the user.

## Rules

- **One human checkpoint**: confirm the spec after `clarifying-intent`. Everything else auto-advances.
- Respect fast paths: don't force ceremony on trivial or small tasks.
- All artifacts go to `.praxis/` (single-story) or `.praxis/slices/{slice-id}/` (multi-slice) as defined in CLAUDE.md.
- **Artifact-mediated communication**: Skills read inputs from and write outputs to `.praxis/`. Do not relay artifact content through the orchestrator's context — let skills read the files directly.
- **Feedback proxy**: When a forked skill encounters a spec issue requiring user input, it stops and returns the issue. The orchestrator resolves it by running `clarifying-intent` inline, then re-invokes the forked skill.
- **Essential interaction only**: The only reasons to pause and ask the user are (1) spec confirmation after `clarifying-intent`, (2) blocking questions from `slicing-stories`, (3) spec issues from `sketching-design`, and (4) feedback from `rapid-implementing`. Everything else proceeds automatically.
