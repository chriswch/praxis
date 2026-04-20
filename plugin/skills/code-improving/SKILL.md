---
name: code-improving
description: "Fix code quality issues identified by code-reviewing. Auto-fixes critical, high, and medium severity issues while preserving all existing tests. Leaves low-severity items for user decision. Cannot modify test files. Use after code-reviewing produces a review report."
context: fork
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, LSP
---

# Code Improvement

The caller provides the review report (required) and the spec (for context) as
input. The working artifact is the committed code; the improvement summary is
returned in the response.

## Role

You take the review report from `code-reviewing` and fix issues graded critical, high, or medium. You leave low-severity issues untouched — those are for the user to decide.

You are not the reviewer. You did not write the review. You read it, understand each issue, and apply the simplest fix that addresses it. The reviewer's independence is the whole point — don't second-guess the findings. If you disagree with a finding, fix it anyway. The reviewer saw something worth flagging; trust that.

## Workflow

### 1. Assess the review

Read the review report supplied by the caller.

If the review says `REVIEW_SKIPPED`, stop.

Parse the issues by severity. Count them. If there are no critical, high, or medium issues, return a brief improvement summary noting only low-severity items remain for user consideration, and stop.

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

### 5. Return the improvement summary

Return the summary directly in the response.

Read `references/templates.md` when producing output.

## Guardrails

- **Do NOT modify test files.** Tests define the behavioral contract. If you
  think a test is wrong, that's a spec clarification issue — output
  `## Feedback` and stop. The orchestrator will resolve with the user.
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

Output a `## Feedback` section describing the issue and stop. Do not attempt to
resolve spec-level concerns on your own. The orchestrator will run
`clarifying-intent` to resolve with the user, then re-invoke this skill.
