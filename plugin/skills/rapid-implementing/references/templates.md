# Rapid Implementation — Reference Templates

Use these as structure references. Adapt to fit the project's conventions.

---

## AC Checklist

Populate from the behavioral spec before starting. Order determines implementation sequence.

| # | Acceptance Criterion | Status | Notes |
|---|---|---|---|
| 1 | [Given/When/Then from spec] | Pending | |
| 2 | ... | ... | ... |

**Status values:** Pending → Implemented → Skipped. Use "Skipped" if the behavior already exists (note why).

---

## Feedback Log

Track discoveries that need to flow back to `clarifying-intent`.

| # | Discovery | Type | Action |
|---|---|---|---|
| 1 | [what you found] | Ambiguous AC / Missing AC / Impossible constraint / Spec contradiction / Slice map impact | [what to update in the spec or slice map] |

---

## Implementation Summary

Produced at the end of an implementation session.

```markdown
### Implementation Summary: [story title]

**ACs Addressed**: [count] / [total]

**Files Changed**
- [file path]: [what changed] — [AC #]
- ...

**Design Decisions**
- [decision]: [why]
- ...

**Spec Feedback**
- [update needed, or "None — spec was accurate"]

**Slice Map Impact** (only when working through a slice map)
- [changes needed to upcoming slices, or "None — slice map holds"]

**Existing Test Suite Status**: All green / [N] failures / No tests exist
```
