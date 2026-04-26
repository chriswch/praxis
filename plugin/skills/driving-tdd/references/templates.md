# TDD Loop — Reference Templates

Use these as structure references. Adapt to fit the project's conventions.

---

## AC Checklist

Populate from the behavioral spec before starting the first cycle. Order determines implementation sequence.

| # | Acceptance Criterion | Test Name | Status | Notes |
|---|---|---|---|---|
| 1 | [Given/When/Then from spec] | [descriptive behavior name] | Pending | |
| 2 | ... | ... | ... | ... |

**Status values:** Pending → Red → Green → Refactored → Done. Use "Skipped" if the behavior already exists (note why).

---

## Feedback Log

Track discoveries that need to flow back to `clarifying-intent`.

| # | Discovery | Type | Action |
|---|---|---|---|
| 1 | [what you found] | Ambiguous AC / Missing AC / Impossible constraint / Spec contradiction / Slice map impact | [what to update in the spec or slice map] |

---

## Session Summary

Produced at the end of a TDD session.

```markdown
### TDD Summary: [story title]

**ACs Completed**: [count] / [total]

**Tests Added**
- [test file]: [test name] — [AC #]
- ...

**Design Decisions (emerged during refactor)**
- [decision]: [why — what the code told you]
- ...

**Spec Feedback**
- [update needed, or "None — spec was accurate"]

**Slice Map Impact** (only when working through a slice map)
- [changes needed to upcoming slices, or "None — slice map holds"]

**Suite Status**: All green / [N] failures remaining
```
