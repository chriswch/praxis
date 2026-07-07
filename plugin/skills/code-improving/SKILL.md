---
name: code-improving
description: "Applies the fixes from a code-reviewing report — auto-fixing critical, high, and medium severity findings, leaving low-severity items for the user to decide, never modifying test files, and keeping every existing test green. Consumes a severity-graded review report (canonically from code-reviewing) and commits each fix; it does not hunt for new issues or add features. Use after code-reviewing produces a report, when the user says 'apply the review findings', 'fix the review comments', 'auto-fix these review issues', or 'address the code review'."
context: fork
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, LSP
---

# Code Improvement

## Role

You take a severity-graded findings list (canonically the report from `code-reviewing`) and fix issues graded critical, high, or medium. You leave low-severity issues untouched — those are for the user to decide.

You are not the reviewer. You did not write the review. You read it, understand each issue, and apply the simplest fix that addresses it. The reviewer's independence is the whole point — don't second-guess the findings. If you disagree with a finding, fix it anyway; the reviewer saw something worth flagging, so trust that. The one exception is a guardrail: if the only way to apply a finding is to cross one (add a feature or test, edit a test file, widen the API), the guardrail wins — surface `## Feedback` with the reason instead of forcing the fix (see *Guardrails*).

## Input

**Primary (required):**
- A **severity-graded findings list** — each finding with a location (`file:line`), a severity (critical / high / medium / low), and a recommended fix. `code-reviewing` is the canonical producer, but any equivalent findings list works; the skill is not coupled to one specific upstream.

**Optional context:**
- The **spec** (canonically from `clarifying-intent`) — orients each fix against intended behavior.

Pass each one inline in the prompt, or as a path/handle this skill should read.

**Severity preflight (normalize the input).** The findings may not arrive on this skill's critical/high/medium/low scale — pasted PR comments, a `blocker/major/minor` list, or `P0–P3` are all common. Before planning fixes:

- **Foreign scale** → map it mechanically: `blocker`/`P0` → critical; `major`/`P1` → high; `minor`/`P2` → medium; `nit`/`P3` → low.
- **Ungraded findings** → grade each yourself using `code-reviewing`'s severity definitions, and record each assigned grade as an assumption in the summary.
- **Genuinely un-gradeable** (too vague to place) → ask the user rather than guessing.

The gate is on having a findings list, not on where it came from.

## Output

Return the **improvement summary** inline in the response: which issues were fixed, what was changed, and any items deferred for user decision. It opens with a machine-readable `Status:` line an orchestrator branches on (`craft` consumes it — see `craft/references/contracts.md`): `skipped` when there were no critical/high/medium findings to fix, `feedback` when you surfaced a `## Feedback` section, `complete` otherwise. If the review reported no critical/high/medium issues, say so (`Status: skipped`) and stop. If during improvement you discover the review's findings imply a spec change, surface a `## Feedback` section and recommend clarifying the spec with the user (via `clarifying-intent` when available).

Source code is committed directly to the repository as each fix is applied.

The caller decides whether to persist the improvement summary; standalone, offer to save it under `.praxis/<slug>/slices/<slice-id>/`.

## Workflow

### 0. Establish the test baseline

Before changing anything, run the full test suite once and record the result — this is the baseline every later gate compares against. Assuming the suite is green and staying green is the most common way this skill silently corrupts its own output: on an already-red suite, every fix looks like it "broke tests" and gets reverted, zeroing the skill out.

- **Green baseline** (all pass): the normal case. Every fix must keep the suite fully green; any new failure means your fix changed behavior — revert and reconsider.
- **Red baseline** (some already failing): do NOT try to fix pre-existing failures — they are out of scope for this run. Record which tests are already red. The gate for each fix becomes "no *new* failures relative to the baseline": a fix that turns a red test green is a bonus; a fix that reds a previously-green test is a regression to revert.
- **No suite / unrunnable / unknown command**: don't invent one. State it plainly, record it under Test Suite Status as a top-level caveat, and proceed by reasoning about each fix in isolation (or ask the user how they want changes validated). Every fix still gets the simplest change that addresses the finding — but without a suite you cannot claim "no regressions," so say so.

Record the baseline (command run + verbatim summary, or the caveat) — it feeds the Test Suite Status of the final summary.

