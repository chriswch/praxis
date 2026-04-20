# Verify and Adapt — Reference Templates

Use these as structure references. Adapt or omit sections based on the story's complexity.

---

## Verification Summary

Produced at the end of verifying-and-adapting for medium+ tasks.

```markdown
### Verification: [story title]

**Spec**: [reference to the behavioral spec]

**Acceptance Check**

| # | Acceptance Criterion | Test | Verdict | Notes |
|---|---|---|---|---|
| 1 | [AC from spec] | [test name] | Match / Refined / Diverged / Gap | [brief note if not Match] |
| 2 | ... | ... | ... | ... |

**"What Must Not Break" Check**
- [item from spec]: Confirmed / Regression found
- ...

**Suite Status**: All green / [N] failures

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
| Acceptance Check | Always (medium+) | Confirm each AC is covered by a passing test |
| "What Must Not Break" Check | When spec has this section | Confirm no regressions |
| Suite Status | Always | Final test suite state |
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
