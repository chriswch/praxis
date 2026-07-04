---
name: verifying-and-adapting
description: Closes the loop after TDD by checking the implementation holistically against the Story-Level Behavioral Spec — executing each acceptance criterion's observable behavior and citing the evidence, reconciling spec-vs-reality divergences, capturing emerged design knowledge, and recommending the next slice, rework, or done. Use after driving-tdd, when all acceptance criteria are green and the developer needs to confirm the build conforms to what was specified. Triggers on 'does this match the spec', 'check against the spec', 'close out this story against the spec', 'did we build what was specified', or 'close out this story'.
context: fork
allowed-tools: Read, Grep, Glob, Bash
---

# Verify and Adapt

## Overview

Close out a completed TDD cycle by stepping back from individual tests to check the whole story. Verify that what was built matches what was specified, update the spec where reality diverged, capture what was learned, and recommend the next action — next slice, done, or rework.

This is Scrum's "inspect and adapt" applied at the story level, not the sprint level. It's the hinge between "I finished this slice" and "what do I do next."

**Verification means execution, not reading.** Statically re-reading tests and asserting they "look right" is analysis, not verification — and it is blind to the failure mode this stage exists to catch: an implementation (or its tests) that passes without doing what the spec says. So for every acceptance criterion that names observable behavior — an endpoint, a CLI, a returned value, a side effect — actually exercise it and capture the real output. Every verdict must rest on evidence you observed (a command you ran and what it printed), never on the implementer's claim that it works.

**Pipeline**: `clarifying-intent` → `sketching-design` → `driving-tdd` → **`verifying-and-adapting`** → next slice (back to `clarifying-intent`) or done.

## Input

**Primary (required):**
- **Story-Level Behavioral Spec** (canonically from `clarifying-intent`) — the source of truth for what was supposed to be built.
- **The implementation** — the code under verification (a path, a diff, or the working tree).
- **Test results** — a way to run the suite (the project's test command) or a report of its current state.

**Optional enrichments (use if provided; reconstruct if absent):**
- **AC Checklist** (canonically from `driving-tdd`) — per-AC completion status. If absent, reconstruct it from the spec's acceptance criteria (step 1 does this).
- **Feedback Log** (canonically from `driving-tdd`) — discoveries made during implementation.
- **Session Summary** (canonically from `driving-tdd`) — design decisions and spec feedback; enriches the "emerged design knowledge" step on medium+ tasks.
- **Design Sketch** (canonically from `sketching-design`) — may have been skipped or discarded during TDD.
- **Slice Map** (canonically from `slicing-stories`) — only exists for multi-slice features.

Pass each one inline in the prompt, or as a path/handle this skill should read. The skill runs standalone on the primary inputs alone — the enrichments make it faster and richer, not runnable. Missing enrichments are reconstructed, not a reason to stop.

## Output

Return inline in the response:

- **Verification summary** (medium+ tasks).
- **Updated spec** (if any ACs were refined or diverged) — return the revised spec text.
- **Slice impact notes** (multi-slice only, when downstream slices are affected).
- **Routing recommendation** — one of: done, next slice (which slice), rework (which gaps), or escalate (feature-level rethink). State the recommendation in plain prose.

The caller decides whether to persist the verification summary and updated spec, and where.

## Workflow

1. **Establish the completion baseline and triage.**
   - Confirm the primary inputs: the spec, the implementation, and a way to run the tests. Only these are required.
   - Reconstruct what the optional artifacts would have carried: if no AC checklist was supplied, derive one from the spec's acceptance criteria; if no test results were supplied, run the suite yourself. Missing `driving-tdd` bookkeeping is not a reason to stop.
   - **Completion gate (do not skip):** run the full suite. If the suite is red, or any acceptance criterion in the spec has no passing, behavior-matching test, the work is genuinely incomplete — recommend returning to `driving-tdd` for the specific gaps and stop. Reserve this hard stop for incomplete work (red suite or uncovered ACs), never for merely-absent sibling artifacts.
   - Scale ceremony to task size:
     - **Trivial** (one AC, one file, obvious change): Skip the full artifact. TDD passed, suite is green, you're done. Recommend done.
     - **Small** (1–2 ACs, single file): Quick sanity check — re-read the spec, confirm all ACs are covered, note if anything changed. No formal artifact.
     - **Medium** (3+ ACs, multiple files): Full workflow. Produce a verification summary. Return an updated spec if needed.
     - **Large**: You shouldn't be here — should have been sliced. Stop and recommend `slicing-stories`.

2. **Holistic acceptance check — execute and evidence each AC.**
   - Walk through every AC in the _original spec_ (not just the test names). For each one:
     - A passing test exists.
     - The test exercises the behavior described in the AC, not just a name match.
     - Edge cases stated in the AC are covered.
   - **Exercise the observable behavior, don't just read the test.** For each AC that names something observable — an endpoint, a CLI command, a returned value, a file/DB side effect, a rendered output — run it and capture the actual result. If the spec has an "Observable Signals" section, drive each signal. Record, per AC, the exact command you ran and the verbatim result (status code, printed output, runner summary line). That recorded command→result pair is the AC's **evidence**; a verdict with no evidence is not done.
     - When an AC's behavior genuinely cannot be exercised from here (no runnable entry point, external dependency unavailable), say so explicitly in the evidence cell and fall back to the strongest available check (the covering test's actual output) — do not silently upgrade "test passed" to "behavior verified."
   - This catches the gap where tests pass but don't actually test what the AC describes.
   - Check "What Must Not Break" from the spec — confirm no regressions, citing the check you ran.
   - Run the full test suite one final time. Record the exact command and the runner's verbatim summary line — not "all green."

