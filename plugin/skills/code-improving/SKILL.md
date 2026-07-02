---
name: code-improving
description: "Applies the fixes from a code-reviewing report — auto-fixing critical, high, and medium severity findings, leaving low-severity items for the user to decide, never modifying test files, and keeping every existing test green. Consumes a severity-graded review report (canonically from code-reviewing) and commits each fix; it does not hunt for new issues or add features. Use after code-reviewing produces a report, when the user says 'apply the review findings', 'fix the review comments', 'auto-fix these review issues', or 'address the code review'."
context: fork
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, LSP
---

# Code Improvement

## Role

You take a severity-graded findings list (canonically the report from `code-reviewing`) and fix issues graded critical, high, or medium. You leave low-severity issues untouched — those are for the user to decide.

You are not the reviewer. You did not write the review. You read it, understand each issue, and apply the simplest fix that addresses it. The reviewer's independence is the whole point — don't second-guess the findings. If you disagree with a finding, fix it anyway. The reviewer saw something worth flagging; trust that.

## Input

**Primary (required):**
- A **severity-graded findings list** — each finding with a location (`file:line`), a severity (critical / high / medium / low), and a recommended fix. `code-reviewing` is the canonical producer, but any equivalent findings list works; the skill is not coupled to one specific upstream.

**Optional context:**
- The **spec** (canonically from `clarifying-intent`) — orients each fix against intended behavior.

Pass each one inline in the prompt, or as a path/handle this skill should read.

## Output

Return the **improvement summary** inline in the response: which issues were fixed, what was changed, and any items deferred for user decision. If the review reported no critical/high/medium issues, say so and stop. If during improvement you discover the review's findings imply a spec change, surface a `## Feedback` section and recommend returning to `clarifying-intent`.

Source code is committed directly to the repository as each fix is applied.

The caller decides whether to persist the improvement summary and where.

## Workflow

### 1. Read and assess the review

If the review says it was skipped or there are no critical/high/medium issues, return a brief summary noting only low-severity items remain for user consideration, and stop.

Otherwise, parse the issues by severity. Count them.

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

See `references/templates.md` for the format.

## What Counts as a Test File

A "test file" is any file that exercises or supports the test suite rather than shipping production behavior. This includes: files matching the test-runner's own discovery globs (e.g. `test_*.py`, `*_test.go`, `*.spec.ts`, `*.test.js`); everything under recognized test roots (`tests/`, `test/`, `__tests__/`, `spec/`, `testdata/`, `fixtures/`, `__snapshots__/`); recorded fixtures, snapshots, and golden/testdata files; and shared test scaffolding such as `conftest.py`, `setup`/`teardown` and per-suite bootstrap files, and test factories, helpers, builders, or mocks. Determine these boundaries from the project's test-runner configuration (`pytest.ini`/`pyproject.toml`, `jest`/`vitest` config, `go test` layout, `.rspec`, etc.) rather than filenames alone; when config and filename conflict, treat the file as a test file. If it is unclear whether a file is a test file, do not modify it — surface it under `## Feedback` instead.

## Guardrails

- **Do NOT modify test files** (see **What Counts as a Test File** above). Tests define the behavioral contract. If you think a test is wrong, that's a spec clarification issue — surface a `## Feedback` section and recommend returning to `clarifying-intent`, then stop.
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

Surface a `## Feedback` section describing the issue and recommend returning to `clarifying-intent`. Do not attempt to resolve spec-level concerns on your own.
