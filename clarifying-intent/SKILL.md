---
name: clarifying-intent
description: Clarifies ambiguous ideas, features, tasks, user stories, or problems by eliciting intent, constraints, unknowns, risks, and success criteria; asks focused questions; then produces a structured Feature Brief or Story-Level Behavioral Spec with testable acceptance criteria. Use when a request is vague or underspecified, when scoping work, when a user says "I have a rough idea", "help me scope this", "what should we build", "spec this out", or before planning and coding.
---

# Clarify Intent

## Overview

Turn an underspecified request into an actionable, shared understanding. Triage by size: large inputs produce a Feature Brief and get split into stories; small inputs produce a Story-Level Behavioral Spec with testable acceptance criteria ready for TDD.

## Workflow

1. Triage: assess input size and route.
   - **Trivial** (< half day, obvious change — typo, rename, config tweak): state the change in one sentence and skip to implementation. No spec needed.
   - **Small** (1–2 days, single behavior): go directly to step 4 → produce a Story-Level Behavioral Spec.
   - **Medium** (3–5 days, a few behaviors): clarify at story level → produce a Story-Level Behavioral Spec.
   - **Large / Epic** (many stories, cross-cutting): clarify at feature level → produce a Feature Brief → split into stories (hand off to `slicing-stories`) → pick one slice → produce a Story-Level Behavioral Spec for that slice.
   - If unclear, default to feature-level and let the clarification reveal the true size.

2. For technical tasks: understand current behavior from the codebase.
   - Before asking clarifying questions, explore the relevant modules to understand how the system works today. The codebase surfaces questions that no amount of asking the requester will reveal.
   - Scope: read only the modules directly touched by the change — enough to verify the spec's description of current behavior and to spot behavioral edge cases.
   - Boundary: you are reading code to ask better questions, not to plan the implementation. Stop when you can describe the current behavior accurately. Mapping code paths to new designs belongs in the downstream design sketch step, not here.
   - Skip this step for non-technical requests (product ideas, writing, data questions).

3. Decide whether clarification is needed.
   - If you can state the goal, deliverable, constraints, and definition of done with high confidence → skip to step 7 (produce spec). No questioning needed.
   - Otherwise → continue to step 4 (reflect back and clarify).

4. Reflect back the current understanding.
   - Restate the request in 1–3 bullets.
   - Call out any assumptions you are currently making.
   - **Separate problem from solution.** If the request arrives with a proposed solution baked in, explicitly restate the underlying problem separately. Ask: "Is the goal [problem], and the proposal is [solution]?" This prevents speccing a solution without validating that it addresses the right problem.

5. Ask a small batch of high-leverage questions.
   - Ask 3–7 questions at a time; wait for answers; iterate.
   - Prioritize blockers (answers that change approach or scope).
   - Offer options when that reduces ambiguity.
   - Decision heuristic for unknowns:
     - **Can't answer by asking?** → Spike (time-boxed throwaway experiment), then resume clarification. Spikes are a first-class tool for de-risking, not a last resort.
     - **Can answer later without blocking the first slice?** → Defer. Note it as a deferrable unknown and move on (Last Responsible Moment).
     - **Blocks the approach or scope?** → Resolve now before continuing.

