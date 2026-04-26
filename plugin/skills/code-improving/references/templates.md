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

All [N] tests passing. No regressions introduced.

### Commits

- `abc1234` — [commit message]
- `def5678` — [commit message]
```

## Guidelines

- **Explain the fix, not just the change**: "Replaced string-keyed map with typed enum to prevent typo-based bugs" not "changed map to enum."
- **Carry forward low items verbatim**: Copy the low-severity issues from the review report exactly — the user needs to see them without hunting through multiple files.
- **Test suite status is mandatory**: Always report the final state of the test suite after all fixes.
- **List all commits**: Include the short hash and message for each fix commit so the user can review individually.
