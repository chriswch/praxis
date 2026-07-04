# TDD Loop — Reference Templates

Use these as structure references. Adapt to fit the project's conventions.

---

## AC Checklist

Populate from the behavioral spec before starting the first cycle. Order determines implementation sequence.

| # | Acceptance Criterion | Test Name | Red Evidence (command → verbatim failure) | Status | Notes |
|---|---|---|---|---|---|
| 1 | [Given/When/Then from spec] | [descriptive behavior name] | `pytest tests/test_x.py::test_y` → `AssertionError: ...` | Pending | |
| 2 | ... | ... | ... | ... | ... |

**Status values:** Pending → Red → Green → Refactored → Done. Use "Skipped" if the behavior already exists (note why).

**Red Evidence is mandatory before Green.** Record the exact command run and the verbatim failure line(s) the first time each AC's test fails. An AC with an empty Red Evidence cell has not been through Red and must not be marked Green — this is the anti-gaming gate (see the skill's Guardrails).

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

**Status**: complete | blocked: [reason]
(Machine-readable routing line — always the first line. `blocked` means a `## Feedback` gap stopped the session; an orchestrator hard-stops on it.)

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
