---
name: verifying-and-adapting
description: Closes the loop after TDD by verifying the implementation holistically against the behavioral spec, reconciling spec-vs-reality divergences, capturing emerged design knowledge, and routing to the next slice or done. Use after driving-tdd completes. Triggers on "verify this", "are we done?", "check against the spec", "close out this story", "what's next?", "wrap up", or when all TDD acceptance criteria are green and the developer needs to confirm completion and decide the next step.
---

# Verify and Adapt

## Overview

Close out a completed TDD cycle by stepping back from individual tests to check the whole story. Verify that what was built matches what was specified, update the spec where reality diverged, capture what was learned, and route to the next action — next slice, done, or rework.

This is Scrum's "inspect and adapt" applied at the story level, not the sprint level. It's the hinge between "I finished this slice" and "what do I do next."

**Pipeline**: `clarifying-intent` → `sketching-design` → `driving-tdd` → **`verifying-and-adapting`** → next slice (back to `clarifying-intent`) or done.

## Input

- **Story-Level Behavioral Spec** (from `clarifying-intent`) — required. The source of truth for what was supposed to be built.
- **AC Checklist** (from `driving-tdd`) — required. Shows completion status of each acceptance criterion.
- **Feedback Log** (from `driving-tdd`) — required, even if empty. Shows discoveries made during implementation.
- **Session Summary** (from `driving-tdd`) — required for medium+ tasks. Shows design decisions and spec feedback.
- **Design Sketch** (from `sketching-design`) — optional. May have been skipped or discarded during TDD.
- **Slice Map** (from `slicing-stories`) — optional. Only exists for multi-slice features.

## Workflow

1. **Validate inputs and triage.**
   - Gather: behavioral spec, AC checklist, feedback log, session summary (if medium+). If any required input is missing or TDD is incomplete (AC checklist has pending items, suite is not green), redirect back to `driving-tdd` to finish first.
   - Scale ceremony to task size:
     - **Trivial** (one AC, one file, obvious change): Skip. TDD passed, suite is green, you're done. No verification artifact needed.
     - **Small** (1–2 ACs, single file): Quick sanity check — re-read the spec, confirm all ACs are covered, note if anything changed. No formal artifact.
     - **Medium** (3+ ACs, multiple files): Full workflow. Produce a verification summary. Update spec if needed.
     - **Large**: You shouldn't be here — should have been sliced. Redirect to `slicing-stories`.

2. **Holistic acceptance check.**
   - Walk through every AC in the *original spec* (not just the test names). For each one:
     - A passing test exists.
     - The test exercises the behavior described in the AC, not just a name match.
     - Edge cases stated in the AC are covered.
   - This catches the gap where tests pass but don't actually test what the AC describes.
   - Check "What Must Not Break" from the spec — confirm no regressions.
   - Run the full test suite one final time. All green.

3. **Reconcile spec vs. reality.**
   - Compare what was built against what the spec said. For each AC, one of:
     - **Match** — implementation matches spec. No action.
     - **Refined** — implementation is faithful but details evolved (e.g., error message wording, specific status codes). Update the spec to match reality.
     - **Diverged** — implementation deviated from spec (e.g., a constraint was impossible, a dependency forced a different approach). Document *why* and update the spec.
   - Pull from driving-tdd's feedback log — discoveries already captured there flow into spec updates here.
   - The updated spec is the source of truth. Tests validate behavior; the spec documents intent. They must agree.

4. **Capture emerged design knowledge.**
   - Pull design decisions from driving-tdd's session summary. Note anything that matters for future slices:
     - New patterns that emerged during refactoring.
     - Codebase conventions discovered (not previously documented).
     - Data structure or API shape decisions that downstream slices should follow.
   - Keep it to a few bullets. This feeds forward, not upward.

