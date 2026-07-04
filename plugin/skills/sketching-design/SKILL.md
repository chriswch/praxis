---
name: sketching-design
description: Produces a lightweight design sketch from a Story-Level Behavioral Spec by locating affected files in the codebase, matching existing patterns, and proposing a single implementation direction — just enough to write the first failing test. Use before TDD when the implementation path is non-obvious, after clarifying-intent or slicing-stories. Triggers on "where do I start?", "which files do I change?", "how should I implement this?", mapping a spec to code, or pre-implementation codebase exploration.
context: fork
allowed-tools: Read, Grep, Glob
---

# Design Sketch

## Overview

Bridge the gap between "what to build" (behavioral spec) and "where to start coding" (first failing test). Explore the codebase, match existing patterns, and propose a direction — not a blueprint. The real design emerges from TDD's refactor step, not from this sketch.

## Input

A **Story-Level Behavioral Spec** — canonically from `clarifying-intent`, but the gate is on the artifact's **shape, not its provenance**: a scoped, single-story problem statement, ideally with Given/When/Then acceptance criteria. Pass it inline in the prompt, or as a path/handle this skill should read.

**Preflight — route on shape:**

1. **Scoped story with acceptance criteria** (G/W/T or equivalent explicit behaviors) → sketch it directly.
2. **Scoped single story, but no acceptance criteria** — a clear one-behavior request that arrived without formal ACs (often via this skill's own triggers: "where do I start?", "which files change?") → do NOT bounce it back. Derive 2–4 implicit acceptance criteria from the request plus what the codebase shows, capture them in the sketch under a **Derived ACs / Assumptions** heading marked "confirm before TDD," and sketch against those. Surfacing the derived ACs is what keeps this honest — the TDD stage (or the user) confirms them before they harden into tests.
3. **Feature-sized, an epic, or too vague to scope a single story** → stop and recommend `clarifying-intent` (and possibly `slicing-stories`) first. Design sketches operate on single stories, never epics.

## Output

Return one of these inline in the response. Each ends with a machine-readable `Status:` line so an orchestrator can route without parsing prose (consumed by `craft` — see `craft/references/contracts.md`):

- A **design sketch** with change map, pattern match, proposed direction, and the first test to write (named with its test layer). Include a **Derived ACs / Assumptions** section when the spec arrived without acceptance criteria (Input preflight branch 2). → `Status: sketch`.
- **Skipped** — when the implementation path is obvious from the spec; state that no sketch is needed and why. → `Status: skipped`.
- **Spec issue** — when codebase exploration reveals the spec's assumptions are wrong; describe the issue under a `## Spec Issue` heading and recommend returning to `clarifying-intent`. → `Status: spec-issue`.

Persistence: the caller decides. When invoked standalone and the sketch is worth keeping, offer to save it under `.praxis/<slug>/slices/<slice-id>/sketch.md` (or `.praxis/<slug>/sketch.md` for a single-story feature); this skill holds no Write grant, so the caller does the writing.

## Workflow

1. **Triage: decide if a sketch is needed.**
   - Read the spec's acceptance criteria. If the implementation path is obvious — you know which file to open and what test to write — skip the sketch and say so.
   - Sizing guide (from `clarifying-intent` triage):
     - **Trivial** (< half day): Skip.
     - **Small** (1–2 days, single behavior): Locate + pattern match only (steps 2–3). Skip step 4 if the direction is obvious from existing patterns.
     - **Medium** (3–5 days, story-level): Full sketch (steps 2–5).
     - **Large/Epic**: Should have been split first. Stop and recommend `slicing-stories`.
   - When in doubt, do the sketch. It's cheap; wrong assumptions during TDD are expensive.

2. **Locate the change.**
   - Explore the codebase to answer:
     - Where does this behavior live? Which files, modules, layers?
     - What's the entry point for the new behavior?
     - What's the blast radius? What existing code paths are touched?
   - Output: a **change map** — a short list of files/modules that will be touched, and why.
   - Scope: read only what's needed to answer these questions. Stop when you can name the files.
   - **Early exit**: If codebase exploration reveals the spec's assumptions are wrong (e.g., the module it describes doesn't exist, the behavior is already implemented differently, or a stated constraint doesn't hold), stop and surface the issue under a `## Spec Issue` heading. Recommend returning to `clarifying-intent`.

3. **Read existing patterns.**
   - If the project has a steering artifact (`.praxis/constitution.md`, `CLAUDE.md`/`AGENTS.md`, or `docs/steering/*` — the caller may pass its path), read it first and treat its conventions as authoritative. Infer from code only for what it doesn't cover; don't re-derive from scratch what the project already documents.
   - Before proposing anything new, answer:
     - How does the codebase already solve similar problems? Find the closest analog.
     - What conventions exist? (naming, file structure, error handling, test organization)
     - What data structures are already in play that this feature should extend rather than duplicate?
   - Output: a **pattern match** — "this is similar to how X works in `file.ts`, so we follow that pattern."
   - This is the anti-over-engineering safeguard. If an existing pattern works, use it. Don't invent a new one.
   - **Deliberate bias, and its escape hatch.** This skill matches existing patterns *first* — not because the codebase is always right, but because consistency beats cleverness for a single story, and TDD's refactor step is where better structure actually emerges. So when an existing pattern is clearly behind current idiom for this language/framework, do **not** redesign it here: note it as a **Risk** (a candidate spike) and hand the call to the caller. Wholesale modernization is its own decision, not a side effect of sketching one story.

4. **Propose a direction.**
   - State **one approach** in 2–5 sentences. Not alternatives — pick one.
   - If the approach involves a data structure change, state it explicitly. (Get the data structures right and the code follows.)
   - Name the **first test to write** — the specific test case derived from the spec's happy-path AC (or a Derived AC from preflight branch 2), including where the test file goes, its **test layer** (unit / integration / contract / e2e), and the boundary it exercises. Naming the layer keeps the handoff to `driving-tdd` lossless: the TDD loop knows what kind of test to open with. Name only the first test's layer — a full per-AC test plan is not this skill's job.
   - Flag **risks** that might force a pivot during TDD. If a risk is high uncertainty, mark it as a **spike** — a time-boxed throwaway experiment to resolve before committing.

5. **Self-check before producing output.**
   - Verify the change map covers every acceptance criterion from the spec (or every Derived AC from preflight branch 2). If an AC can't be addressed from the identified files, the map is incomplete.
   - Verify the first test maps directly to a spec AC (or a documented Derived AC) — not to a silently invented requirement.
   - Confirm the first test names its layer (unit / integration / contract / e2e), and that the layer matches where the behavior actually lives in the change map.
   - Confirm the approach follows an existing codebase pattern. If proposing a new pattern, justify why no existing analog applies.
   - Check for unnecessary abstractions: can this be solved without introducing a new type, interface, or module? If 3 lines of duplicated code are simpler, duplicate.
   - Check for YAGNI violations: remove any part of the sketch designed for a requirement not in the spec.
   - Confirm the sketch is shorter than the spec. If not, compress.

6. **Produce the design sketch.**
   - Use the template from `references/templates.md`.
   - Keep it shorter than the behavioral spec that feeds it. If the sketch is longer, compress or remove sections.

## Guardrails

- **Compass, not blueprint.** Enough direction to write the first failing test. No more.
- **Shorter than the spec.** If the design sketch is longer than the behavioral spec, compress it.
- **One approach, not candidates.** Pick and commit. TDD validates or invalidates.
- **Existing patterns first.** Only propose new patterns when the codebase has no applicable analog.
- **Skippable.** If the spec makes implementation obvious, skip the sketch.
- **Disposable.** TDD's refactor step overrides the sketch when it discovers better structure.
- **Read-only.** This skill explores and proposes; it never writes production code or tests. The sketch *names* the first test — `driving-tdd` *authors* it. Emitting code or test files is not this skill's job.
- **Spikes over speculation.** If uncertain, write throwaway code to learn — don't plan harder.
- **No architecture astronautics.** Don't propose design patterns, class hierarchies, or module structures that aren't directly needed for this one story.
- **Stories only.** Never sketch an epic or feature. If the input is too large, recommend `slicing-stories`.

## References

- Templates (design sketch template): `references/templates.md`
- Worked examples: `references/examples.md`
