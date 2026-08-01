---
name: verifying-and-adapting
description: Closes the loop after implementation by checking it holistically against the Story-Level Behavioral Spec — executing each acceptance criterion's observable behavior and citing the evidence, reconciling spec-vs-reality divergences, capturing emerged design knowledge, and recommending the next slice, rework, or done. Use once implementation is complete — canonically after driving-tdd and any review/improve pass — to confirm the build conforms to what was specified before closing out the story.
context: fork
allowed-tools: Read, Grep, Glob, Bash
---

# Verify and Adapt

## Overview

Close out a completed TDD cycle by stepping back from individual tests to check the whole story. Verify that what was built matches what was specified, update the spec where reality diverged, capture what was learned, and recommend the next action — next slice, done, or rework.

This is Scrum's "inspect and adapt" applied at the story level, not the sprint level. It's the hinge between "I finished this slice" and "what do I do next."

**Verification means execution, not reading.** Statically re-reading tests and asserting they "look right" is analysis, not verification — and it is blind to the failure mode this stage exists to catch: an implementation (or its tests) that passes without doing what the spec says. So for every acceptance criterion that names observable behavior — an endpoint, a CLI, a returned value, a side effect — actually exercise it and capture the real output. Every verdict must rest on evidence you observed (a command you ran and what it printed), never on the implementer's claim that it works. **Approach each AC adversarially:** your job is to *try to refute* that the spec is met and fail to — not to confirm it.

**Consumes** the spec plus the completed implementation — this runs *after* implementation and after any `code-reviewing`/`code-improving` pass; it is the last gate before Done. **Emits** a verification summary, an optionally updated spec, and a routing recommendation. The orchestrator owns sequencing; this skill just closes out whatever implementation it is handed.

## Input

**Primary (required):**
- **Story-Level Behavioral Spec** — canonically from `clarifying-intent`, or equivalent: any statement of expected behavior. The gate is on having *some* expected-behavior statement to verify against, not on its provenance. If acceptance criteria aren't enumerated, derive them in step 1 from the narrative / PR / issue and record them as assumptions.
- **The implementation** — the code under verification (a path, a diff, or the working tree).
- **Test results** — a way to run the suite (the project's test command) or a report of its current state.

**Optional enrichments (use if provided; reconstruct if absent):**
- **AC Checklist** (canonically from `driving-tdd`) — per-AC completion status. If absent, reconstruct it from the spec's acceptance criteria (step 1 does this).
- **Feedback Log** (canonically from `driving-tdd`) — discoveries made during implementation.
- **Session Summary** (canonically from `driving-tdd`) — design decisions and spec feedback; enriches the "emerged design knowledge" step on medium+ tasks.
- **Improvement Summary** (canonically from `code-improving`) — fixes applied after review; reconciles what changed between implementation and this check.
- **Design Sketch** (canonically from `sketching-design`) — may have been skipped or discarded during TDD.
- **Slice Map** (canonically from `slicing-stories`) — only exists for multi-slice features.
- **Feature Brief** (canonically from `clarifying-intent`) — only for the final slice of a multi-slice feature; step 6's feature-level completion check reads its goal and success criteria. Reconstruct from the slice map's `meta` if absent.

Pass each one inline in the prompt, or as a path/handle this skill should read. The skill runs standalone on the primary inputs alone — the enrichments make it faster and richer, not runnable. Missing enrichments are reconstructed, not a reason to stop.

## Output

Return inline in the response (see `references/templates.md` for the verification summary format):

- **Verification summary** (medium+ tasks).
- **Updated spec** (if any ACs were refined or diverged) — return the revised spec text, and prefix it with a non-ignorable **`SPEC UPDATED — persist the revised spec at its path before the next slice`** line. This skill holds no Write grant; the caller (or `craft`) must overwrite the spec artifact so the next slice doesn't read a stale spec. Spec write-back is mandatory, not optional, whenever an AC was refined or diverged.
- **Slice impact notes** (multi-slice only, when downstream slices are affected).
- **Routing recommendation** — the response always ends with a machine-readable final line an orchestrator branches on (`craft` consumes it — see `craft/references/contracts.md`): `Routing: Done` | `Routing: Next slice: S-<id>` | `Routing: Rework: <gaps>` | `Routing: Escalate: <reason>`. Emit this line even on trivial/small tasks that skip the formal summary.

The caller decides whether to persist the verification summary and updated spec; standalone, offer to save the summary under `.praxis/<slug>/slices/<slice-id>/verification.md` (and the revised spec back over its original path).

## Workflow

1. **Establish the completion baseline and triage.**
   - Confirm the primary inputs: the spec, the implementation, and a way to run the tests. Only these are required.
   - Reconstruct what the optional artifacts would have carried: if no AC checklist was supplied, derive one from the spec's acceptance criteria; if no test results were supplied, run the suite yourself. Missing `driving-tdd` bookkeeping is not a reason to stop.
   - **Completion check (always produce a summary):** run the full suite. Incomplete work is a *finding*, not a refusal — record a red suite in Suite Status, mark any AC with no passing, behavior-matching test as a **Gap** in the acceptance check, and end with `Routing: Rework` naming the specific gaps. Do not refuse to verify TDD-external code (legacy, a colleague's branch, an AI-generated PR) just because it didn't come from `driving-tdd`. The only genuine stop is input that isn't spec-shaped at all — no statement of expected behavior to verify against.
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
   - Write each spec update specifically — which AC, what changed, why. A vague update doesn't survive to the next slice.
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
   - Flag affected slices by ID with a brief note — a named slice, not a general concern. Don't re-plan or re-spec them; that's `clarifying-intent`'s job when the slice is picked up. Just note the impact so the next cycle starts informed.

6. **Recommend next action.**
   - All ACs verified, spec reconciled, no gaps → **Done** (or **Next slice** if slices remain).
   - **Last slice of a multi-slice feature** → before recommending Done, run a feature-level completion check. Re-read the Feature Brief's goal and success criteria. Confirm the end-to-end user flow works across all slices. If a success criterion isn't met, identify what's missing — it may be a new slice (return to `slicing-stories`) or a gap in an existing slice (return to `driving-tdd` for that slice).
   - Spec diverged but implementation is correct → **Update spec** (return the revised text), then done/next.
   - Gaps found (missing behavior, AC not fully covered) → **Rework** — list what's missing, recommend returning to `driving-tdd` for the specific gaps. After rework, return here to re-verify.
   - Feature-level rethink needed (scope was wrong, core assumption invalidated) → **Escalate** — recommend returning to `clarifying-intent` at the feature level, potentially updating the slice map.

## Downstream Handoff

What each routing verdict means for **this skill's deliverables** — the orchestrator owns what happens next (the loop mechanics live in `craft`'s gate definitions, not here):

- **Done** — the verified implementation, the updated spec (if changed, flagged `SPEC UPDATED`), and the passing suite are the deliverables. For the last slice of a multi-slice feature, step 6's feature-level completion check has also confirmed the Feature Brief's success criteria.
- **Next slice** — the same deliverables, plus the emerged design knowledge to carry forward.
- **Rework** — the list of specific gaps is the deliverable; nothing is done yet.
- **Escalate** — the invalidated assumption and why it compounds is the deliverable.

**Feedback loop**: The verification summary is a living artifact. If a later slice reveals a previous verification missed something, update it — accurate records over perfect first passes.

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
