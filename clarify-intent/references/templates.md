# Templates

Use these templates when you want a consistent artifact to confirm shared understanding. Choose the template that matches the triage level from the workflow.

## When To Use Which

- **Feature Brief**: Use for large / epic-sized inputs that will be split into multiple stories. Captures goals, boundaries, and slicing strategy. Hand off to `agile-issue-splitter` afterward.
- **Story-Level Behavioral Spec**: Use for small/medium inputs (single story or task). Acceptance criteria are the primary artifact — they become test cases in the downstream TDD step.

---

## Feature Brief

Use for feature-level clarification. Captures "what and why" — just enough to understand the feature and split it into stories. Keep it lean; detailed specs happen at story level.

**Problem / Why Now**
- What's the problem, who has it, and why address it now?

**Goal & Success Criteria**
- What does done look like?
- How will you measure success?

**Scope**
- In: ...
- Out: ... (critical — prevents scope creep)

**Constraints & Risks** (only include what surfaced during conversation)
- ...

**Open Questions**
- (Blocking) ...
- (Deferrable — will resolve at story level) ...

**Downstream Handoff**
- Split into vertical slices via `agile-issue-splitter`.
- Pick the highest-value or highest-risk slice first.
- Produce a Story-Level Behavioral Spec for that slice before implementing.

---

## Story-Level Behavioral Spec

Use for story-level clarification. The acceptance criteria are the primary output — they translate directly into test cases for TDD.

**Problem** (1–2 sentences)
- ...

**Scope**
- In: ...
- Out: ...

**Acceptance Criteria** (Given / When / Then)
- Happy path: Given ..., when ..., then ...
- Error / edge case: Given ..., when ..., then ...
- Boundary: Given ..., when ..., then ...
(At minimum: one happy path and one error/edge case. Add boundary cases when the domain involves limits, thresholds, or ranges.)

**Constraints** (if applicable)
- Performance: ...
- Accessibility: ...
- Security / privacy: ...
(Only include if relevant to this slice. These become non-functional test criteria.)

**What Must Not Break**
- ... (existing behavior / flows / contracts that need regression protection)

**Open Unknowns**
- ... (classify as blocking or deferrable; carry deferrable unknowns into implementation — deciding too early is waste)

**Downstream Handoff**
- Lightweight design sketch: identify which files/modules the change lives in, pick the approach that fits existing patterns, note any new dependencies. This is a direction, not a blueprint — TDD's refactor step is where the real design emerges.
- Then TDD: acceptance criteria above become test cases. Red → Green → Refactor.
- **Feedback loop**: If implementation reveals the spec was wrong or incomplete, return here and update this spec before continuing. The spec is a living artifact, not a contract.

---

## Supplementary Tables (Feature-Level Only)

Use these tables when working on Feature Briefs that have many open threads to track. For story-level specs, inline unknowns and risks directly in the spec — a separate tracking table is overkill.

### Open Questions Log

| Question | Status | Owner | Notes |
| --- | --- | --- | --- |
| ... | Open / Answered | ... | ... |

### Lightweight Risk Register

| Risk | Impact | Likelihood | Mitigation | Signal |
| --- | --- | --- | --- | --- |
| ... | High / Med / Low | High / Med / Low | ... | ... |
