# Improvement Summary Template

Use this template for the improvement summary. If `IMPROVEMENT_SKIPPED` or no auto-fixable issues, use a condensed version.

```markdown
## Improvements: [story/slice title]

### Issues Fixed

| # | Severity | Issue | Fix Applied | Files Changed |
|---|----------|-------|-------------|---------------|
| 1 | Critical | [what was wrong] | [what was done and why] | `path/to/file.ts` |
| 2 | High | [what was wrong] | [what was done and why] | `path/to/file.ts` |

### Issues Left for User (Low Severity)

_None._ (or table below)

| # | File:Line | Issue | Recommendation |
|---|-----------|-------|----------------|
| 1 | `path/to/file.ts:3` | [from review] | [from review] |

### Test Suite Status

- **Baseline** (before fixes): `<command>` → `<verbatim summary>` — or `no runnable suite: <reason>`.
- **After fixes**: `<command>` → `<verbatim summary>`.
- **Verdict**: No new failures relative to baseline.
  - _Red baseline_: note which pre-existing failures remain out of scope.
  - _No suite_: state that regressions could not be verified by tests, and how fixes were validated instead.

### Commits

- `abc1234` — [commit message]
- `def5678` — [commit message]
```

## Guidelines

- **Explain the fix, not just the change**: "Replaced string-keyed map with typed enum to prevent typo-based bugs" not "changed map to enum."
- **Carry forward low items verbatim**: Copy the low-severity issues from the review report exactly — the user needs to see them without hunting through multiple files.
- **Test suite status is mandatory**: Always report both the baseline (before fixes) and the final state, and confirm no new failures relative to baseline. If there was no runnable suite, say so explicitly and state how fixes were validated instead.
- **List all commits**: Include the short hash and message for each fix commit so the user can review individually.
