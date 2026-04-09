---
name: forge
description: Run the fast Praxis implementation workflow with one spec checkpoint and then auto-advance through design, implementation, review, and improvement. Use when the user mentions Praxis forge, `/forge`, or wants faster delivery without writing new tests.
---

# Forge Workflow

Use this as the Codex entry point for Praxis's fast-delivery workflow. It mirrors the Claude `/forge` command, but adapts it into a Codex skill that coordinates the sibling Praxis skills and `.praxis/` artifacts.

## Stage Skills

Load and follow these sibling skills as needed:

- `../clarifying-intent/SKILL.md`
- `../slicing-stories/SKILL.md`
- `../sketching-design/SKILL.md`
- `../rapid-implementing/SKILL.md`
- `../code-reviewing/SKILL.md`
- `../code-improving/SKILL.md`

## Artifact Paths

Use the same artifact layout as the full workflow:

- Single story: `.praxis/spec.md`, `.praxis/sketch.md`, `.praxis/implementation.md`, `.praxis/review.md`, `.praxis/improvement.md`
- Large feature: `.praxis/brief.md`, `.praxis/slice-map.json`, and `.praxis/slices/{slice-id}/...`

## Workflow

1. Clarify intent and confirm the spec.
   - Start with `clarifying-intent`.
   - Respect its triage:
     - Trivial change: implement and stop.
     - Bug fix: skip the design step and move straight to rapid implementation.
     - Large feature: produce `.praxis/brief.md`, then continue to slicing.
     - Small or medium story: produce `.praxis/spec.md`, then continue to design.
   - This is the main human checkpoint. Present the brief or spec and confirm it before continuing.

2. Slice large features, then auto-advance.
   - Use `slicing-stories` when the work is feature-sized.
   - If blocking questions appear, ask the user directly, update the brief, and re-run slicing.
   - Once the slice map is ready, process slices in order. For each slice, run clarification to produce the slice-level spec and confirm it before continuing.

3. Sketch the design.
   - Use `sketching-design` for the current artifact directory.
   - If the sketch is skipped, proceed immediately.
   - If it finds a spec issue, resolve it with the user, update the spec, and run the design step again.

4. Implement rapidly.
   - Use `rapid-implementing`.
   - If it returns feedback about unclear requirements or conflicting behavior, route back through `clarifying-intent`, update the spec, and resume implementation.
   - When the acceptance criteria are implemented, continue automatically.

5. Review and improve.
   - Use `code-reviewing`, then `code-improving`.
   - If the review is skipped, finish the slice or story.
   - If the improvement stage returns feedback, resolve it with the user, update the artifacts, and re-run the improvement step.

6. Complete the workflow.
   - For a single story, report completion using the implementation summary and any remaining low-severity review items.
   - For large features, move directly to the next slice until all slices are complete, then report the final outcome.

## Rules

- Only pause for user input when the workflow genuinely needs confirmation or clarification: after `clarifying-intent`, for blocking questions, or when downstream skills surface feedback that changes scope or behavior.
- Keep the rest of the workflow moving automatically once the spec is accepted.
- Keep the process artifact-driven through `.praxis/`.
- Preserve existing behavior unless the user explicitly asks to change it.
