# Praxis

Spec-driven, test-driven development plugin for Claude Code.

Build products the way humans build good products: start from the highest abstraction, transform intent into concrete spec and code step by step, and deliver working behavior — not perfect artifacts.

## How to work

- **One stage at a time.** Define the goal of each stage clearly. Produce results within the current stage. Do not leak downstream concerns upstream.
- **Core behavior first.** Focus acceptance criteria and tests on the behaviors users will actually perceive. Avoid redundant ACs that test the same behavior from different angles.
- **High standards, fewer tests.** Each acceptance criterion and test should be precise and meaningful. Quality over quantity — a few well-chosen tests beat many overlapping ones.
- **Sharp, fast, minimal.** Deliver a version that lets users use the core functionality, does not break existing behavior, and maintains sufficient code quality. Do not wait for a perfect result.
- **Do not break what works.** Run existing tests after every change. Existing behavior is a contract — honor it unless explicitly told otherwise.
- **Sufficiently maintainable code.** Simple, effective, pragmatic, easy to understand, extensible, easy to change. Not theoretically optimal — practically good.
- **Proportional ceremony.** A one-line fix does not need a spec. A multi-slice feature does. Every skill triages first and scales accordingly.

## Workflow

`/craft` pipeline: `clarifying-intent` → [`slicing-stories`] → `sketching-design` → `driving-tdd` → `verifying-and-adapting`

`/forge` pipeline: `clarifying-intent` → [`slicing-stories`] → `sketching-design` → `rapid-implementing`

Fast paths: Trivial skips everything. Bug fix → clarify + TDD. Refactor → existing tests + refactor. `/forge` → full clarification, then auto-advance without tests or human checkpoints. Every skill triages by size.

## Artifact paths

Skills write workflow artifacts to `.praxis/` in the working project:

| Artifact         | Path              | Producer                 |
| ---------------- | ----------------- | ------------------------ |
| Feature Brief    | `brief.md`        | `clarifying-intent`      |
| Slice Map        | `slice-map.json`  | `slicing-stories`        |
| Story-Level Spec | `spec.md`         | `clarifying-intent`      |
| Design Sketch    | `sketch.md`       | `sketching-design`       |
| TDD Session      | `tdd.md`          | `driving-tdd`            |
| Verification     | `verification.md` | `verifying-and-adapting` |
| Implementation   | `implementation.md` | `rapid-implementing`   |

Single-story: `.praxis/spec.md`, `.praxis/sketch.md`, etc.
Multi-slice: `.praxis/slices/{slice-id}/spec.md`, `.praxis/slices/{slice-id}/sketch.md`, etc.
Feature-level artifacts (`brief.md`, `slice-map.json`) always live at `.praxis/` root.
