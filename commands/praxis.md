---
description: Drive the spec-driven + test-driven development workflow for the task below, advancing through each stage with user checkpoints between stages.
---

# Praxis Workflow

This command is the orchestrator of the spec-driven + test-driven development workflow.

## Task

$ARGUMENTS

## Workflow

Execute the pipeline stage by stage. After each stage completes, present its output artifact to the user and confirm before advancing to the next stage.

### Stage 1: Clarify Intent

Invoke the `clarifying-intent` skill with the task above.

- The skill will triage by size (trivial / small / medium / large) and produce the appropriate artifact.
- **Trivial**: state the change, implement it, done — skip the rest of the workflow.
- **Bug fix**: after this stage, skip directly to Stage 4 (driving-tdd).
- **Large feature**: the skill produces a Feature Brief (`.praxis/brief.md`). Proceed to Stage 2.
- **Small/medium story**: the skill produces a Story-Level Spec (`.praxis/spec.md`). Skip to Stage 3.

After the skill finishes, confirm the artifact with the user before continuing.

### Stage 2: Slice Stories (large features only)

Invoke the `slicing-stories` skill using the Feature Brief from Stage 1.

Once the Slice Map is produced, present it to the user. Then begin iterating through slices in order: for each slice, loop back to Stage 1 (`clarifying-intent`) to produce a Story-Level Spec for that slice, then continue through Stages 3–5 for it before moving to the next slice.

### Stage 3: Sketch Design

Invoke the `sketching-design` skill using the Story-Level Spec.

- The skill will triage — it may skip for trivial stories or produce a minimal sketch for small ones.
- Present the Design Sketch (`.praxis/sketch.md`) to the user and confirm before continuing.

### Stage 4: Drive TDD

Invoke the `driving-tdd` skill using the Story-Level Spec (and Design Sketch if produced).

- The skill runs the Red → Green → Refactor cycle for each acceptance criterion.
- If the skill signals a feedback loop (ambiguous AC, missing behavior, spec was wrong), pause and invoke `clarifying-intent` to resolve, then resume TDD.
- When all ACs are green, proceed to Stage 5.

### Stage 5: Verify and Adapt

Invoke the `verifying-and-adapting` skill using the Story-Level Spec and TDD outputs.

Follow the routing decision from the skill:

- **Done**: workflow complete. Report to the user.
- **Next slice**: return to the slice loop in Stage 2 and pick the next slice.
- **Rework**: return to Stage 4 to address gaps.
- **Escalate**: return to Stage 1 at the feature level to rethink.

## Rules

- Every transition between stages is a user checkpoint — present the artifact summary and ask to proceed.
- Respect fast paths: don't force ceremony on trivial or small tasks.
- All artifacts go to `.praxis/` (single-story) or `.praxis/slices/{slice-id}/` (multi-slice) as defined in CLAUDE.md.
- If the user wants to stop or pivot at any checkpoint, respect that immediately.
