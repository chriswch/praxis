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

`/craft` pipeline: `clarifying-intent` → [`slicing-stories`] → `sketching-design` → `driving-tdd` → `code-reviewing` → `code-improving` → `verifying-and-adapting`

`/forge` pipeline: `clarifying-intent` → [`slicing-stories`] → `sketching-design` → `rapid-implementing` → `code-reviewing` → `code-improving`

Fast paths: Trivial skips everything. Bug fix → clarify + TDD. Refactor → existing tests + refactor. `/forge` → full clarification, then auto-advance without writing new tests or human checkpoints. Every skill triages by size.

## Shared workflow layer

Praxis v2 separates shared workflow semantics from runtime-specific entrypoints:

- `workflow/pipelines/craft.md` is the shared source of truth for the `craft` workflow.
- `workflow/pipelines/forge.md` is the shared source of truth for the `forge` workflow.
- `workflow/contracts/run.schema.json` defines `.praxis/run.json`.
- `workflow/contracts/stage-result.schema.json` defines `.praxis/results/<stage>.json`.

Claude entrypoints under `commands/` are thin wrappers over the shared pipeline files. If a wrapper and a shared pipeline file disagree, the shared pipeline file wins for workflow semantics.

## Artifact paths

Skills write workflow artifacts and structured routing state to `.praxis/` in the working project:

| Artifact         | Path              | Producer                 |
| ---------------- | ----------------- | ------------------------ |
| Feature Brief    | `brief.md`        | `clarifying-intent`      |
| Slice Map        | `slice-map.json`  | `slicing-stories`        |
| Story-Level Spec | `spec.md`         | `clarifying-intent`      |
| Design Sketch    | `sketch.md`       | `sketching-design`       |
| TDD Session      | `tdd.md`          | `driving-tdd`            |
| Code Review      | `review.md`       | `code-reviewing`         |
| Improvement      | `improvement.md`  | `code-improving`         |
| Verification     | `verification.md` | `verifying-and-adapting` |
| Implementation   | `implementation.md` | `rapid-implementing`   |

Structured workflow state:

| Structured Artifact | Path                          | Purpose                         |
| ------------------- | ----------------------------- | ------------------------------- |
| Run State           | `run.json`                    | Current workflow cursor         |
| Stage Result        | `results/<stage>.json`        | Stage routing and outcome state |

Single-story: `.praxis/spec.md`, `.praxis/sketch.md`, etc.
Single-story results: `.praxis/results/clarifying-intent.json`, `.praxis/results/code-reviewing.json`, etc.
Multi-slice: `.praxis/slices/{slice-id}/spec.md`, `.praxis/slices/{slice-id}/sketch.md`, etc.
Multi-slice results: `.praxis/slices/{slice-id}/results/driving-tdd.json`, `.praxis/slices/{slice-id}/results/verifying-and-adapting.json`, etc.
Feature-level artifacts (`brief.md`, `slice-map.json`) always live at `.praxis/` root.

Use the markdown artifact as the human-readable summary, but use
`.praxis/results/<stage>.json` as the authoritative routing signal. Do not rely
only on markers such as `SKETCH_SKIPPED`, `REVIEW_SKIPPED`, `## Feedback`, or
`ROUTING:` in markdown output.