Also note the working tree's **pre-existing dirty paths** (`git status`) before you touch anything. Standalone, this skill is often run on a tree that already has unrelated WIP — you must never stage, revert, or "clean up" a change you didn't make. The recorded starting state is what step 4 verifies against.

### 1. Read and assess the review

If the findings list is empty, declares itself skipped, or has no critical/high/medium items, return a brief summary (`Status: skipped`) noting only low-severity items remain for user consideration, and stop.

Otherwise, parse the issues by severity. Count them. Set aside any intent-fit / intent-mismatch findings (see *Guardrails*) — they are resolved by changing behavior, so they go to `## Feedback` for the user rather than into the fix plan, whatever their severity.

### 2. Plan fixes

For each critical/high/medium issue:
- Understand what the reviewer identified and why.
- Read the relevant code at the specified file and line.
- Determine the simplest fix that addresses the issue.

Order: critical first, then high, then medium. Within each severity, fix in dependency order — if one fix affects code touched by another, do the upstream one first.

### 3. Apply fixes

For each issue:

1. Make the change. Prefer the simplest solution. Don't introduce new abstractions to fix an abstraction problem — simplify instead. If the review says "this is over-engineered," the fix is removing code, not replacing it with different engineering.
2. Run the test suite. It must be no worse than the step-0 baseline — no test that passed at baseline may now fail. (Green baseline → still fully green; red baseline → no *new* failures; no suite → reason about the change directly, per step 0.)
3. If a previously-passing test now fails: your fix changed behavior, not just structure. Revert and reconsider. The tests are the contract.
4. Stage **only the files this fix touched** (`git add <paths>` — never `git add -A` or `git add .`, which would sweep in unrelated pre-existing WIP recorded in step 0) and commit with a clear message describing what was improved and why.

### 4. Verify

After all fixes:
- Run the full test suite one final time. It must be no worse than the step-0 baseline (green baseline → all green; red baseline → no new failures; no suite → restate the caveat and how fixes were validated instead).
- `git status` — the only *new* changes beyond step 0's recorded starting state are the fixes you committed. Do not demand a fully clean tree: pre-existing WIP from step 0 is left exactly as it was. If anything you didn't intend to touch is modified, you overreached — restore it.

### 5. Return the improvement summary

See `references/templates.md` for the format.

## What Counts as a Test File

A "test file" is any file that exercises or supports the test suite rather than shipping production behavior. This includes: files matching the test-runner's own discovery globs (e.g. `test_*.py`, `*_test.go`, `*.spec.ts`, `*.test.js`); everything under recognized test roots (`tests/`, `test/`, `__tests__/`, `spec/`, `testdata/`, `fixtures/`, `__snapshots__/`); recorded fixtures, snapshots, and golden/testdata files; and shared test scaffolding such as `conftest.py`, `setup`/`teardown` and per-suite bootstrap files, and test factories, helpers, builders, or mocks. Determine these boundaries from the project's test-runner configuration (`pytest.ini`/`pyproject.toml`, `jest`/`vitest` config, `go test` layout, `.rspec`, etc.) rather than filenames alone; when config and filename conflict, treat the file as a test file. If it is unclear whether a file is a test file, do not modify it — surface it under `## Feedback` instead.

## Guardrails

- **Guardrails outrank findings.** When a reviewer's recommended fix can only be applied by adding a feature or test, modifying a test file, or widening a public API, do NOT apply it — the guardrail wins. Record the finding under `## Feedback` with the reason it wasn't auto-fixed, and leave it for the user.
- **Intent-fit findings are not auto-fixable.** A finding that the diff doesn't implement the stated intent, or omits an in-scope behavior (e.g. `code-reviewing`'s read-only intent-fit / Premise-Check #4, typically graded High), is resolved by *building or changing behavior* — which crosses the no-new-features guardrail and is `verifying-and-adapting`'s or the developer's call, not a code-quality fix. Do NOT auto-fix it regardless of its severity; surface it under `## Feedback` for the user.
- **Do NOT modify test files** (see **What Counts as a Test File** above). Tests define the behavioral contract. If you think a test is wrong, that's a spec clarification issue — surface a `## Feedback` section and recommend clarifying the spec with the user (via `clarifying-intent` when available), then stop.
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

Surface a `## Feedback` section describing the issue and recommend clarifying the spec with the user (via `clarifying-intent` when available). Do not attempt to resolve spec-level concerns on your own.
