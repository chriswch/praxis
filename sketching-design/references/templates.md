# Templates

Use this template for the design sketch output. Adapt or omit sections based on the story's complexity — the template is a guide, not a form to fill completely.

---

## Design Sketch

### Design Sketch: [story title from spec]

**Change Map**
- `path/to/file` — [what changes here and why]
- `path/to/other` — [what changes here and why]

**Existing Patterns**
- Follows the pattern in `path/to/analog` where [brief description].
- Extends the existing `TypeName` with [what].

**Approach**
[2–5 sentences. The key decision. The core data structure choice, if any. Why this direction over the obvious alternative, if non-obvious.]

**First Test**
- File: `path/to/test/file`
- Test: [description of the first test case, derived from the spec's happy-path AC]

**Risks / Spikes**
- [Risk]: [what might invalidate this approach]
  → Spike: [time-boxed experiment to resolve, if needed]

(Omit this section if no meaningful risks identified.)

**What NOT to Change**
[Explicit boundaries from the spec's "scope out" and "what must not break" sections.]

**Downstream Handoff**
- TDD: acceptance criteria from the spec become test cases. Red → Green → Refactor.
- Feedback loop: if TDD reveals the sketch was wrong, update or discard it.

---

## Section Guide

| Section | When to include | Purpose |
| --- | --- | --- |
| Change Map | Always | Know which files to open before writing code |
| Existing Patterns | Always | Prevent reinventing what the codebase already does |
| Approach | When direction is non-obvious | State the key decision in 2–5 sentences |
| First Test | Always | Bridge directly into TDD |
| Risks / Spikes | When uncertainty exists | Flag what might force a pivot |
| What NOT to Change | When spec has scope-out or "must not break" items | Explicit boundaries |
| Downstream Handoff | Always | Connect to TDD and feedback loop |
