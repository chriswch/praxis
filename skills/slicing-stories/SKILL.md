---
name: slicing-stories
description: Splits a Feature Brief into an ordered slice map of thin, vertical story slices — each capturing scope and build order, while deferring detailed acceptance criteria to downstream `clarifying-intent`. Use after clarifying-intent produces a Feature Brief, when a feature is too large for one story. Triggers on "split this into stories", "slice this feature", "what should we build first", "create a slice map", or when a Feature Brief needs to be broken into deliverable increments.
context: fork
allowed-tools: Read, Grep, Glob, Bash(python3 *), Write, Edit
---

# Agile Story Slicer

## Overview

Take a Feature Brief (produced by `clarifying-intent`) and split it into an ordered **slice map** — a sequence of thin, vertical story outlines. Each slice captures what the story covers and where it sits in the build order, but intentionally omits detailed acceptance criteria, tasks, and implementation plans. Those emerge downstream: `clarifying-intent` specs each slice, then TDD drives the design.

Pipeline: `clarifying-intent [Feature Brief]` → **slicing-stories [slice map]** → `clarifying-intent [Story-Level Behavioral Spec per slice]` → design sketch → TDD.

## Input Contract

Expects a **Feature Brief** from `clarifying-intent` containing:

- Problem / why now
- Goal & success criteria
- Scope boundaries (in / out)
- Constraints & risks (if surfaced)
- Open questions (blocking / deferrable)

Read the Feature Brief from `.praxis/brief.md`.

If the input is not a Feature Brief, stop and return a message asking the orchestrator to run `clarifying-intent` first.

## Output

Produce two artifacts:

1. A human-readable **Slice Map (Markdown)** for reading/review.
2. A canonical **Slice Map (JSON)** that conforms to `${CLAUDE_SKILL_DIR}/references/slice-map.spec.md`.

- Put the Markdown first, and the JSON last (in a fenced `json` block).
- Treat the JSON as the source of truth; ensure the Markdown is derivable from the JSON.
- Write the JSON to `.praxis/slice-map.json` and optionally render Markdown with:
  - `python3 ${CLAUDE_SKILL_DIR}/scripts/render_slice_map_markdown.py .praxis/slice-map.json > .praxis/slice-map.md`
- If producing JSON, validate with `python3 ${CLAUDE_SKILL_DIR}/scripts/validate_slice_map.py .praxis/slice-map.json`.

## Workflow

1. **Accept the Feature Brief.**
   - Read the brief from `.praxis/brief.md`. Do not re-interview the requester — trust the brief's scope, constraints, and open questions.
   - If there are blocking open questions that prevent slicing, write them clearly in your output under a `## Blocking Questions` heading and stop. The orchestrator will resolve them with the user and re-invoke this skill.

2. **Identify seam lines.**
   - Find natural boundaries where the feature can be split into independently deliverable, testable behaviors.
   - Apply slicing heuristics (see `${CLAUDE_SKILL_DIR}/references/templates.md`):
     - Start with a walking skeleton — the thinnest end-to-end path that delivers value to one real user with one real integration. Use real dependencies (a real IdP, a real database, a real API), not stubs or test doubles. The skeleton proves the architecture BY delivering value, not instead of it.
     - Then add: validation/error states, edge cases, permissions/roles, performance/accessibility, telemetry.
     - Split by persona, workflow step, data subset, or capability tier (read → create → edit → bulk).
   - Each slice must be a vertical cut (end-to-end behavior), not a horizontal layer (frontend-only, backend-only).
   - **Spikes are not slices.** If you need to validate a technology or integration before committing, that's a spike — a time-boxed throwaway experiment. Spikes belong in `clarifying-intent` as risk-reduction activities, not in the slice map as user stories. Don't dress a spike in a user story format with a fake "so that" clause.

3. **Order the slices.**
   - Sequence so that earlier slices lay foundations for later ones.
   - The first slice should be the walking skeleton: the thinnest end-to-end path that delivers value to one real user with one real integration.
   - For each slice, write a brief `sequence_rationale` explaining why it's in this position.

4. **Produce the slice map.**
   - For each slice, produce:
     - `title`: short, outcome-focused.
     - `story`: "As a X, I want Y, so that Z."
     - `scope_in`: what this slice covers.
     - `scope_out`: what is explicitly deferred to other slices.
     - `sequence_rationale`: why this slice is in this position.
     - `open_unknowns` (optional): deferrable unknowns specific to this slice.
   - Do **not** write acceptance criteria — that's `clarifying-intent`'s job when it specs each slice.

5. **Validate.**
   - **INVEST check** — for each slice, verify:
     - **I**ndependent — can be reprioritized relative to other slices (some sequencing is inevitable, but minimize hard dependencies).
     - **N**egotiable — scope can be adjusted without invalidating the slice.
     - **V**aluable — delivers value to a real user, not just to the team. Apply the litmus test: "If we shipped this slice and stopped, would at least one real user get value from it?" If the answer is "only if combined with a later slice," it's not independently valuable — merge it with the slice it depends on, or restructure so it delivers value on its own.
     - **E**stimable — scope is clear enough to estimate effort.
     - **S**mall — fits within a sprint.
     - **T**estable — acceptance criteria can be written and verified.
   - **Additional checks:**
     - Does the first slice (walking skeleton) deliver value to a real user with a real integration, not just prove architecture with stubs?
     - Are `scope_in` boundaries clear enough that `clarifying-intent` can spec the slice without asking "what are we building?"
     - Do `scope_out` boundaries prevent overlap between slices?
     - Is anything in the slice map actually a spike (technology validation, integration proof) rather than a user story? If so, extract it as a spike in `clarifying-intent` and remove it from the slice map.
   - If producing JSON, run `python3 ${CLAUDE_SKILL_DIR}/scripts/validate_slice_map.py .praxis/slice-map.json`.

## Downstream Handoff

Each slice goes back to `clarifying-intent` to produce a Story-Level Behavioral Spec. The sequence in the slice map determines build order.

**Feedback loop**: The slice map is a living artifact, not a frozen plan. When speccing or implementing a later slice reveals that the boundaries, ordering, or number of slices need to change — update the slice map. Common triggers:

- Implementing slice N reveals slice N+1 should be split or merged.
- A deferrable unknown becomes blocking and forces reordering.
- A slice turns out to be trivial and should be absorbed into an adjacent slice.
- New behavior is discovered that doesn't fit any existing slice.

When updating, re-validate (step 5) and re-confirm with the requester. Don't treat slice map changes as failures — they're the agile feedback loop working at the planning level.

## References and Tools

- Templates and slicing heuristics: `${CLAUDE_SKILL_DIR}/references/templates.md`
- Output schema: `${CLAUDE_SKILL_DIR}/references/slice-map.spec.md`
- Validator: `python3 ${CLAUDE_SKILL_DIR}/scripts/validate_slice_map.py .praxis/slice-map.json`
- Markdown renderer: `python3 ${CLAUDE_SKILL_DIR}/scripts/render_slice_map_markdown.py .praxis/slice-map.json`