6. Track unknowns, risks, and decisions.
   - Maintain an explicit list of open questions. Classify each as:
     - **Blocking**: changes approach or scope; must resolve or spike before coding.
     - **Deferrable**: will clarify during implementation; carry it into the spec as an open unknown (Last Responsible Moment — don't force decisions before you need to).
   - Note constraints and decisions as they become clear.

7. Produce the appropriate output.
   - **Feature-level input** → Feature Brief (goals, scope, constraints, success criteria). Then suggest splitting into vertical slices via `slicing-stories`.
   - **Story-level input** → Story-Level Behavioral Spec with Given/When/Then acceptance criteria as the primary artifact. These AC become test cases in the downstream TDD step.
   - While drafting, self-check:
     - Can a developer write failing tests from the acceptance criteria alone?
     - Do ACs cover the happy path and at least one error/edge case? (Add boundary cases when the domain involves limits, thresholds, or ranges.)
     - Are all blocking unknowns resolved or converted to time-boxed spikes?
     - Is scope small enough for one sprint?
   - If any answer is "no", iterate before presenting.

8. Confirm with the requester (Definition of Ready).
   - Present the spec and explicitly ask for confirmation or corrections. This is the single gate — the shared agreement that the story is understood well enough to start work.
   - If the requester flags gaps, iterate (return to step 5 or adjust the spec directly).

9. Downstream handoff.
   - **From Feature Brief** → split into stories via `slicing-stories`, then pick one slice and produce a Story-Level Behavioral Spec.
   - **From Story-Level Behavioral Spec** → proceed to lightweight design sketch (identify which files/modules the change lives in, pick the approach that fits existing patterns), then TDD (Red → Green → Refactor).
   - **Feedback loop**: If implementation reveals the spec was wrong or incomplete, return here and update the spec before continuing. The spec is a living artifact, not a contract.
   - See `references/templates.md` for handoff details per template.

## Fast Paths

Not every task goes through the full pipeline. Match the input type to the shortest path that produces working, tested code.

- **Bug fix**: `clarifying-intent` (reproduce the bug as a Given/When/Then AC) → `driving-tdd` (failing test reproducing the bug → fix → refactor) → done. Skip `sketching-design` and `verifying-and-adapting`.
- **Refactor**: Ensure existing tests pass → refactor → ensure tests still pass. No spec needed. If tests don't exist, write characterization tests first, then refactor.
- **Trivial change** (typo, rename, config tweak): State the change → implement → done. No spec, no sketch, no verification.
- **Small bug with obvious fix**: Write the failing test, fix it, move on. One-sentence spec at most.

The full pipeline (`clarifying-intent` → `slicing-stories` → `sketching-design` → `driving-tdd` → `verifying-and-adapting`) is for medium+ features. Don't run every task through it.

## Default Output

### Feature-level (large input)

Use the **Feature Brief** template from `references/templates.md`:
- Problem/why now, goal & success criteria, scope boundaries, constraints & risks (if surfaced), open questions, downstream handoff (split into stories).

### Story-level (small/medium input)

Use the **Story-Level Behavioral Spec** template from `references/templates.md`:
- Problem (1–2 sentences), acceptance criteria (Given/When/Then — this is the primary artifact), scope boundaries, what must not break, open unknowns, downstream handoff.

For full templates, question sets, and worked examples, read:
- `references/templates.md`
- `references/question-bank.md`
- `references/examples.md`

## Questioning Heuristics

- Ask for concrete examples (inputs/outputs, screenshots/logs, "what would a good result look like?").
- Confirm scope boundaries early (in-scope / out-of-scope).
- Challenge scope: "Can this be split into independently deliverable slices?" / "What's the smallest version that delivers value?"
- Elicit constraints explicitly (time, budget, platform, policies, performance, security/privacy).
- Surface tradeoffs when constraints conflict; propose 2–3 viable options.
- Ask what existing behavior must not break (regression awareness for downstream TDD).
- Stop clarifying when you can write Given/When/Then acceptance criteria covering the happy path and key error cases without guessing, a developer could write failing tests from the spec without asking questions, and all blocking unknowns are resolved or converted to spikes. Continuing beyond this point is waste.

## Splitting Guidance (Feature-Level Only)

When the input is feature-sized, guide toward vertical slices before speccing in detail:
- Split by **user-facing behavior**, not by technical layer.
- Each slice should be independently deliverable and testable.
- For the first slice, prefer a **walking skeleton**: the thinnest possible end-to-end path that proves the integration/architecture works. Subsequent slices add behaviors on top of this skeleton.
- Pick the highest-value or highest-risk slice to spec first (the walking skeleton often is both).
- Hand off to `slicing-stories` for the slice map.

## Guardrails

- Batch questions in groups of 3–7 and iterate; avoid front-loading a long questionnaire.
- Pin down ambiguous terms ("fast", "simple", "secure") by asking what they mean concretely.
- State assumptions explicitly and confirm them; never fill gaps silently.
- Clarify at feature level first, split into slices, then spec one slice at a time — not the entire feature at once.
- The spec is a living artifact, not a contract. When implementation reveals the spec was wrong or incomplete, updating it is expected — that's the agile feedback loop working, not a failure of clarification.
