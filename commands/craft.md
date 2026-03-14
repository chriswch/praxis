---
description: Drive the spec-driven + test-driven development workflow for the task below, advancing through each stage with user checkpoints between stages.
allowed-tools: Skill(praxis:clarifying-intent), Skill(praxis:slicing-stories), Skill(praxis:sketching-design), Skill(praxis:driving-tdd), Skill(praxis:verifying-and-adapting), Skill(praxis:linus-style-reviewing)
---

# Craft Workflow

This command orchestrates the spec-driven + test-driven development workflow.

## Task

$ARGUMENTS

## How It Works

The pipeline has five stages. Each non-interactive skill has `context: fork` in its frontmatter, so it automatically runs in an isolated subagent context — codebase exploration, test writing, and reasoning stay out of this conversation. Only `clarifying-intent` runs inline (it needs `AskUserQuestion` for interactive questioning).

Skills communicate through `.praxis/` filesystem artifacts. Each stage reads the previous stage's output and writes its own. The orchestrator presents each artifact to the user between stages.

For multi-slice features, pass the artifact directory as the skill argument (e.g., `.praxis/slices/S-001/`). Skills default to `.praxis/` when no argument is given.

## Workflow

Execute the pipeline stage by stage. After each stage completes, present its output artifact to the user and confirm before advancing.

### Stage 1: Clarify Intent (inline)

Invoke the `clarifying-intent` skill with the task above.

- The skill will triage by size and produce the appropriate artifact.
- **Trivial**: state the change, implement it, done — skip the rest of the workflow.
- **Bug fix**: after this stage, skip directly to Stage 4 (driving-tdd).
- **Large feature**: produces a Feature Brief (`.praxis/brief.md`). Proceed to Stage 2.
- **Small/medium story**: produces a Story-Level Spec (`.praxis/spec.md`). Skip to Stage 3.

After the skill finishes, confirm the artifact with the user before continuing.

### Stage 2: Slice Stories (large features only)

Invoke the `slicing-stories` skill.

When the skill completes:

- If `## Blocking Questions` appears in the output, resolve them with the user using `AskUserQuestion`, then re-invoke the skill.
- Otherwise, read `.praxis/slice-map.json` and present the slice map to the user. Confirm before continuing.

**Slice iteration:** Once confirmed, iterate through slices in sequence order. For each slice:

1. Run Stage 1 (clarifying-intent, inline) to produce a Story-Level Spec at `.praxis/slices/{slice-id}/spec.md`.
2. Continue through Stages 3-5, passing `.praxis/slices/{slice-id}/` as the skill argument.

### Stage 3: Sketch Design

Invoke the `sketching-design` skill, passing the artifact directory as the argument (e.g., `.praxis/slices/S-001/` for multi-slice, or omit for single-story).

When the skill completes:

- If a sketch was produced, read it and present to the user. Confirm before continuing.
- If `SKETCH_SKIPPED` appears in the output, inform the user and proceed directly to Stage 4.
- If `## Spec Issue` appears, resolve it with the user using `AskUserQuestion`, update the spec, then re-invoke the skill.

### Stage 4: Drive TDD

Invoke the `driving-tdd` skill, passing the artifact directory as the argument.

When the skill completes, check the TDD session summary:

- **If `## Feedback` exists**: A spec issue needs resolution. Run `clarifying-intent` inline to resolve it with the user. Update the spec. Then re-invoke `driving-tdd` — it will pick up from the updated spec and the existing test files.
- **If all ACs are green**: Read the TDD session summary and proceed to Stage 5.

### Stage 5: Verify and Adapt

Invoke the `verifying-and-adapting` skill, passing the artifact directory as the argument.

Follow the routing decision in the output:

- **`ROUTING: DONE`**: Workflow complete. Read the verification summary and report to the user.
- **`ROUTING: NEXT_SLICE <slice-id>`**: Return to the slice iteration loop. Run Stage 1 (clarifying-intent, inline) for the indicated slice, then continue through Stages 3-5.
- **`ROUTING: REWORK <description>`**: Return to Stage 4. Re-invoke `driving-tdd` to address the specific gaps identified.
- **`ROUTING: ESCALATE <reason>`**: Return to Stage 1 at the feature level to rethink. May require updating the Feature Brief and Slice Map.

## Rules

- Every transition between stages is a user checkpoint — present the artifact summary and ask to proceed.
- Respect fast paths: don't force ceremony on trivial or small tasks.
- All artifacts go to `.praxis/` (single-story) or `.praxis/slices/{slice-id}/` (multi-slice) as defined in CLAUDE.md.
- If the user wants to stop or pivot at any checkpoint, respect that immediately.
- **Artifact-mediated communication**: Skills read inputs from and write outputs to `.praxis/`. Do not relay artifact content through the orchestrator's context — let skills read the files directly.
- **Feedback proxy**: When a forked skill encounters a spec issue requiring user input, it stops and returns the issue. The orchestrator resolves it by running `clarifying-intent` inline, then re-invokes the forked skill.
