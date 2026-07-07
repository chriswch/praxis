# Templates

Use this template for the design sketch output. Adapt or omit sections based on the story's complexity — the template is a guide, not a form to fill completely.

---

## Design Sketch

### Design Sketch: [story title from spec]

**Status**: `sketch`
(Machine-readable routing line. The `skipped` and `spec-issue` outcomes are returned as prose per the Output contract, not via this template.)

**Derived ACs / Assumptions** — *confirm before TDD*
(Include only when the spec arrived without acceptance criteria — Input preflight branch 2. Omit entirely otherwise.)
- AC-D1: [Given/When/Then behavior inferred from the request + codebase]
- AC-D2: ...
- Assumption: [what you took as given to scope this; the user/TDD confirms before these harden into tests]

**Change Map**
- `path/to/file` — [what changes here and why]
- `path/to/other` — [what changes here and why]

**Existing Patterns**
- Follows the pattern in `path/to/analog` where [brief description].
- Extends the existing `TypeName` with [what].

**Divergence & Recommendation** — *include only when the scoped modern-idiom check ran a full assessment (Workflow step 3, trigger (a) no-analog or (b) behind-idiom). Omit otherwise; the common consistent-with-codebase case needs no section.*
- Modern `<lang/framework>` practice: [1–2 sentences on the current idiom]
- Current codebase: [1–2 sentences on the closest analog, or "no analog exists — this is new"]
- Recommendation for this posture: [conform / adopt-now / defer-as-spike] — the modernize-vs-conform decision is handed to the caller, not taken here.

**Approach**
[2–5 sentences. The key decision. The core data structure choice, if any. Why this direction over the obvious alternative, if non-obvious.]

**First Test**
- File: `path/to/test/file`
- Layer: [unit / integration / contract / e2e] — the boundary this first test exercises
- Test: [description of the first test case, derived from the spec's happy-path AC]

**Risks / Spikes**
- [Risk]: [what might invalidate this approach]
  → Spike: [time-boxed experiment to resolve, if needed]

(Omit this section if no meaningful risks identified.)

**What NOT to Change**
[Explicit boundaries from the spec's "scope out" and "what must not break" sections.]

**Handoff to implementation** (include when handing off to a TDD stage)
- Implementation starts from the First Test above (with its named layer); the spec's acceptance criteria become the remaining test cases. Test ordering and refactoring belong to the TDD loop — the sketch does not prescribe them.
- Load-bearing for a `driving-tdd` consumer reading this sketch as optional input: the **Change Map**, the **First Test** (with its layer), and any **Derived ACs**. The rest — Approach, Existing Patterns, Divergence & Recommendation, Risks — is advisory context.
- Feedback loop: if implementation reveals the sketch was wrong, update or discard it.

---

## Section Guide

| Section | When to include | Purpose |
| --- | --- | --- |
| Derived ACs / Assumptions | Only when the spec had no acceptance criteria (Input preflight branch 2) | Make inferred behavior explicit and confirmable before it hardens into tests |
| Change Map | Always | Know which files to open before writing code |
| Existing Patterns | Always | Prevent reinventing what the codebase already does |
| Divergence & Recommendation | Only when the scoped modern-idiom check ran a full assessment — no codebase analog exists, or the closest analog is behind current idiom (Workflow step 3) | Record the modern-vs-current comparison and hand the modernize-vs-conform call to the caller; omit for the common consistent-with-codebase case |
| Approach | When direction is non-obvious | State the key decision in 2–5 sentences |
| First Test | Always | Bridge directly into TDD — name the test's layer so the design→TDD handoff is lossless |
| Risks / Spikes | When uncertainty exists | Flag what might force a pivot |
| What NOT to Change | When spec has scope-out or "must not break" items | Explicit boundaries |
| Handoff to implementation | When handing off to a TDD stage | Point implementation at the first test and the feedback loop |
