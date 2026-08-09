# TDD Loop — Reference Templates

Use these as structure references. Adapt to fit the project's conventions.

---

## AC Checklist

Populate from the behavioral spec before starting the first cycle. Order determines implementation sequence.

| # | Acceptance Criterion | Test Name | Test Layer | Red Evidence (command → verbatim failure) | Status | Notes |
|---|---|---|---|---|---|---|
| 1 | [Given/When/Then from spec] | [descriptive behavior name] | unit / integration / contract / e2e | `pytest tests/test_x.py::test_y` → `AssertionError: ...` | Pending | |
| 2 | ... | ... | ... | ... | ... | ... |

**Test Layer** is chosen per AC in step 2 (Order the ACs) from the boundary the AC exercises; record a derived placement here as a Note when no sketch was provided.

**Status values:** Pending → Red → Green → Refactored → Done. Use "Skipped" if the behavior already exists (note why).

**Red Evidence is mandatory before Green.** Record the exact command run and the verbatim failure line(s) the first time each AC's test fails. An AC with an empty Red Evidence cell has not been through Red and must not be marked Green — this is the anti-gaming gate (see the skill's Guardrails).

---

## Feedback Log

Track discoveries that need to flow back upstream — mostly to `clarifying-intent`; a **Design divergence** routes to `sketching-design` / the caller instead.

| # | Discovery | Type | Action |
|---|---|---|---|
| 1 | [what you found] | Ambiguous AC / Missing AC / Impossible constraint / Spec contradiction / Slice map impact / Design divergence / Deferred test candidate | [what to update, and where it routes — spec or slice map for AC gaps; `sketching-design` / caller for a Design divergence; the deferred register for a Deferred test candidate] |

---

## Session Summary

Produced at the end of a TDD session.

```markdown
### TDD Summary: [story title]

**Status**: complete | needs-design: [reason] | blocked: [reason]
(Machine-readable routing line — always the first line. `needs-design` covers both re-route reasons: step 1's Case B, where placement must be decided before the first test, and step 5's wrong data shape, found once the code showed it. Either way an orchestrator re-routes to `sketching-design` and re-enters here; state which reason. `blocked` means a `## Feedback` gap stopped the session; an orchestrator hard-stops on it.)

**ACs Completed**: [count] / [total]

**Tests Added**
- [test file]: [test name] — [AC #]
- ...

**Design Decisions (emerged during refactor)**
- [decision]: [why — what the code told you]
- ...

**Deferred Test Candidates** (cases the test posture didn't earn a test for)
- [behavior] — [where its test would live] — [why deferred]
- ... (or "None")

(The caller appends these to `.praxis/<slug>/deferred.md`; the user picks at the ship gate.)

**Spec Feedback**
- [update needed, or "None — spec was accurate"]

**Slice Map Impact** (only when working through a slice map)
- [changes needed to upcoming slices, or "None — slice map holds"]

**Suite Status**: All green / [N] failures remaining
```
