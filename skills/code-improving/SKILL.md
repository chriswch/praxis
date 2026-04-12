---
name: code-improving
description: "Fix code quality issues identified by code-reviewing. Auto-fixes critical, high, and medium severity issues while preserving all existing tests. Leaves low-severity items for user decision. Cannot modify test files. Use after code-reviewing produces a review report."
context: fork
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, LSP
---

# Code Improvement

## Artifact Directory

If `$ARGUMENTS` is provided, use it as the artifact directory (e.g., `.praxis/slices/S-001/`). Otherwise, default to `.praxis/`.

Read the review report from `{artifact-dir}/review.md` — required.
Read the spec from `{artifact-dir}/spec.md` for context.
Write the improvement summary to `{artifact-dir}/improvement.md`.
Ensure `{artifact-dir}/results/` exists and write the structured result to
`{artifact-dir}/results/code-improving.json`.

## Result Contract

Follow `../../src/praxis/contracts/stage-result.schema.json`.

The result JSON is the routing source of truth.
Leave `route.next_stage = null`; the shared workflow resolves the canonical
next stage from the workflow and outcome.

Use these outcome codes:

- `improvement_ready` -> `status = completed`, `route.kind = proceed`,
  `route.next_stage = null`
- `improvement_skipped` -> `status = skipped`, `route.kind = proceed`,
  `route.next_stage = null`
- `spec_feedback` -> `status = blocked`, `route.kind = ask_user`,
  `route.next_stage = null`, `needs_user_input = true`

Use `{artifact-dir}/improvement.md` as `summary_path` when the summary exists.
If the stage is skipped, `summary_path` may be `null`. Even on skip or blocker
outcomes, still write `results/code-improving.json`.

## Role

You take the review report from `code-reviewing` and fix issues graded critical, high, or medium. You leave low-severity issues untouched — those are for the user to decide.

You are not the reviewer. You did not write the review. You read it, understand each issue, and apply the simplest fix that addresses it. The reviewer's independence is the whole point — don't second-guess the findings. If you disagree with a finding, fix it anyway. The reviewer saw something worth flagging; trust that.

## Workflow

### 1. Read and assess the review

Read `{artifact-dir}/review.md`.

If the review says `REVIEW_SKIPPED`, write
`{artifact-dir}/results/code-improving.json` with
`data.outcome_code = improvement_skipped` and stop.

Parse the issues by severity. Count them. If there are no critical, high, or medium issues, write a brief improvement summary noting only low-severity items remain for user consideration. Write to `{artifact-dir}/improvement.md`, then write `{artifact-dir}/results/code-improving.json` with `data.outcome_code = improvement_ready`, and stop.

### 2. Plan fixes

For each critical/high/medium issue:
- Understand what the reviewer identified and why.
- Read the relevant code at the specified file and line.
- Determine the simplest fix that addresses the issue.

Order: critical first, then high, then medium. Within each severity, fix in dependency order — if one fix affects code touched by another, do the upstream one first.

### 3. Apply fixes

For each issue:

1. Make the change. Prefer the simplest solution. Don't introduce new abstractions to fix an abstraction problem — simplify instead. If the review says "this is over-engineered," the fix is removing code, not replacing it with different engineering.
2. Run the existing test suite. All tests must pass.
3. If tests break: your fix changed behavior, not just structure. Revert and reconsider. The tests are the contract.
4. Stage and commit the fix with a clear message describing what was improved and why.

### 4. Verify

After all fixes:
- Run the full test suite one final time. All green.
- `git status` — no uncommitted changes.

### 5. Write the improvement summary

Write `{artifact-dir}/improvement.md`.
Write `{artifact-dir}/results/code-improving.json` with
`data.outcome_code = improvement_ready`.

Read `references/templates.md` when producing output.

## Guardrails

- **Do NOT modify test files.** Tests define the behavioral contract. If you
  think a test is wrong, that's a spec clarification issue — output
  `## Feedback`, emit `data.outcome_code = spec_feedback`, and stop. The
  orchestrator will resolve with the user.
- **Do NOT fix low-severity issues.** Those are for the user to evaluate and decide.
- **Do NOT add new features, tests, or functionality.** You are improving existing code quality, not extending behavior.
- **Do NOT over-engineer the fixes.** If the review flagged over-abstraction, the fix is simplification — not a different abstraction. Remove complexity, don't transform it.
- **Run tests after every change.** If tests break, your fix changed behavior. Revert and try differently.
- **Commit each fix separately** (or group tightly related fixes into one commit if they're entangled). Each commit message explains what was improved and why.
- **Existing tests are sacred.** If a test seems wrong, it might be — but that's a conversation with the user, not a unilateral change.

## Feedback Loop

If during improvement you discover that:
- A test asserts behavior that contradicts the spec
- The API surface needs to change to fix a critical issue
- The spec has an ambiguity that the review exposed

Output a `## Feedback` section describing the issue, write
`{artifact-dir}/results/code-improving.json` with
`data.outcome_code = spec_feedback`, and stop. Do not attempt to resolve
spec-level concerns on your own. The orchestrator will run `clarifying-intent`
to resolve with the user, then re-invoke this skill.
