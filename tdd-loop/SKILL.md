---
name: tdd-loop
description: Drives the Red → Green → Refactor cycle from a Story-Level Behavioral Spec (and optional design sketch), converting acceptance criteria into failing tests, writing minimum code to pass, and refactoring to let design emerge. Handles the feedback loop back to clarify-intent when implementation reveals spec gaps. Use after clarify-intent or design-sketch when starting implementation. Triggers on "let's code this", "start TDD", "implement this story", "write the tests", "make it work", "next slice", or when a behavioral spec with acceptance criteria is ready and the next step is writing code.
---

# TDD Loop

## Overview

Turn acceptance criteria into working, tested code through strict Red → Green → Refactor cycles. Each cycle converts one acceptance criterion into a failing test, writes the minimum code to pass it, then refactors to let clean design emerge.

This is where the real design happens. The design sketch gave a direction; TDD's refactor step discovers the actual structure.

**Pipeline**: `clarify-intent` [spec] → `design-sketch` [optional] → **`tdd-loop`** [tested code] → feedback back to `clarify-intent` if spec was wrong.

## Input

- **Story-Level Behavioral Spec** (from `clarify-intent`) — required. Provides acceptance criteria in Given/When/Then format.
- **Design Sketch** (from `design-sketch`) — optional. Provides the change map, first test, and approach direction. If absent, derive file locations from codebase exploration.

## Workflow

1. **Triage and set up.**
   - Scale ceremony to task size:
     - **Trivial** (rename, one-liner): Write the test, make it pass, done. Skip the AC checklist and summary.
     - **Small** (1–2 ACs, single file): Full Red → Green → Refactor per AC. Lightweight tracking.
     - **Medium** (3+ ACs, multiple files): Full workflow with AC checklist, feedback log, and session summary.
     - **Large**: Should have been sliced first. Redirect to `agile-story-slicer`.
   - Read the behavioral spec. List every acceptance criterion.
   - If a design sketch exists, read it for the change map and first test.
   - If no sketch, explore the codebase: test framework, file conventions, existing patterns. Just enough to place the first test.
   - Output: **AC checklist**. See `references/templates.md`.

2. **Order the ACs.**
   - Happy path first — the walking skeleton that proves core behavior works.
   - Then error/edge cases — boundaries, invalid inputs, failure modes.
   - Then non-functional constraints — performance, security (if testable).
   - Reorder when one AC's implementation depends on another's code being in place. Note the rationale.
   - If the design sketch suggested a first test, start there.

3. **Red: write one failing test.**
   - Pick the next AC. Write a test that asserts the expected behavior using the project's existing test conventions.
   - Name the test after the behavior: `rejects request without auth token`, not `test_middleware_check`.
   - **Run the test.** Confirm it fails for the right reason — the behavior doesn't exist yet, not a setup error (import error, missing file).
   - If the test passes unexpectedly, the behavior already exists. Mark the AC done, move on.

4. **Green: write the minimum code to pass.**
   - Write the simplest code that makes the failing test pass. Don't generalize yet.
   - **Run the test.** Confirm it passes. **Run the full suite.** Green means the entire suite is green, not just the new test.

5. **Refactor: let design emerge.**
   - Now — and only now — improve the structure: extract duplication, clarify names, align with existing patterns.
   - **Rule of three**: don't extract until you've seen it three times.
   - **Run tests after each change.** Every refactor must keep the suite green.
   - If the sketch's approach doesn't fit what the code is telling you, discard it. The code under tests is the source of truth.

6. **Loop.** Mark the AC done. Return to step 3. Repeat until all ACs are green.

7. **Verify.**
   - **Run the full test suite.**
   - Walk the AC checklist: every criterion maps to at least one test.
   - Check that test names read as documentation.
   - Note any missing coverage — it goes through the feedback loop, not silently into tests.

8. **Feedback loop.**
   - Ambiguous or contradictory AC → pause. Return to `clarify-intent` to update the spec. Resume after.
   - Missing behavior discovered → note it. After existing ACs, return to `clarify-intent` to add the AC.
   - Impossible constraint → flag it. Return to `clarify-intent` to negotiate.
   - Design sketch was wrong → discard or update. Expected and normal.
   - Slice map affected → if implementation reveals that upcoming slices need to be split, merged, reordered, or a new slice is needed, note it for the between-slice checkpoint (step 9).
   - Track discoveries in the **feedback log**. See `references/templates.md`.
   - The spec is a living artifact. Updating it during TDD is the agile feedback loop working correctly.

9. **Between-slice checkpoint** (when working through a slice map).
   - After completing all ACs for a slice, before starting the next one, ask:
     - Did implementation reveal anything that changes the slice map? (new slices, reordering, merging, splitting)
     - Are the remaining slices still the right slices, or has the feature understanding shifted?
     - Is the next slice in the sequence still the right one to pick up?
   - If the slice map needs updating, return to `agile-story-slicer` to revise it before speccing the next slice.
   - If no changes, pick the next slice from the sequence and hand off to `clarify-intent` to produce its Story-Level Behavioral Spec.
   - Skip this step if the current task is a standalone story (no slice map).

## Default Output

- Test files covering every acceptance criterion.
- Source code passing all tests.
- AC checklist showing completion status.
- Feedback log (if any discoveries).
- Session summary (for medium+ tasks). See `references/templates.md`.

## Guardrails

- **Run the tests — every time.** Execute tests at every Red, Green, and Refactor step. Don't just write them. The test runner is the source of truth, not your expectation of what should pass.
- **One AC at a time.** Don't batch. Don't write multiple failing tests before making any green. Fast feedback is the whole point.
- **Minimum to pass.** Resist adding the next feature during Green. That's the next cycle.
- **Refactor means simplify, not abstractify.** Extract a well-named function, not a `BaseFooStrategyFactory`.
- **Test behavior, not implementation.** Don't assert on internal state, private methods, or call counts. If swapping the implementation breaks tests but not behavior, the tests are wrong.
- **Match existing test patterns.** Use the project's framework, assertion style, file layout, and naming.
- **Mock at boundaries only.** Mock external services, databases, network. Not the code under test or its direct collaborators.
- **Green means ALL green.** Never move to the next AC with a failing test in the suite.
- **Names are documentation.** `rejects expired tokens` beats `test_token_validation_3`.
- **No gold-plating.** When all ACs are green and the suite passes, stop. Missing coverage goes through `clarify-intent`, not into speculative tests.
- **Feedback is a feature.** Discovering the spec was wrong is the system working. Surface gaps; don't silently patch around them.

## References

- Templates (AC checklist, feedback log, session summary): `references/templates.md`
- Worked examples: `references/examples.md`
