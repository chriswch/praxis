---
name: rapid-implementing
description: Rapidly implements a Story-Level Behavioral Spec (and optional design sketch) by writing production code that addresses each acceptance criterion without writing tests. Use for prototype/MVP mode when speed is prioritized over test coverage. Triggers on "/forge", rapid implementation, or when a spec is ready and the goal is fast code without TDD.
context: fork
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, LSP
---

# Rapid Implementation

## Artifact Directory

If `$ARGUMENTS` is provided, use it as the artifact directory (e.g., `.praxis/slices/S-001/`). Otherwise, default to `.praxis/`.

Read the spec from `{artifact-dir}/spec.md`. Read the sketch (if it exists) from `{artifact-dir}/sketch.md`. Write the implementation summary to `{artifact-dir}/implementation.md`.

## Overview

Turn acceptance criteria into working code — fast. Each AC becomes implemented behavior, following existing codebase patterns, without writing new tests. The goal is a working prototype, not production-hardened code.

The behavioral spec provides the implementation guidance. The design sketch (if present) shows where to put the code. Your job: make each AC real in the simplest way that works.

**Pipeline**: `clarifying-intent` [spec] → `sketching-design` [optional] → **`rapid-implementing`** [working code] → feedback back to `clarifying-intent` if spec was wrong.

## Input

- **Story-Level Behavioral Spec** (from `clarifying-intent`) — required. Provides acceptance criteria in Given/When/Then format.
- **Design Sketch** (from `sketching-design`) — optional. Provides the change map and approach direction. If absent, derive file locations from codebase exploration.

## Workflow

1. **Triage and set up.**
   - Scale ceremony to task size:
     - **Trivial** (rename, one-liner): Make the change, done. Skip the checklist and summary.
     - **Small** (1–2 ACs, single file): Implement each AC. Lightweight tracking.
     - **Medium** (3+ ACs, multiple files): Full workflow with AC checklist, feedback log, and implementation summary.
     - **Large**: Should have been sliced first. Stop and return a message indicating `slicing-stories` should be run first.
   - Read the behavioral spec. List every acceptance criterion.
   - If a design sketch exists, read it for the change map and approach direction.
   - If no sketch, explore the codebase: file conventions, existing patterns. Just enough to place the code.
   - Output: **AC checklist**. See `${CLAUDE_SKILL_DIR}/references/templates.md`.

2. **Order the ACs.**
   - Happy path first — the walking skeleton that proves core behavior works.
   - Then error/edge cases — boundaries, invalid inputs, failure modes.
   - Then non-functional constraints — performance, security.
   - Reorder when one AC's implementation depends on another's code being in place. Note the rationale.
   - If the design sketch suggested a starting point, start there.

3. **Implement each AC.**
   - Pick the next AC. Explore the relevant code to understand the current state.
   - Write the implementation that satisfies the AC's Given/When/Then behavior.
   - Follow existing codebase patterns — naming, structure, error handling, module organization.
   - Run any existing tests after each AC to make sure nothing breaks. Existing tests are a safety net, not a target — don't write new ones, but don't break old ones either.
   - If the behavior already exists, mark the AC done and move on.
   - Mark the AC as Implemented. Move to the next.

4. **Integration check.**
   - After all ACs are implemented, run the full existing test suite. If existing tests break, fix the breakage — the goal is a working prototype, not a broken one.
   - Walk the AC checklist: every criterion is addressed in code.
   - Check that the implementation hangs together as a coherent whole, not just isolated changes.

5. **Feedback loop.**
   - Ambiguous or contradictory AC → document it under a `## Feedback` heading in the implementation summary. Write all progress so far, then **stop and return**. The orchestrator will run `clarifying-intent` to resolve the issue and re-invoke.
   - Missing behavior discovered → note it. After existing ACs, document it under `## Feedback` for the orchestrator to handle.
   - Impossible constraint → flag it under `## Feedback` and stop.
   - Design sketch was wrong → discard or update. Expected and normal. No need to stop for this.
   - Slice map affected → if implementation reveals that upcoming slices need to be split, merged, reordered, or a new slice is needed, note it for the between-slice checkpoint (step 6).
   - Track discoveries in the **feedback log**. See `${CLAUDE_SKILL_DIR}/references/templates.md`.

6. **Between-slice checkpoint** (when working through a slice map).
   - After completing all ACs for a slice, note in your output:
     - Did implementation reveal anything that changes the slice map?
     - Are the remaining slices still the right slices?
     - Is the next slice in the sequence still the right one to pick up?
   - Skip this step if the current task is a standalone story (no slice map).

## Default Output

- Source code implementing every acceptance criterion.
- AC checklist showing completion status.
- Feedback log (if any discoveries).
- Implementation summary (for medium+ tasks). See `${CLAUDE_SKILL_DIR}/references/templates.md`.
- Write AC checklist, feedback log, and implementation summary to `{artifact-dir}/implementation.md`.

## Guardrails

- **Follow existing patterns.** Use the project's naming conventions, module structure, error handling, and coding style. Consistency with the codebase matters more than theoretical best practices.
- **Do not write new tests.** This is prototype mode. Test coverage comes later if the prototype is promoted to production via the full `/craft` workflow.
- **Do not break existing tests.** Run the existing suite after implementation. If something breaks, fix it. A prototype that breaks existing functionality is worse than no prototype.
- **One AC at a time.** Implement in order. Don't jump ahead or batch.
- **Minimum to satisfy.** Implement what the AC asks for. Don't gold-plate, don't add features the spec doesn't mention, don't build abstractions for hypothetical future needs.
- **Feedback is a feature.** Discovering the spec was wrong is the system working. Surface gaps under `## Feedback` and stop; don't silently patch around them.

## References

- Templates (AC checklist, feedback log, implementation summary): `${CLAUDE_SKILL_DIR}/references/templates.md`