3. **Reconcile spec vs. reality.**
   - Compare what was built against what the spec said. For each AC, one of:
     - **Match** — implementation matches spec. No action.
     - **Refined** — implementation is faithful but details evolved (e.g., error message wording, specific status codes). Update the spec to match reality.
     - **Diverged** — implementation deviated from spec (e.g., a constraint was impossible, a dependency forced a different approach). Document _why_ and update the spec.
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
   - Every verdict cites the evidence it rests on — the command you ran and its observed output — not a claim that the behavior works. A Match with no evidence is not a Match yet.
   - Every "What Must Not Break" item has a confirmation.
   - Spec updates are specific (which AC, what changed, why) — not vague.
   - Emerged design knowledge is actionable for future slices, not a retrospective narrative.
   - Slice impact notes (if any) name specific slice IDs, not general concerns.

7. **Recommend next action.**
   - All ACs verified, spec reconciled, no gaps → **Done** (or **Next slice** if slices remain).
   - **Last slice of a multi-slice feature** → before recommending Done, run a feature-level completion check. Re-read the Feature Brief's goal and success criteria. Confirm the end-to-end user flow works across all slices. If a success criterion isn't met, identify what's missing — it may be a new slice (return to `slicing-stories`) or a gap in an existing slice (return to `driving-tdd` for that slice).
   - Spec diverged but implementation is correct → **Update spec** (return the revised text), then done/next.
   - Gaps found (missing behavior, AC not fully covered) → **Rework** — list what's missing, recommend returning to `driving-tdd` for the specific gaps. After rework, return here to re-verify.
   - Feature-level rethink needed (scope was wrong, core assumption invalidated) → **Escalate** — recommend returning to `clarifying-intent` at the feature level, potentially updating the slice map.

## Default Output

- **Verification summary** (medium+ tasks). See `references/templates.md`.
- **Updated spec** (if any ACs were refined or diverged) — returned inline.
- **Slice impact notes** (multi-slice only, when any downstream slices are affected).
- **Routing recommendation** with rationale.

## Downstream Handoff

- **Done (single-slice)**: Story is complete. The updated spec (if changed) and test suite are the deliverables.
- **Done (last slice of multi-slice)**: Feature is complete. The Feature Brief's success criteria are met across all slices. All updated slice specs and test suites are the deliverables.
- **Next slice (multi-slice)**: The caller picks the next slice from the slice map and returns to `clarifying-intent` to produce a Story-Level Behavioral Spec for that slice. Carry forward emerged design knowledge — it informs the next sketch and TDD cycle.
- **Rework**: Return to `driving-tdd` with the specific gaps. After gaps are closed, return here to re-verify. This is a tight inner loop, not a full pipeline restart.
- **Escalate**: Return to `clarifying-intent` at feature or story level. May trigger slice map updates via `slicing-stories`. This is the system catching an incorrect assumption before it compounds.

**Feedback loop**: The verification summary is a living artifact like everything else in this pipeline. If a later slice reveals that a previous verification missed something, update it. The goal is accurate records, not perfect first passes.

## Guardrails

- **Verify behavior, not code.** Check "does this do what the spec said?" not "is this code clean?" Code quality is driving-tdd's refactor step and code-reviewing's job.
- **Evidence, not assertion.** Every verdict rests on something you executed and observed — a command and its output, an exercised endpoint/CLI, the runner's actual summary line. "The test passes so it works" is only acceptable when the behavior truly cannot be exercised from here, and you say so. Never restate the implementer's claim as a verification result.
- **Update the spec, don't archive it.** The spec is a living artifact. If reality diverged, the spec should reflect reality. Version control has the history.
- **Don't re-plan future slices.** Flag impact, don't redesign. Last Responsible Moment — the next slice gets clarified when it's picked up.
- **Don't add tests here.** If gaps are found, recommend returning to driving-tdd. This step verifies; it doesn't implement.
- **Proportional ceremony.** A 20-minute TDD session doesn't need a 30-minute verification. Scale with complexity.
- **No gold-plating disguised as verification.** "We should also add logging" is a new requirement, not a verification finding. Recommend running it through clarifying-intent.
- **Feedback is forward-looking.** Capture what matters for the next slice, not a retrospective on what went wrong.

## References

- Templates (verification summary, section guide, spec update convention): `references/templates.md`
- Worked examples: `references/examples.md`
