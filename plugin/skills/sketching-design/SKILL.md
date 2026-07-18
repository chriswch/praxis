---
name: sketching-design
description: Maps a Story-Level Behavioral Spec to a lightweight design sketch — research current (dated) best practice for the stack first, before reading the project's implementation, then locate the affected files, match existing patterns, and blend researched practice, the caller's taste profile, and project consistency into one implementation direction, just enough to write the first failing test. Use before TDD when the path is non-obvious, or to answer "where do I start?", "which files do I change?", "how should I implement this?", "is this the idiomatic / best-practice approach for our stack?", "what architecture fits our scale?", or to map a spec to code. Divergences from project conventions or from researched practice are flagged and explained for the caller, never applied silently. After clarifying-intent or slicing-stories.
context: fork
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch
---

# Design Sketch

## Overview

Bridge the gap between "what to build" (behavioral spec) and "where to start coding" (first failing test). Research current practice for the stack first, then explore the codebase, and blend researched practice, the caller's taste profile, and project consistency into one proposed direction — not a blueprint. The real design emerges from TDD's refactor step, not from this sketch.

## Input

A **Story-Level Behavioral Spec** — canonically from `clarifying-intent`, but the gate is on the artifact's **shape, not its provenance**: a scoped, single-story problem statement, ideally with Given/When/Then acceptance criteria. Pass it inline in the prompt, or as a path/handle this skill should read.

