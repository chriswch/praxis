---
name: clarifying-intent
description: Clarifies a request before implementation by working through two phases — product space (who needs this, why, what success looks like) then system space (where it lands in any existing code, what behavior must not break, what observable signals confirm it works). Produces a Feature Brief (feature-sized input) or Story-Level Behavioral Spec (story-sized input) ready for slicing or implementation. Use whenever a request is vague or underspecified, when scoping new work, when adding features to existing code, before any non-trivial planning or coding, or when a user says "I have a rough idea", "help me scope this", "what should we build", or "spec this out".
allowed-tools: Read, Grep, Glob, AskUserQuestion, Bash(find)
---

# Clarify Intent

## Overview

Take an underspecified request and produce an actionable, shared understanding by working through two internal phases — product space, then system space. Neither phase discusses implementation patterns, abstractions, file layout, or technology choices below top-level system flow. Those belong to `sketching-design` and `driving-tdd` downstream.

- **Phase A — Product Space**: who needs this, why now, what does success look like, what assumptions need validating. No code reading.
- **Phase B — System Space**: where this behavior lands in any existing system, what current behavior must not break, what observable signals confirm it works. Code is read only to confirm current system behavior — never to evaluate patterns, abstractions, or file layout.

The phases are sequential. Phase B always runs, but adapts its workload — minimal for greenfield work, substantial for changes to a mature codebase. The reason Phase B always runs even on greenfield: there is almost always *some* system context worth naming (target runtime, deployment shape, observable signals), and forcing the question prevents specs that look complete on paper but have no anchor to a running system.

## Input

The request to clarify, plus any prior context (a Feature Brief, a story-boundary handoff from a previous slice, an earlier spec). Pass it inline in the prompt, or as a path/handle this skill should read.

When a prior story-boundary handoff is supplied, treat it as bounded seed for the new story. Do not let the handoff widen scope — it informs the next clarification pass; it does not replace the new request.

## Output

Return one of these inline in the response:

- **Trivial change**: a one-sentence statement of the change. No spec needed, no phases.
- **Feature Brief**: when the input is feature-sized. Hand off to `slicing-stories` next; Phase B runs per-slice in subsequent invocations.
- **Story-Level Behavioral Spec**: when the input is story-sized (or for a single slice). Ready for `sketching-design` and TDD.
- **Open questions**: when blocking unknowns remain — list them, ask the user, and stop.

The caller decides whether to persist the artifact and where.

## Workflow

### 1. Triage and route

Decide what kind of input you have. If unclear, default to feature-sized and let Phase A reveal the true size.

- **Trivial** (< half day, obvious change — typo, rename, config tweak): state the change in one sentence and stop. Skip both phases.
- **Story-sized** (1–5 days, single user-facing behavior, or a slice from an upstream Feature Brief): run both phases. Phase A may be brief if a clear user story is already supplied; Phase B does the bulk.
- **Feature-sized / Epic** (many stories, cross-cutting): run Phase A fully, produce a Feature Brief, recommend `slicing-stories`, and stop. Phase B runs per-slice on subsequent invocations.

### 2. Phase A — Product Space

Goal: shared understanding of who needs this, why now, and what success looks like — without touching code.

**Boundary**: do not read code in this phase. Do not propose technical solutions. Code-shaped questions ("where does this fit?", "what breaks?") belong to Phase B.

Steps:

a. **Distill Background.** If the request includes background context — current state, pain points, considered options, stakeholders — structure these explicitly before asking new questions. This prevents losing context the requester already shared and prevents asking questions they have already answered.

b. **Reflect back and separate problem from solution.** Restate the request in 1–3 bullets, calling out assumptions. If the request arrives with a proposed solution baked in, restate the underlying problem separately and confirm: "Is the goal [problem], and the proposal is [solution]?" This prevents speccing a solution without validating the right problem.

c. **Ask Phase A questions in small batches.** Pull from the Phase A section of `references/question-bank.md`. Ask 3–7 high-leverage questions at a time; wait for answers; iterate. Front-loading a long questionnaire wastes time.

   Decision heuristic for unknowns:
   - **Can't be answered by asking?** → Spike (time-boxed throwaway experiment). Resume after.
   - **Can be answered later without blocking the first slice?** → Defer (Last Responsible Moment).
   - **Blocks scope or approach?** → Resolve now.

d. **Track unknowns and decisions.** Maintain an explicit list of open questions, classified Blocking or Deferrable. Note product decisions with rationale as they emerge — this is what makes a spec readable months later.

e. **Stop Phase A when** you can name who this is for, why now, and what done looks like; you have an explicit hypothesis and validation plan for the highest-risk assumptions; and all blocking unknowns are either resolved or converted to time-boxed spikes.

f. **Manual mode checkpoint.** In manual mode (the default), present the Phase A artifact (Feature Brief or the product-space portion of the Story Spec) and ask for confirmation. Use `AskUserQuestion` when available. In autopilot mode, skip this checkpoint.

If the input triages as Feature-sized, stop here with a Feature Brief and recommend `slicing-stories`. Phase B will run on each slice.

### 3. Phase B — System Space

Goal: shared understanding of where this behavior lands in the running system, what current behavior must not break, and what observable signals confirm it works — without naming implementation patterns, abstractions, or file layout.

**Boundary**: read code only to confirm current system behavior. The output of this phase describes **what** the system does and must do, not **how** it does it. If you find yourself naming files, suggesting patterns, comparing abstractions, or sketching architecture, you have crossed into `sketching-design` territory — stop and produce the spec instead.

