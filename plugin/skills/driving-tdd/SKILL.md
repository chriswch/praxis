---
name: driving-tdd
description: Drives the Red → Green → Refactor cycle once a Story-Level Behavioral Spec with acceptance criteria exists (optionally plus a design sketch), converting each acceptance criterion into a failing test, writing the minimum code to pass, refactoring to let design emerge, and committing each cycle directly to the repository (one commit per acceptance criterion). Handles the feedback loop back to clarifying-intent when implementation reveals spec gaps. Use to start implementation once acceptance criteria are ready. Triggers on 'let's code this', 'start TDD', 'implement this story', 'write the tests', or 'next slice' — only when acceptance criteria are ready; if none exist, route to clarifying-intent first.
context: fork
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, LSP
---

# TDD Loop

## Overview

Turn acceptance criteria into working, tested code through strict Red → Green → Refactor cycles. Each cycle converts one acceptance criterion into a failing test, writes the minimum code to pass it, then refactors to let clean design emerge.

This is where the real design happens. The design sketch gave a direction; TDD's refactor step discovers the actual structure.

**Pipeline**: `clarifying-intent` [spec] → `sketching-design` [optional] → **`driving-tdd`** [tested code] → feedback back to `clarifying-intent` if spec was wrong.

## Input

- **Story-Level Behavioral Spec** — required — canonically from `clarifying-intent`, or **any equivalent user-supplied Given/When/Then acceptance criteria**. The gate is on the artifact's shape (a scoped story with testable ACs), not its provenance: a hand-written AC list is a first-class input, not a reason to route away.
- **Design Sketch** — optional — canonically from `sketching-design`. Provides the change map, first test, and approach direction. If absent, derive file locations from codebase exploration.

Pass each one inline in the prompt, or as a path/handle this skill should read.

## Output

Return inline in the response:

- **AC checklist** showing completion status of each acceptance criterion, including its Red evidence (see step 3).
- **Feedback log** — discoveries made during implementation (gaps, contradictions, slice-map impact).
- **Session summary** (medium+ tasks) — design decisions and notes for downstream stages. Its first line is a machine-readable status an orchestrator branches on (`craft` consumes it — see `craft/references/contracts.md`): `Status: complete` or `Status: blocked: <reason>`.
- If the spec needs revisiting, surface a `## Feedback` section describing the gap (a hard stop for an orchestrator regardless of the Status line).

Test files and source code are committed directly to the repository as part of each Red → Green → Refactor cycle — this skill writes to the working tree and commits. The caller decides whether to also persist the AC checklist, feedback log, and session summary; standalone, offer to save the summary under `.praxis/<slug>/slices/<slice-id>/`.

## Workflow

1. **Triage and set up.**
   - Scale ceremony to task size:
     - **Trivial** (rename, one-liner): Write the test, make it pass, done. Skip the AC checklist and summary.
     - **Small** (1–2 ACs, single file): Full Red → Green → Refactor per AC. Lightweight tracking.
     - **Medium** (3+ ACs, multiple files): Full workflow with AC checklist, feedback log, and session summary.
     - **Large**: Should have been sliced first. Orchestrated: stop and recommend `slicing-stories`. Standalone: split it with the user into story-sized pieces and start with the first — don't drive a whole feature through one TDD session.
   - Read the behavioral spec. List every acceptance criterion.
   - If a design sketch exists, read it for the change map and first test.
   - If no sketch, explore the codebase: test framework, file conventions, existing patterns. Just enough to place the first test.
   - Check recent `git log --oneline` for commit message conventions (conventional commits, prefix style, etc.).
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
   - **Record the Red evidence.** Capture the exact test command you ran and the verbatim failure line(s) into the AC checklist's **Red Evidence** column. This recorded observation is the gate: an AC with no Red evidence may not proceed to Green. (An optional plugin red-gate hook can enforce this mechanically — see Guardrails.)
   - If the test passes unexpectedly, do NOT auto-mark the AC done. A test that is green on first write is a signal it may be too weak (asserting something trivially true), or the behavior may genuinely already exist. Inspect and strengthen it until it actually exercises the AC and is capable of failing. If it then still passes because the behavior really exists, mark the AC done with a note; if it was too weak, you just caught a test-gaming risk — keep the stronger version.

4. **Green: write the minimum code to pass.**
   - Write the simplest code that makes the failing test pass. Don't generalize yet.
   - **Test files are frozen during Green.** Only edit source here. If passing the test seems to require changing the test, that's a signal the test was wrong or the AC is self-contradictory — go back to Red and re-observe, or surface `## Feedback`; never edit the test to fit the implementation.
   - **Run the test.** Confirm it passes. **Run the full suite.** Green means the entire suite is green, not just the new test.

5. **Refactor: let design emerge.**
   - Now — and only now — improve the structure: extract duplication, clarify names, align with existing patterns.
   - **Rule of three**: don't extract until you've seen it three times.
   - **Run tests after each change.** Every refactor must keep the suite green.
   - **Refactor changes structure, not the contract.** Keep each acceptance test's assertions intact. If a refactor seems to require a weakened acceptance test, that is a behavior change or a spec gap — stop and use the feedback loop; don't edit the test to fit.
   - If the sketch's approach doesn't fit what the code is telling you, discard it. The code under tests is the source of truth.

