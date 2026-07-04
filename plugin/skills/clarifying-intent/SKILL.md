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

A **story-boundary handoff** is the small carry-over an upstream slice leaves for the next one: the slice `id` and `title`, its one-line story, `scope_in`/`scope_out`, and any carried-over unknowns or emerged design notes. When one is supplied, treat it as a bounded seed for the new story. Do not let the handoff widen scope — it informs the next clarification pass; it does not replace the new request.

## Output

Return one of these inline in the response. Each ends with a machine-readable `Status:` line, and the two artifacts carry a `Sizing:` line, so an orchestrator can route without parsing prose (the vocabulary is owned here and consumed by `craft` — see `craft/references/contracts.md`):

- **Trivial change** — a one-sentence statement of the change. No spec, no phases. → `Status: trivial`.
- **Feature Brief** — when the input is feature-sized. Carries `Sizing: feature`. Hand off to `slicing-stories` next; Phase B runs per-slice in subsequent invocations. → `Status: proceed`.
- **Story-Level Behavioral Spec** — when the input is story-sized (or for a single slice). Carries `Sizing: small` or `Sizing: story` per triage. Ready for `sketching-design` and TDD. → `Status: proceed`.
- **Open questions** — when blocking unknowns remain: list them, ask the user, and stop. → `Status: open-questions`.
- **Spec issue** — when Phase B finds a Phase A assumption is wrong (a named module is absent, the behavior is already different, a stated constraint does not hold): describe it and stop. → `Status: spec-issue`.

**Persistence.** The caller decides whether and where to save. When invoked standalone (no orchestrator directive) and the artifact is worth keeping, offer to persist it under `.praxis/<slug>/` — `brief.md` for a Feature Brief, `spec.md` for a Story Spec (see the `.praxis/` layout in `craft/SKILL.md`). Under a craft autopilot directive the orchestrator persists; do not write files yourself — this skill holds no Write grant.

## Workflow

### 1. Triage and route

Decide what kind of input you have. If unclear, default to feature-sized and let Phase A reveal the true size.

- **Trivial** (< half day, obvious change — typo, rename, config tweak): state the change in one sentence and stop. Skip both phases. → `Status: trivial`.
- **Story-sized** (1–5 days, single user-facing behavior, or a slice from an upstream Feature Brief): run both phases. Phase A may be brief if a clear user story is already supplied; Phase B does the bulk. Set the artifact's `Sizing:` line: **`small`** when it's a single-file, 1–2 AC change on an obvious path (a downstream orchestrator can skip the design sketch and go straight to TDD), or **`story`** otherwise (multiple files / 3+ ACs / non-obvious path — a design sketch earns its keep).
- **Feature-sized / Epic** (many stories, cross-cutting): run Phase A fully, produce a Feature Brief (`Sizing: feature`), recommend `slicing-stories`, and stop. Phase B runs per-slice on subsequent invocations.

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

f. **Checkpoint.** Present the Phase A artifact (Feature Brief or the product-space portion of the Story Spec) and ask for confirmation — unless the invoking prompt said to skip checkpoints (see *Checkpoints*). Use `AskUserQuestion` when available.

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

d. **Draft the Story-Level Behavioral Spec.** Use the template in `references/templates.md`. Fill in Acceptance Criteria (Given/When/Then), Observable Signals, What Must Not Break, and any system-space Decisions & Rationale. Write ACs in Given/When/Then; where a precise trigger→response sharpens testability, EARS phrasing ("When *&lt;trigger&gt;*, the system shall *&lt;response&gt;*") helps. Make every AC map to at least one concrete Observable Signal — a specific command, endpoint, log line, or UI state someone running the code could check — so `verifying-and-adapting` can later execute it, not just read it.

e. **Self-check before presenting:**
   - Can a developer write failing tests from the acceptance criteria alone?
   - Do ACs cover the happy path and at least one error/edge case? (Add boundary cases when the domain involves limits, thresholds, or ranges.)
   - Are observable signals concrete enough that someone running the code could verify them?
   - Does every acceptance criterion map to at least one concrete observable signal (a specific command, endpoint, or UI state a person could check)?
   - Are regression boundaries explicit?

   If any answer is "no", iterate before presenting.

f. **Checkpoint.** Present the spec and ask for confirmation — unless the invoking prompt said to skip checkpoints (see *Checkpoints*).

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

## Checkpoints

By default, present the artifact for confirmation at the end of Phase A and at the end of Phase B. Skip these checkpoints only when the invoking prompt explicitly says to (for example, a `craft` autopilot directive). This keeps the skill caller-neutral: it doesn't need to know about "modes," only whether the caller asked it to skip.

Either way, two conditions are hard stops regardless of the checkpoint setting: **Open Questions** (blocking unknowns) and **Spec Issues** (Phase B finds a Phase A assumption is wrong). Those surface and stop even under a skip-checkpoints directive.

## Fast Paths

Not every task goes through both phases at full depth. Match the input type to the shortest path:

- **Bug fix**: triage → quick Phase A (reproduce the bug as a Given/When/Then) → Phase B (where in the system, what regression risk) → done. Often very short.
- **Pure refactor**: no spec needed. Ensure existing tests pass → refactor → ensure tests still pass. If characterization tests are missing, that is implementation work — route to `driving-tdd` to add them before refactoring. This skill does not write tests (it holds no Write/Edit grant).
- **Trivial change**: triage step alone produces a one-sentence statement. No phases.

The full pipeline (run end-to-end via the `craft` skill) is for medium+ features. Don't force every task through it.

## Splitting Recognition (Feature-Sized Only)

Recognize a feature-sized input and hand it off — do **not** slice it here. `slicing-stories` owns the splitting heuristics (walking skeleton, vertical-slice patterns, spikes-are-not-slices, sequencing). Keeping them there stops the two skills from overlapping and keeps each independently usable.

- **Signal it is feature-sized**: it spans several user-facing behaviors that could each ship on their own.
- **Value litmus** (a quick sanity-check the requester can apply without invoking another skill): "If we shipped just the first behavior and stopped, would at least one real user get value?" If yes, it is sliceable — hand off.
- Hand off to `slicing-stories` for the slice map. Each resulting slice returns to this skill for a Story-Level Behavioral Spec (Phase B runs then).

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