This phase always runs. The workload scales with the existing context — see "Phase B Workload Scaling" below.

Steps:

a. **Map system context.** From Phase A, list the user-facing flows this change participates in. For each, identify the system actors involved (services, components, data stores) at the top-level system flow level only.

b. **Confirm current system behavior** (if a system exists). Read the modules directly touched by the change, just enough to describe what they currently do in behavioral terms — inputs, outputs, side effects, dependencies on other subsystems. Stop reading when you can describe the current behavior accurately. Do not map code paths to designs.

   If exploration reveals a Phase A assumption is wrong (the named module does not exist, the behavior is already different, a stated constraint does not hold), surface this back to the user before continuing.

c. **Ask Phase B questions.** Pull from the Phase B section of `references/question-bank.md`. Focus on integration boundaries, regression risk, observable signals, and system-level acceptance.

d. **Draft the Story-Level Behavioral Spec.** Use the template in `references/templates.md`. Fill in Acceptance Criteria (Given/When/Then), Observable Signals, What Must Not Break, and any system-space Decisions & Rationale.

e. **Self-check before presenting:**
   - Can a developer write failing tests from the acceptance criteria alone?
   - Do ACs cover the happy path and at least one error/edge case? (Add boundary cases when the domain involves limits, thresholds, or ranges.)
   - Are observable signals concrete enough that someone running the code could verify them?
   - Are regression boundaries explicit?

   If any answer is "no", iterate before presenting.

f. **Manual mode checkpoint.** Present the spec and ask for confirmation. In autopilot mode, skip.

### 4. Downstream handoff

- **From Feature Brief** → recommend `slicing-stories`, then re-invoke this skill per slice.
- **From Story-Level Behavioral Spec** → recommend `sketching-design` (if the implementation path is non-obvious) then `driving-tdd`. Acceptance criteria become test cases.
- **Feedback loop**: if implementation reveals the spec was wrong or incomplete, return here and update before continuing. The spec is a living artifact, not a contract — that is the feedback loop working, not a failure of clarification.

## Phase B Workload Scaling

Phase B always runs; how much it does depends on what already exists. Quick read-offs:

| Context | Phase B work |
| --- | --- |
| Brand new repo, first slice | Confirm runtime / deployment target. Name observable signals. No code reading. |
| Existing repo, isolated new feature | Read the module(s) the new behavior interacts with. Describe current behavior; list integration points. |
| Existing repo, change to a core flow | Same plus read callers. Map regression boundaries carefully. |
| Existing repo, cross-cutting change | Same plus surface related subsystems whose behavior depends on the changed surface. |

If Phase B truly has nothing to do, say so explicitly and move on. Do not manufacture work — but do not skip the question of observable signals either, since "how would you tell this works at runtime?" is valuable on every change.

## Mode Gates

- **Manual mode (default)**: ask for confirmation at the end of Phase A and at the end of Phase B. Present the artifact and the choices.
- **Autopilot mode**: no checkpoints. Proceed straight through. The only stop conditions are Open Questions (blocking unknowns) and Spec Issues (Phase B finds a Phase A assumption is wrong).

## Fast Paths

Not every task goes through both phases at full depth. Match the input type to the shortest path:

- **Bug fix**: triage → quick Phase A (reproduce the bug as a Given/When/Then) → Phase B (where in the system, what regression risk) → done. Often very short.
- **Pure refactor**: no spec needed. Ensure existing tests pass → refactor → ensure tests still pass. If tests don't exist, write characterization tests first.
- **Trivial change**: triage step alone produces a one-sentence statement. No phases.

The full pipeline (`clarifying-intent` → `slicing-stories` → `sketching-design` → `driving-tdd` → `verifying-and-adapting`) is for medium+ features. Don't force every task through it.

## Splitting Guidance (Feature-Sized Only)

When the input is feature-sized, guide toward vertical slices before speccing in detail:

- Split by **user-facing behavior**, not technical layer.
- Each slice should be independently deliverable, testable, and valuable to a real user (INVEST). Litmus test: "If we shipped this slice and stopped, would at least one real user get value from it?"
- For the first slice, prefer a **walking skeleton** — the thinnest end-to-end path with real dependencies. The skeleton proves the architecture *by* delivering value, not instead of it.
- If you need to validate a technology before committing, that is a **spike** (time-boxed throwaway), not a slice. Spikes do not belong in the slice map.
- Hand off to `slicing-stories` for the slice map.

## Guardrails

- Keep Phase A and Phase B separate. Product-space discussion in Phase A; system-space in Phase B. The phases bleed together in conversation, but the artifacts should not.
- Phase A asks no code questions. Phase B asks no product strategy questions.
- In Phase B, code is read to confirm current behavior, never to propose how to implement the change. Naming a file, comparing patterns, or sketching architecture means you have crossed into `sketching-design` territory.
- Pin down ambiguous terms ("fast", "simple", "secure") by asking what they mean concretely.
- State assumptions explicitly and confirm them. Never fill gaps silently.
- The spec is a living artifact. When implementation reveals the spec was wrong, updating it is expected.

## References

For templates, question banks, and worked examples:

- `references/templates.md` — Feature Brief and Story-Level Behavioral Spec templates, organized by phase.
- `references/question-bank.md` — Phase A and Phase B question prompts by domain.
- `references/examples.md` — Worked examples showing the cross-phase flow end-to-end.