6. **Commit and loop.**
   - Stage the files changed in this cycle (test and source files) and commit. Each commit should leave the full suite green.
   - Commit message: describe the behavior, imperative mood, following the project's commit conventions. `Reject requests without auth token` — not `Add test for AC-3`.
   - If the refactor was substantial (extracted a module, renamed across files), split into two commits: first the test + minimum implementation, then the refactor. Reviewers can verify the refactor changed structure, not behavior.
   - Mark the AC done. Return to step 3. Repeat until all ACs are green.

7. **Verify.**
   - **Run the full test suite.**
   - Walk the AC checklist: every criterion maps to at least one test.
   - Check that test names read as documentation.
   - Note any missing coverage — it goes through the feedback loop, not silently into tests.

8. **Feedback loop.**
   - **Standalone vs orchestrated.** Under an orchestrator, surface `## Feedback` and stop so it can route. Standalone (no orchestrator), when a gap is one you can resolve by asking a single question, ask the user directly, record the answer in the feedback log as a spec refinement, and continue — reserve stopping for gaps that genuinely need re-clarification.
   - Ambiguous or contradictory AC → document it under a `## Feedback` heading, recommend returning to `clarifying-intent` to resolve, then stop.
   - Missing behavior discovered → note it. After existing ACs, document it under `## Feedback` and recommend returning to `clarifying-intent`.
   - Impossible constraint → flag it under `## Feedback` and stop.
   - Design sketch was wrong → discard or update. Expected and normal. No need to stop for this.
   - Slice map affected → if implementation reveals that upcoming slices need to be split, merged, reordered, or a new slice is needed, note it for the between-slice checkpoint (step 9).
   - Track discoveries in the **feedback log**. See `references/templates.md`.
   - The spec is a living artifact. Updating it during TDD is the agile feedback loop working correctly.

9. **Between-slice checkpoint** (when working through a slice map).
   - After completing all ACs for a slice, note in your output:
     - Did implementation reveal anything that changes the slice map? (new slices, reordering, merging, splitting)
     - Are the remaining slices still the right slices, or has the feature understanding shifted?
     - Is the next slice in the sequence still the right one to pick up?
   - The caller reads these notes and decides whether to update the slice map before starting the next slice.
   - Skip this step if the current task is a standalone story (no slice map).

## Default Output

- Test files covering every acceptance criterion (committed).
- Source code passing all tests (committed).
- AC checklist showing completion status (returned inline).
- Feedback log (returned inline; may be empty).
- Session summary (medium+ tasks; returned inline). See `references/templates.md`.

## Guardrails

- **Run the tests — every time.** Execute tests at every Red, Green, and Refactor step. Don't just write them. The test runner is the source of truth, not your expectation of what should pass.
- **The acceptance test is a contract — never weaken it to pass.** Once a test encoding an acceptance criterion is written and confirmed failing for the right reason (Red), do not relax, narrow, or delete it to reach Green or during Refactor. If an AC's test seems impossible or self-contradictory, stop and surface it under `## Feedback` for `clarifying-intent` — never patch the test around the problem. Only the inner unit tests that emerge during a cycle are editable within that cycle. (This is a *mitigation* against a model gaming its own tests — strict prompting, recorded Red evidence, and the Green-phase test freeze; enforced mechanically when the plugin red-gate hook is installed. If live autopilot runs ever show real test-gaming, the escape hatch is to fork the Red phase per-AC into a context that sees only the spec + sketch — inside this one skill, not a separate test-authoring skill.)
- **Red evidence gates Green.** No AC advances to Green without a recorded failing-test observation (the command run + its verbatim failure). This is the load-bearing anti-gaming step; a plugin PreToolUse hook can enforce it by blocking source edits until a failing test is observed for the current AC.
- **One AC at a time.** Don't batch. Don't write multiple failing tests before making any green. Fast feedback is the whole point.
- **Minimum to pass.** Resist adding the next feature during Green. That's the next cycle.
- **Refactor means simplify, not abstractify.** Extract a well-named function, not a `BaseFooStrategyFactory`.
- **Test behavior, not implementation.** Don't assert on internal state, private methods, or call counts. If swapping the implementation breaks tests but not behavior, the tests are wrong.
- **Match existing test patterns.** Use the project's framework, assertion style, file layout, and naming.
- **Mock at boundaries only.** Mock external services, databases, network. Not the code under test or its direct collaborators.
- **Green means ALL green.** Never move to the next AC with a failing test in the suite.
- **Names are documentation.** `rejects expired tokens` beats `test_token_validation_3`.
- **No gold-plating.** When all ACs are green and the suite passes, stop. Missing coverage goes through `clarifying-intent`, not into speculative tests.
- **Commit per AC.** Each Red → Green → Refactor cycle ends with a commit. The reviewer sees a progression where each commit adds one behavior with its test. Don't batch multiple ACs into one commit. Don't commit at Red — a failing test in history breaks bisect and CI.
- **Feedback is a feature.** Discovering the spec was wrong is the system working. Surface gaps under `## Feedback` and recommend returning to `clarifying-intent`; don't silently patch around them.

## References

- Templates (AC checklist, feedback log, session summary): `references/templates.md`
- Worked examples: `references/examples.md`
