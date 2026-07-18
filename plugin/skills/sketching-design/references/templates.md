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

**Modern Practice (researched)** — *always include*
- [1–3 lines: what current practice recommends for this story's problem, with date + source — a `.praxis/stack-profile.md` entry or fresh research (Workflow step 2). Gathered before the codebase was read.]

**Divergence & Recommendation** — *include whenever the proposed direction departs from a project convention or from the researched baseline above. Omit only when direction, conventions, and research all agree.*
- Researched `<lang/framework>` practice: [1–2 sentences on the current idiom]
- Current codebase: [1–2 sentences on the closest analog, or "no analog exists — this is new"]
- Chosen direction & why: [which input won — taste profile / project consistency — and the reasoning at this posture: conform / adopt-now / defer-as-spike. A direction that differs from the researched practice must say so here, unprompted. The final call is handed to the caller, not taken here.]

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
- Load-bearing for a `driving-tdd` consumer reading this sketch as optional input: the **Change Map**, the **First Test** (with its layer), and any **Derived ACs**. The rest — Approach, Existing Patterns, Modern Practice, Divergence & Recommendation, Risks — is advisory context.
- Feedback loop: if implementation reveals the sketch was wrong, update or discard it.

**Stack Profile Update** — *include only when fresh research was done (cache miss, stale entry, or stack change — Workflow step 2). The caller persists these entries into `.praxis/stack-profile.md`; this skill holds no Write grant.*
- `[topic]` ([YYYY-MM]): [1–2 line finding] — [source]

---

## Section Guide

| Section | When to include | Purpose |
| --- | --- | --- |
| Derived ACs / Assumptions | Only when the spec had no acceptance criteria (Input preflight branch 2) | Make inferred behavior explicit and confirmable before it hardens into tests |
| Change Map | Always | Know which files to open before writing code |
| Existing Patterns | Always | Prevent reinventing what the codebase already does |
| Modern Practice (researched) | Always | Record the dated, sourced researched baseline (Workflow step 2) so downstream stages and the caller see what current practice recommends |
| Divergence & Recommendation | Whenever the proposed direction departs from a project convention or from the researched baseline (Workflow step 5) | Explain, unprompted, which input won (taste profile / project consistency) and why; hand the final adopt-vs-conform call to the caller |
| Stack Profile Update | Only when fresh research was done (Workflow step 2) | Give the caller the dated entries to persist into `.praxis/stack-profile.md` |
| Approach | When direction is non-obvious | State the key decision in 2–5 sentences |
| First Test | Always | Bridge directly into TDD — name the test's layer so the design→TDD handoff is lossless |
| Risks / Spikes | When uncertainty exists | Flag what might force a pivot |
| What NOT to Change | When spec has scope-out or "must not break" items | Explicit boundaries |
| Handoff to implementation | When handing off to a TDD stage | Point implementation at the first test and the feedback loop |
