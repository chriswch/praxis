# Verify and Adapt — Reference Templates

Use these as structure references. Adapt or omit sections based on the story's complexity.

---

## Verification Summary

Produced at the end of verifying-and-adapting for medium+ tasks.

```markdown
### Verification: [story title]

**Spec**: [reference to the behavioral spec]

**Acceptance Check**

| # | Acceptance Criterion | Test | Evidence (command run → observed result) | Verdict | Notes |
|---|---|---|---|---|---|
| 1 | [AC from spec] | [test name] | `pytest tests/test_x.py::test_y` → `1 passed`; `curl -s :8080/health` → `200 {"ok":true}` | Match / Refined / Diverged / Gap | [brief note if not Match] |
| 2 | ... | ... | [command → result, or "not exercisable: <reason>; covered by <test> → <output>"] | ... | ... |

> The Evidence cell is mandatory: the exact command you ran and its verbatim result. Only when a behavior genuinely cannot be exercised may it read `not exercisable: <reason>` plus the covering test's actual output — never a bare "passes."

**"What Must Not Break" Check**
- [item from spec]: Confirmed via `<command run>` → `<result>` / Regression found: `<evidence>`
- ...

**Suite Status**: `<test command>` → `<verbatim final summary line from the runner>` (e.g. `pytest -q` → `142 passed in 3.1s`). Never "all green" without the command and its output.

**Spec Updates**
- [AC #]: [what changed and why], or "None — spec was accurate"

**Emerged Design Knowledge**
- [pattern / convention / decision]: [why it matters for future slices]
- ...

**Slice Impact** (omit if single-slice)
- S-[id] [title]: No impact / Unblocked / Simplified / Complicated / Invalidated — [brief note]
- ...

**Routing**: Done / Next slice: [S-id title] / Rework: [what's missing] / Escalate: [why]
```

---

## Section Guide

| Section | When to include | Purpose |
|---|---|---|
| Acceptance Check | Always (medium+) | Execute each AC's observable behavior, record the evidence, and confirm a passing test covers it |
| "What Must Not Break" Check | When spec has this section | Confirm no regressions, citing the check run |
| Suite Status | Always | The exact command run and the runner's verbatim summary line |
| Spec Updates | When any AC was refined or diverged | Keep spec in sync with reality |
| Emerged Design Knowledge | When TDD surfaced reusable insights | Feed knowledge forward to next slices |
| Slice Impact | Multi-slice features only | Flag downstream effects |
| Routing | Always | Explicit next action |

---

## Verdict Definitions

| Verdict | Meaning | Action |
|---|---|---|
| **Match** | Implementation matches spec exactly | None |
| **Refined** | Faithful to intent, but details evolved (wording, status codes, validation messages) | Update spec AC wording to match reality |
| **Diverged** | Implementation deviated from spec (constraint impossible, dependency forced different approach) | Document *why*, rewrite the AC |
| **Gap** | AC not fully covered — test is missing, incomplete, or tests the wrong thing | Route to rework (back to driving-tdd) |

---

## Spec Update Convention

When updating a spec after verification, annotate inline rather than creating a separate document:

- **Refined AC**: Update the Given/When/Then wording to match implementation. Append: `(Refined during implementation: [brief reason])`.
- **Diverged AC**: Rewrite the AC to match what was built. Append: `(Diverged during implementation: [reason])`.
- Keep the original wording in version control; don't clutter the spec with strikethroughs or change logs.
