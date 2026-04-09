---
name: craft
description: Run the full Praxis spec-driven plus test-driven workflow with user checkpoints between stages. Use when the user mentions Praxis craft, `/craft`, or wants clarification, design, TDD, review, improvement, and verification as one guided flow.
---

# Craft Workflow

Use this as the Codex entry point for the full Praxis workflow. It mirrors the Claude `/craft` command, but it is packaged as a Codex skill and relies on the sibling Praxis skills plus `.praxis/` artifacts.

## Stage Skills

Load and follow these sibling skills as needed instead of paraphrasing them from memory:

- `../clarifying-intent/SKILL.md`
- `../slicing-stories/SKILL.md`
- `../sketching-design/SKILL.md`
- `../driving-tdd/SKILL.md`
- `../code-reviewing/SKILL.md`
- `../code-improving/SKILL.md`
- `../verifying-and-adapting/SKILL.md`

## Artifact Paths

Workflow artifacts live under `.praxis/` in the working project:

- Single story: `.praxis/spec.md`, `.praxis/sketch.md`, `.praxis/tdd.md`, `.praxis/review.md`, `.praxis/improvement.md`, `.praxis/verification.md`
- Large features: `.praxis/brief.md`, `.praxis/slice-map.json`, and `.praxis/slices/{slice-id}/...`

Let each stage read existing artifacts directly from disk and write its own output back to `.praxis/`.

## Workflow

1. Clarify intent first.
   - Start with `clarifying-intent`.
   - Respect its triage:
     - Trivial change: state the change, implement it, and stop.
     - Bug fix: skip design and go straight to TDD after clarification.
     - Large feature: produce `.praxis/brief.md`, then continue to slicing.
     - Small or medium story: produce `.praxis/spec.md`, then continue to design.
   - Present the resulting artifact summary to the user and get confirmation before advancing.

2. Slice large features.
   - Use `slicing-stories` after a feature brief is produced.
   - If the slice map reveals blocking questions, ask the user directly, update the brief if needed, and re-run slicing.
   - Once the slice map is ready, present it, confirm the next slice with the user, then process slices in order.
   - For each slice, return to clarification to produce `.praxis/slices/{slice-id}/spec.md` before continuing.

3. Sketch the design.
   - Use `sketching-design` for the current artifact directory.
   - If the skill says the sketch can be skipped, proceed to TDD.
   - If it surfaces a spec issue, resolve it with the user, update the spec, and run the design step again.
   - Present the sketch summary to the user and get confirmation before advancing.

4. Drive TDD.
   - Use `driving-tdd` for the current artifact directory.
   - If it returns feedback about a spec gap or contradiction, route back through `clarifying-intent`, update the spec, and resume TDD.
   - When the acceptance criteria are green, present the TDD session summary and get confirmation before continuing.

5. Review the code.
   - Use `code-reviewing`.
   - If the review is skipped, move directly to verification.
   - Otherwise, present the findings by severity, explain that high-priority issues should be fixed next, and get confirmation before advancing.

6. Improve the change.
   - Use `code-improving`.
   - If it returns feedback, resolve the spec or implementation issue with the user, update the artifacts, and re-run the improvement step.
   - Present the improvement summary and get confirmation before moving on.

7. Verify and adapt.
   - Use `verifying-and-adapting`.
   - Follow its routing output:
     - `DONE`: report the verification summary and finish.
     - `NEXT_SLICE <slice-id>`: move to the next slice and continue.
     - `REWORK <description>`: return to TDD for the same slice or story.
     - `ESCALATE <reason>`: return to feature-level clarification and rethink scope.

## Rules

- Treat every stage transition as a user checkpoint unless the task was triaged into a fast path.
- Keep communication artifact-driven: read from `.praxis/`, write back to `.praxis/`, and avoid copying full artifacts into the chat unless needed.
- Respect proportional ceremony. Do not force every task through the full pipeline if the earlier skills classify it as trivial, bug-fix-sized, or otherwise smaller.
- Preserve existing behavior unless the user explicitly asks to change it.