**Optional context** (use if provided; never required): the **steering artifact** path (project conventions); the project **posture** — `mvp` or `production` — which tunes how much design ambition a recommendation should carry (read it from the steering artifact's `Posture:` line if present; otherwise infer it from repo signals — test maturity, CI, release history — and **note the inferred value as an assumption** in the sketch; see `craft/references/contracts.md` → *Project posture*); the **taste profile** path and the **stack profile** path (research cache). When the caller passes no taste/stack-profile paths, locate them yourself at the standard locations: `~/.praxis/taste.md` (else the plugin default `craft/references/default-philosophy.md`) and `.praxis/stack-profile.md`. See `craft/references/contracts.md` → *Implementation-decision flow*.

**Preflight — route on shape:**

1. **Scoped story with acceptance criteria** (G/W/T or equivalent explicit behaviors) → sketch it directly.
2. **Scoped single story, but no acceptance criteria** — a clear one-behavior request that arrived without formal ACs (often via this skill's own triggers: "where do I start?", "which files change?") → do NOT bounce it back. Derive 2–4 implicit acceptance criteria from the request plus what the codebase shows, capture them in the sketch under a **Derived ACs / Assumptions** heading marked "confirm before TDD," and sketch against those. Surfacing the derived ACs is what keeps this honest — the TDD stage (or the user) confirms them before they harden into tests.
3. **Feature-sized, an epic, or too vague to scope a single story** → stop and recommend `clarifying-intent` (and possibly `slicing-stories`) first. Design sketches operate on single stories, never epics.

## Output

Return one of these inline in the response. Each ends with a machine-readable `Status:` line so an orchestrator can route without parsing prose (consumed by `craft` — see `craft/references/contracts.md`):

- A **design sketch** with change map, pattern match, researched modern-practice baseline, proposed direction, and the first test to write (named with its test layer). Include a **Derived ACs / Assumptions** section when the spec arrived without acceptance criteria (Input preflight branch 2). → `Status: sketch`.
- **Skipped** — when the implementation path is obvious from the spec; state that no sketch is needed and why. → `Status: skipped`.
- **Spec issue** — when codebase exploration reveals the spec's assumptions are wrong; describe the issue under a `## Spec Issue` heading and recommend returning to `clarifying-intent`. → `Status: spec-issue`.

Persistence: the caller decides. When invoked standalone and the sketch is worth keeping, offer to save it under `.praxis/<slug>/slices/<slice-id>/sketch.md` (or `.praxis/<slug>/sketch.md` for a single-story feature); this skill holds no Write grant, so the caller does the writing.

## Workflow

1. **Triage: decide if a sketch is needed.**
   - Read the spec's acceptance criteria. If the implementation path is obvious — you know which file to open and what test to write — skip the sketch and say so.
   - Sizing guide — tiers align with `clarifying-intent`'s `Sizing:` vocabulary (`trivial` · `small` · `story` · `feature`):
     - **trivial** (< half day): Skip.
     - **small** (1–2 days, single behavior): Research (step 2 — cache-first; a fresh web pass only on a cache miss) + locate + pattern match (steps 3–4). Skip step 5 if the direction is obvious and agrees with both the researched baseline and existing patterns.
     - **story** (3–5 days, story-level): Full sketch (steps 2–7).
     - **feature / epic**: Should have been split first. Stop and recommend `slicing-stories`.
   - When in doubt, do the sketch. It's cheap; wrong assumptions during TDD are expensive.

2. **Research current practice — before reading the project's implementation.**
   - Identify the stack from its manifest (`package.json`, `pyproject.toml`, …) — language, framework, versions only. Do **not** study implementation patterns yet: researching first is what keeps the baseline unanchored by how the project happens to do it today.
   - Cache-first: read `.praxis/stack-profile.md` (the caller may pass its path). If it's fresh and covers this story's problem, use it and skip fresh research. Refresh triggers: file missing, relevant entry older than ~3 months, stack changed, or the user asked (see `craft/references/contracts.md` → *Stack profile*).
   - When researching fresh: use the available web/doc-lookup tools and date-stamp the findings with their sources; if the runtime provides none, state that the baseline comes from model knowledge, and date it. Scope to this story's problem — a targeted lookup, not a stack survey.
   - Read the **taste profile**: `~/.praxis/taste.md` if present, else the plugin default `craft/references/default-philosophy.md`.
   - Output: a 1–3 line **researched baseline** (what current practice recommends, dated) for the sketch's *Modern Practice* section — plus a **Stack Profile Update** block when fresh research was done (the caller persists it; this skill holds no Write grant).

3. **Locate the change.**
   - Explore the codebase to answer:
     - Where does this behavior live? Which files, modules, layers?
     - What's the entry point for the new behavior?
     - What's the blast radius? What existing code paths are touched?
   - Output: a **change map** — a short list of files/modules that will be touched, and why.
   - Scope: read only what's needed to answer these questions. Stop when you can name the files.
   - **Early exit**: If codebase exploration reveals the spec's assumptions are wrong (e.g., the module it describes doesn't exist, the behavior is already implemented differently, or a stated constraint doesn't hold), stop and surface the issue under a `## Spec Issue` heading. Recommend returning to `clarifying-intent`.

4. **Read existing patterns.**
   - If the project has a steering artifact (`.praxis/constitution.md`, `CLAUDE.md`/`AGENTS.md`, or `docs/steering/*` — the caller may pass its path), read it first and treat its conventions as authoritative. Infer from code only for what it doesn't cover; don't re-derive from scratch what the project already documents.
   - Before proposing anything new, answer:
     - How does the codebase already solve similar problems? Find the closest analog.
     - What conventions exist? (naming, file structure, error handling, test organization)
     - What data structures are already in play that this feature should extend rather than duplicate?
   - Output: a **pattern match** — "this is similar to how X works in `file.ts`, so we follow that pattern."
   - This is the anti-over-engineering safeguard. If an existing pattern works, use it. Don't invent a new one.
   - **Why research came first.** The pattern match is read deliberately *after* the researched baseline exists (step 2), so the existing code informs the blend without anchoring it. When the closest analog is clearly behind the researched baseline, do **not** redesign it here: note it as a **Risk** (a candidate spike) and hand the call to the caller. Wholesale modernization is its own decision, not a side effect of sketching one story.
   - **Decision flow (one-line rule).** Taste profile > project consistency > researched practice; any departure from a project convention or from the researched baseline is flagged *and explained* for the caller — never applied silently; an outdated existing norm is surfaced as a Risk, not auto-corrected. Canonical version: `craft/references/contracts.md` → *Implementation-decision flow*.

5. **Propose a direction.**
   - State **one approach** in 2–5 sentences. Not alternatives — pick one.
   - **Blend the three inputs under the precedence rule** (taste profile > project consistency > researched practice — step 4's one-line rule). When the inputs disagreed, the sketch states which one drove the direction.
   - **Say when you diverge from the research — unprompted.** If the proposed direction differs from what the researched baseline recommends, the sketch must state that divergence and explain why the winning input (taste profile or project consistency) outweighed it at this posture — in the **Divergence & Recommendation** section (see `references/templates.md`). The same duty applies to a departure from a project convention. An unexplained divergence is a defective sketch.
   - If the approach involves a data structure change, state it explicitly. (Get the data structures right and the code follows.)
   - **Tune to the project's posture** (Minimum Viable Architecture). Solve the constraint this story actually has; if a future scaling concern can still be solved later without changing this architecture, defer it and note it as anticipated (not built). At `mvp` posture, defer more and keep it thin; at `production`, the bar for adopting a correctness- or security-relevant idiom now is lower.
   - Name the **first test to write** — the specific test case derived from the spec's happy-path AC (or a Derived AC from preflight branch 2), including where the test file goes, its **test layer** (unit / integration / contract / e2e), and the boundary it exercises. Naming the layer keeps the handoff to `driving-tdd` lossless: the TDD loop knows what kind of test to open with. Name only the first test's layer — a full per-AC test plan is not this skill's job.
   - Flag **risks** that might force a pivot during TDD. If a risk is high uncertainty, mark it as a **spike** — a time-boxed throwaway experiment to resolve before committing.

6. **Self-check before producing output.**
   - Verify the researched baseline is present with its date and source (stack-profile entry or fresh research), and that it was gathered before implementation patterns were read.
   - If the proposed direction departs from the researched baseline or from a project convention, verify the divergence is stated and explained (never silent) in Divergence & Recommendation.
   - Verify the change map covers every acceptance criterion from the spec (or every Derived AC from preflight branch 2). If an AC can't be addressed from the identified files, the map is incomplete.
   - Verify the first test maps directly to a spec AC (or a documented Derived AC) — not to a silently invented requirement.
   - Confirm the first test names its layer (unit / integration / contract / e2e), and that the layer matches where the behavior actually lives in the change map.
   - Confirm the approach follows an existing codebase pattern. If proposing a new pattern, justify why no existing analog applies.
   - Check for unnecessary abstractions: can this be solved without introducing a new type, interface, or module? If 3 lines of duplicated code are simpler, duplicate.
   - Check for YAGNI violations: remove any part of the sketch designed for a requirement not in the spec.
   - Confirm the sketch is shorter than the spec. If not, compress.

7. **Produce the design sketch.**
   - Use the template from `references/templates.md`.
   - Keep it shorter than the behavioral spec that feeds it. If the sketch is longer, compress or remove sections.

## Guardrails

- **Compass, not blueprint.** Enough direction to write the first failing test. No more.
- **Shorter than the spec.** If the design sketch is longer than the behavioral spec, compress it.
- **One approach, not candidates.** Pick and commit. TDD validates or invalidates.
- **Research before anchoring; blend by precedence.** Current practice is researched before the project's implementation is read; the direction blends taste profile > project consistency > researched practice; and every departure from a project convention or from the researched baseline is flagged *and explained* for the caller — never applied silently.
- **Skippable.** If the spec makes implementation obvious, skip the sketch.
- **Disposable.** TDD's refactor step overrides the sketch when it discovers better structure.
- **Read-only.** This skill explores and proposes; it never writes production code or tests. The sketch *names* the first test — `driving-tdd` *authors* it. Emitting code or test files is not this skill's job.
- **Spikes over speculation.** If uncertain, write throwaway code to learn — don't plan harder.
- **No architecture astronautics.** Don't propose design patterns, class hierarchies, or module structures that aren't directly needed for this one story.
- **Stories only.** Never sketch an epic or feature. If the input is too large, recommend `slicing-stories`.

## References

- Templates (design sketch template): `references/templates.md`
- Worked examples: `references/examples.md`
