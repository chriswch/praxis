---
name: agile-story-slicer
description: Split a Feature Brief into an ordered list of thin, vertical story slices — just enough for each slice to be picked up by clarify-intent and turned into a full Story-Level Behavioral Spec without re-asking "what are we building?"
---

# Agile Story Slicer

## Overview

Take a Feature Brief (produced by `clarify-intent`) and split it into an ordered **slice map** — a sequence of thin, vertical story outlines. Each slice captures what the story covers and where it sits in the build order, but intentionally omits detailed acceptance criteria, tasks, and implementation plans. Those emerge downstream: `clarify-intent` specs each slice, then TDD drives the design.

Pipeline: `clarify-intent [Feature Brief]` → **agile-story-slicer [slice map]** → `clarify-intent [Story-Level Behavioral Spec per slice]` → design sketch → TDD.

## Input Contract

Expects a **Feature Brief** from `clarify-intent` containing:
- Problem / why now
- Goal & success criteria
- Scope boundaries (in / out)
- Constraints & risks (if surfaced)
- Open questions (blocking / deferrable)

If the input is not a Feature Brief, ask the requester to run `clarify-intent` first.

## Output

Produce two artifacts:

1. A human-readable **Slice Map (Markdown)** for reading/review.
2. A canonical **Slice Map (JSON)** that conforms to `references/slice-map.spec.md`.

- Put the Markdown first, and the JSON last (in a fenced `json` block).
- Treat the JSON as the source of truth; ensure the Markdown is derivable from the JSON.
- If writing to disk, name the JSON file `slice-map.json` and optionally render Markdown with:
  - `python3 scripts/render_slice_map_markdown.py slice-map.json > slice-map.md`
- If producing JSON, validate with `scripts/validate_slice_map.py`.

## Workflow

1. **Accept the Feature Brief.**
   - Read the brief. Do not re-interview the requester — trust the brief's scope, constraints, and open questions.
   - If there are blocking open questions that prevent slicing, surface them and stop. Otherwise, carry them into `meta.open_questions` and proceed.

2. **Identify seam lines.**
   - Find natural boundaries where the feature can be split into independently deliverable, testable behaviors.
   - Apply slicing heuristics (see `references/templates.md`):
     - Start with a walking skeleton (thinnest end-to-end path).
     - Then add: validation/error states, edge cases, permissions/roles, performance/accessibility, telemetry.
     - Split by persona, workflow step, data subset, or capability tier (read → create → edit → bulk).
   - Each slice must be a vertical cut (end-to-end behavior), not a horizontal layer (frontend-only, backend-only).

3. **Order the slices.**
   - Sequence so that earlier slices lay foundations for later ones.
   - The first slice should be the walking skeleton: the thinnest possible end-to-end path that proves the integration works.
   - For each slice, write a brief `sequence_rationale` explaining why it's in this position.

4. **Produce the slice map.**
   - For each slice, produce:
     - `title`: short, outcome-focused.
     - `story`: "As a X, I want Y, so that Z."
     - `scope_in`: what this slice covers.
     - `scope_out`: what is explicitly deferred to other slices.
     - `sequence_rationale`: why this slice is in this position.
     - `open_unknowns` (optional): deferrable unknowns specific to this slice.
   - Do **not** write acceptance criteria — that's `clarify-intent`'s job when it specs each slice.

5. **Validate.**
   - Self-check:
     - Does every slice deliver user-visible value (not just a technical layer)?
     - Can each slice be independently tested?
     - Does the first slice prove the core integration / highest-risk assumption?
     - Are `scope_in` boundaries clear enough that `clarify-intent` can spec the slice without asking "what are we building?"
     - Do `scope_out` boundaries prevent overlap between slices?
   - If producing JSON, run `python3 scripts/validate_slice_map.py slice-map.json`.

## Downstream Handoff

Each slice goes back to `clarify-intent` to produce a Story-Level Behavioral Spec. The sequence in the slice map determines build order.

**Feedback loop**: The slice map is a living artifact, not a frozen plan. When speccing or implementing a later slice reveals that the boundaries, ordering, or number of slices need to change — update the slice map. Common triggers:
- Implementing slice N reveals slice N+1 should be split or merged.
- A deferrable unknown becomes blocking and forces reordering.
- A slice turns out to be trivial and should be absorbed into an adjacent slice.
- New behavior is discovered that doesn't fit any existing slice.

When updating, re-validate (step 5) and re-confirm with the requester. Don't treat slice map changes as failures — they're the agile feedback loop working at the planning level.

## References and Tools

- Templates and slicing heuristics: `references/templates.md`
- Output schema: `references/slice-map.spec.md`
- Validator: `scripts/validate_slice_map.py` (`python3 scripts/validate_slice_map.py slice-map.json`)
- Markdown renderer: `scripts/render_slice_map_markdown.py` (`python3 scripts/render_slice_map_markdown.py slice-map.json`)