5. **Assess downstream impact (multi-slice only).**
   - If a slice map exists, scan remaining slices. For each, one of:
     - **No impact** — most slices, most of the time.
     - **Unblocked** — this slice's completion enables a slice that was previously uncertain.
     - **Simplified** — a discovery means a planned slice is now easier than expected, or can be absorbed into an adjacent slice.
     - **Complicated** — a discovery means a planned slice is harder than expected, needs re-scoping, or needs splitting.
     - **Invalidated** — a discovery means a planned slice is no longer necessary.
   - Flag affected slices with a brief note. Do NOT re-plan or re-spec them — that's `clarifying-intent`'s job when the slice is picked up. Just note the impact so the next cycle starts informed.

6. **Self-check before output.**
   - Every AC has a verdict (Match, Refined, Diverged, or Gap).
   - Every "What Must Not Break" item has a confirmation.
   - Spec updates are specific (which AC, what changed, why) — not vague.
   - Emerged design knowledge is actionable for future slices, not a retrospective narrative.
   - Slice impact notes (if any) name specific slice IDs, not general concerns.

7. **Route.**
   - All ACs verified, spec reconciled, no gaps → **Done** (or **Next slice** if slices remain).
   - **Last slice of a multi-slice feature** → before routing to Done, run a feature-level completion check. Re-read the Feature Brief's goal and success criteria. Confirm the end-to-end user flow works across all slices. If a success criterion isn't met, identify what's missing — it may be a new slice (return to `slicing-stories`) or a gap in an existing slice (return to `driving-tdd` for that slice).
   - Spec diverged but implementation is correct → **Update spec** (do it now, inline), then done/next.
   - Gaps found (missing behavior, AC not fully covered) → **Rework** — log what's missing, return to `driving-tdd` for the specific gaps. After rework, return here to re-verify.
   - Feature-level rethink needed (scope was wrong, core assumption invalidated) → **Escalate** — return to `clarifying-intent` at the feature level, potentially update the slice map.

## Default Output

- **Verification summary** (for medium+ tasks). See `references/templates.md`.
- **Updated spec** (if any ACs were refined or diverged — update inline, don't create a separate document).
- **Slice impact notes** (if multi-slice and any downstream slices are affected).
- **Routing decision** with rationale.

Read `references/templates.md` when producing output.
Read `references/examples.md` for style reference.

## Downstream Handoff

- **Done (single-slice)**: Story is complete. The updated spec (if changed) and test suite are the deliverables.
- **Done (last slice of multi-slice)**: Feature is complete. The Feature Brief's success criteria are met across all slices. All updated slice specs and test suites are the deliverables.
- **Next slice (multi-slice)**: Pick the next slice from the slice map. Return to `clarifying-intent` to produce a Story-Level Behavioral Spec for that slice. Carry forward emerged design knowledge — it informs the next sketch and TDD cycle.
- **Rework**: Return to `driving-tdd` with the specific gaps. After gaps are closed, return here to re-verify. This is a tight inner loop, not a full pipeline restart.
- **Escalate**: Return to `clarifying-intent` at feature or story level. May trigger slice map updates via `slicing-stories`. This is the system catching an incorrect assumption before it compounds.

**Feedback loop**: The verification summary is a living artifact like everything else in this pipeline. If a later slice reveals that a previous verification missed something, update it. The goal is accurate records, not perfect first passes.

## Guardrails

- **Verify behavior, not code.** Check "does this do what the spec said?" not "is this code clean?" Code quality is driving-tdd's refactor step and linus-style-reviewing's job.
- **Update the spec, don't archive it.** The spec is a living artifact. If reality diverged, the spec should reflect reality. Version control has the history.
- **Don't re-plan future slices.** Flag impact, don't redesign. Last Responsible Moment — the next slice gets clarified when it's picked up.
- **Don't add tests here.** If gaps are found, route back to driving-tdd. This step verifies; it doesn't implement.
- **Proportional ceremony.** A 20-minute TDD session doesn't need a 30-minute verification. Scale with complexity.
- **No gold-plating disguised as verification.** "We should also add logging" is a new requirement, not a verification finding. Route it through clarifying-intent.
- **Feedback is forward-looking.** Capture what matters for the next slice, not a retrospective on what went wrong.

## References

- Templates (verification summary, section guide, spec update convention): `references/templates.md`
- Worked examples: `references/examples.md`
