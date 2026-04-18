---
name: rapid-implementing
description: Rapidly implements a Story-Level Behavioral Spec (and optional design sketch) by writing production code that addresses each acceptance criterion without writing new tests. Use when speed is prioritized over test-driven verification. Triggers on "/forge", rapid implementation, or when a spec is ready and the goal is fast delivery without TDD.
context: fork
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, LSP
---

# Rapid Implementation

## Overview

Turn acceptance criteria into working code — fast. Each AC becomes implemented behavior, following existing codebase patterns, without writing new tests. The output is production-grade code — same quality standards as `/craft`, just without the test-driven verification loop.

The caller provides the spec (and optional design sketch) as input. The working
artifact is the committed code; the AC checklist, feedback log, and
implementation summary are returned in the response for the caller to handle.

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
   - Read the behavioral spec supplied by the caller. List every acceptance criterion.
   - If the caller supplied a design sketch, use it for the change map and approach direction.
   - If no sketch, explore the codebase: file conventions, existing patterns. Just enough to place the code.
   - Check recent `git log --oneline` for commit message conventions (conventional commits, prefix style, etc.).
   - Output: **AC checklist**. See `references/templates.md`.

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
   - Stage the files changed for this AC and commit. Commit message: describe the behavior, imperative mood, following the project's commit conventions. `Reject requests without auth token` — not `Implement AC-3`.
   - Mark the AC as Implemented. Move to the next.

4. **Integration check.**
   - After all ACs are implemented, run the full existing test suite. If existing tests break, fix the breakage — production-grade means nothing breaks.
   - Walk the AC checklist: every criterion is addressed in code.
   - Check that the implementation hangs together as a coherent whole, not just isolated changes.
   - Verify all changes are committed: `git status` should show no uncommitted implementation files. If anything was missed, stage and commit it.

5. **Feedback loop.**
   - Ambiguous or contradictory AC -> document it under a `## Feedback` heading in the response, then stop. The orchestrator will run `clarifying-intent` to resolve the issue and re-invoke.
   - Missing behavior discovered -> note it. After existing ACs, document it under `## Feedback` for the orchestrator to handle.
   - Impossible constraint -> flag it under `## Feedback` and stop.
   - Design sketch was wrong → discard or update. Expected and normal. No need to stop for this.
   - Slice map affected → if implementation reveals that upcoming slices need to be split, merged, reordered, or a new slice is needed, note it for the between-slice checkpoint (step 6).
   - Track discoveries in the **feedback log**. See `references/templates.md`.

6. **Between-slice checkpoint** (when working through a slice map).
   - After completing all ACs for a slice, note in your output:
     - Did implementation reveal anything that changes the slice map?
     - Are the remaining slices still the right slices?
     - Is the next slice in the sequence still the right one to pick up?
   - Skip this step if the current task is a standalone story (no slice map).

## Default Output

- Source code implementing every acceptance criterion.
- AC checklist showing completion status — returned in the response.
- Feedback log — returned in the response (if any discoveries).
- Implementation summary (for medium+ tasks) — returned in the response. See `references/templates.md`.

## Guardrails

- **Follow existing patterns.** Use the project's naming conventions, module structure, error handling, and coding style. Consistency with the codebase matters more than theoretical best practices.
- **Do not write new tests.** Speed over verification. Test coverage can be added later via `/craft` if needed.
- **Do not break existing tests.** Run the existing suite after implementation. If something breaks, fix it. Production-grade code does not break existing functionality.
- **One AC at a time.** Implement in order. Don't jump ahead or batch.
- **Minimum to satisfy.** Implement what the AC asks for. Don't gold-plate, don't add features the spec doesn't mention, don't build abstractions for hypothetical future needs.
- **Commit per AC.** Each implemented AC gets its own commit. The reviewer sees a progression where each commit adds one behavior. Don't batch multiple ACs into one commit.
- **Feedback is a feature.** Discovering the spec was wrong is the system
  working. Surface gaps under `## Feedback` and stop; don't silently patch
  around them.

## References

- Templates (AC checklist, feedback log, implementation summary): `references/templates.md`
