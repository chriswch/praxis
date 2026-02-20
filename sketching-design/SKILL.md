---
name: sketching-design
description: Produces a lightweight design sketch from a Story-Level Behavioral Spec by locating affected files in the codebase, matching existing patterns, and proposing a single implementation direction — just enough to write the first failing test. Use before TDD when the implementation path is non-obvious, after clarifying-intent or slicing-stories. Triggers on: "where do I start?", "which files do I change?", "how should I implement this?", mapping a spec to code, or pre-implementation codebase exploration.
---

# Design Sketch

## Overview

Bridge the gap between "what to build" (behavioral spec) and "where to start coding" (first failing test). Explore the codebase, match existing patterns, and propose a direction — not a blueprint. The real design emerges from TDD's refactor step, not from this sketch.

## Input

A **Story-Level Behavioral Spec** (from `clarifying-intent`) or equivalent: a scoped problem statement with Given/When/Then acceptance criteria.

If the input is vague, underspecified, or feature-sized, redirect to `clarifying-intent` first. Design sketches operate on single stories, never epics.

## Workflow

1. **Triage: decide if a sketch is needed.**
   - Read the spec's acceptance criteria. If the implementation path is obvious — you know which file to open and what test to write — skip the sketch and go directly to TDD.
   - Sizing guide (from `clarifying-intent` triage):
     - **Trivial** (< half day): Skip. Go to TDD.
     - **Small** (1–2 days, single behavior): Locate + pattern match only (steps 2–3). Skip step 4 if the direction is obvious from existing patterns.
     - **Medium** (3–5 days, story-level): Full sketch (steps 2–5).
     - **Large/Epic**: Should have been split first. Redirect to `slicing-stories`.
   - When in doubt, do the sketch. It's cheap; wrong assumptions during TDD are expensive.

2. **Locate the change.**
   - Explore the codebase to answer:
     - Where does this behavior live? Which files, modules, layers?
     - What's the entry point for the new behavior?
     - What's the blast radius? What existing code paths are touched?
   - Output: a **change map** — a short list of files/modules that will be touched, and why.
   - Scope: read only what's needed to answer these questions. Stop when you can name the files.
   - **Early exit**: If codebase exploration reveals the spec's assumptions are wrong (e.g., the module it describes doesn't exist, the behavior is already implemented differently, or a stated constraint doesn't hold), stop and flag this to the developer before continuing. The spec may need updating before a sketch makes sense.

3. **Read existing patterns.**
   - Before proposing anything new, answer:
     - How does the codebase already solve similar problems? Find the closest analog.
     - What conventions exist? (naming, file structure, error handling, test organization)
     - What data structures are already in play that this feature should extend rather than duplicate?
   - Output: a **pattern match** — "this is similar to how X works in `file.ts`, so we follow that pattern."
   - This is the anti-over-engineering safeguard. If an existing pattern works, use it. Don't invent a new one.

4. **Propose a direction.**
   - State **one approach** in 2–5 sentences. Not alternatives — pick one.
   - If the approach involves a data structure change, state it explicitly. (Get the data structures right and the code follows.)
   - Name the **first test to write** — the specific test case derived from the spec's happy-path AC, including where the test file goes.
   - Flag **risks** that might force a pivot during TDD. If a risk is high uncertainty, mark it as a **spike** — a time-boxed throwaway experiment to resolve before committing.

5. **Self-check before producing output.**
   - Verify the change map covers every acceptance criterion from the spec. If an AC can't be addressed from the identified files, the map is incomplete.
   - Verify the first test maps directly to a spec AC — not to an invented requirement.
   - Confirm the approach follows an existing codebase pattern. If proposing a new pattern, justify why no existing analog applies.
   - Check for unnecessary abstractions: can this be solved without introducing a new type, interface, or module? If 3 lines of duplicated code are simpler, duplicate.
   - Check for YAGNI violations: remove any part of the sketch designed for a requirement not in the spec.
   - Confirm the sketch is shorter than the spec. If not, compress.

6. **Produce the design sketch.**
   - Use the template from `references/templates.md`.
   - Keep it shorter than the behavioral spec that feeds it. If the sketch is longer, compress or remove sections.

7. **Confirm and hand off to TDD.**
   - Present the sketch and ask for a quick confirmation or corrections.
   - Hand off: the developer writes the first failing test from the spec's AC, using the sketch's direction and file locations. Red → Green → Refactor.
   - **Feedback loop**: If TDD reveals the sketch was wrong, update or discard the sketch. The sketch is disposable — follow the code, not the document.

## Default Output

Use the **Design Sketch** template from `references/templates.md`.

- Read `references/templates.md` when producing the output (step 6).
- Read `references/examples.md` for style reference when unsure about output quality or format.

## Guardrails

- **Compass, not blueprint.** Enough direction to write the first failing test. No more.
- **Shorter than the spec.** If the design sketch is longer than the behavioral spec, compress it.
- **One approach, not candidates.** Pick and commit. TDD validates or invalidates.
- **Existing patterns first.** Only propose new patterns when the codebase has no applicable analog.
- **Skippable.** If the spec makes implementation obvious, skip the sketch entirely.
- **Disposable.** TDD's refactor step overrides the sketch when it discovers better structure.
- **Spikes over speculation.** If uncertain, write throwaway code to learn — don't plan harder.
- **No architecture astronautics.** Don't propose design patterns, class hierarchies, or module structures that aren't directly needed for this one story.
- **Stories only.** Never sketch an epic or feature. If the input is too large, redirect to `slicing-stories` first.
