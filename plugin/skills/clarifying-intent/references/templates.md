# Templates

Use these templates to confirm shared understanding. Choose by triage:

- **Feature Brief**: feature-sized input. Captures Phase A (product space) understanding, just enough to split into stories. Hand off to `slicing-stories`. Phase B runs per-slice on subsequent invocations.
- **Story-Level Behavioral Spec**: story-sized input or a single slice. Combines Phase A and Phase B outputs. Acceptance criteria are the primary artifact — they become test cases in TDD.

Each template marks which phase produces each section. Sections are guidance — include only what surfaced in conversation. Empty sections add noise; delete them.

## Table of Contents

- Feature Brief (Phase A artifact)
- Story-Level Behavioral Spec (tiered — Product & Behavior first, System Space appended)
  - Tier 1 — Product & Behavior
  - Tier 2 — System Space (engineering)
  - Decisions, Unknowns & Handoff
- Supplementary Tables (Feature-Level Only)

---

## Feature Brief (Phase A artifact)

Use for feature-sized inputs. Phase B does NOT run on a Feature Brief — it runs per-slice after `slicing-stories`.

**Sizing**: `feature` · **Status**: `proceed`
(Machine-readable routing header — always the first lines of the artifact. A Feature Brief is by definition `feature`-sized. Status is `open-questions` or `spec-issue` instead when the skill stops early; see the Output contract.)

**Problem / Why Now** (Phase A)
- What's the problem, who has it, why address it now?

**Background** (Phase A)
- Current state — what exists today
- Pain points — what's wrong with the current state
- Considered options — what alternatives have been weighed (and rejected, with brief reason)
- Stakeholders — who cares, who decides, who's affected

**User Context** (Phase A)
- Primary persona and the key job-to-be-done
- Trigger context — what makes them reach for this
- Current workaround — how they solve this today, if at all

**Goal & Success Criteria** (Phase A)
- What does done look like?
- How will success be measured? (outcome metrics, not just feature delivery)

**Hypothesis & Validation Plan** (Phase A)
- Hypothesis: we believe [users/system] will [behavior/outcome] because [reasoning]
- Validation method: how this gets confirmed — demo, interview, prototype, observation, telemetry
- Kill criterion: what observation would convince us the hypothesis is wrong

**Scope** (Phase A)
- In: ...
- Out: ... (critical — prevents scope creep; for each Out item, briefly note why)

**Constraints & Risks** (Phase A — only what surfaced)
- ...

**What Must Not Break** (Phase A — high-level; refined per slice)
- Existing user flows, contracts, SLAs that must remain intact during this work

**Decisions & Rationale** (Phase A)
- Decision: ...
- Options considered: ...
- Why this one: ...

(Captures the "we considered X but chose Y because Z" reasoning so a future reader can understand the choices.)

**Open Questions** (Phase A)
- (Blocking) ...
- (Deferrable — will resolve at story level) ...

**Downstream Handoff**
- Split into vertical slices via `slicing-stories`, which owns slice ordering and the walking-skeleton-first heuristic.
- Each slice returns to this skill for a Story-Level Behavioral Spec — Phase A is brief; Phase B does the bulk.

---

## Story-Level Behavioral Spec (Phase A + Phase B, tiered)

Use for story-sized inputs. Acceptance criteria are the primary output — they become test cases.

Write it in two tiers, in order, **never interleaved**:

- **Tier 1 — Product & Behavior**: business-readable. A PM (or any non-engineer) reads this and understands the feature. It leads with who / why / what-done-looks-like and the Given/When/Then acceptance criteria in business language.
- **Tier 2 — System Space (engineering)**: appended below the fold, clearly delimited. The system detail downstream `sketching-design` and TDD consume — observable signals, what must not break, non-functional constraints.

**Guardrail:** the engineering tier is *deferred/layered, not omitted*. Delete a section only when it genuinely has no content — never drop the acceptance criteria or the system-space sections just because they read as technical. The self-check "a developer can write failing tests from the acceptance criteria alone" must still hold.

**Sizing**: `small` | `story` (per triage) · **Status**: `proceed`
(Machine-readable routing header — always the first lines of the artifact. `small` routes an orchestrator straight to TDD; `story` routes through design first. Status is `open-questions` or `spec-issue` instead when the skill stops early.)

### Tier 1 — Product & Behavior

**Problem** (Phase A — 1–2 sentences)
- ...

**User Context** (Phase A — brief; inherit from Feature Brief if available)
- Who, in what context, doing what.

**Scope** (Phase A)
- In: ...
- Out: ...

**Acceptance Criteria** (behavior in Given/When/Then form, business language)
- Happy path: Given ..., when ..., then ...
- Error / edge case: Given ..., when ..., then ...
- Boundary: Given ..., when ..., then ...

At minimum: one happy path and one error/edge case. Add boundary cases when the domain involves limits, thresholds, or ranges. Describe observable behavior (what the system does), not implementation (how) — the "how" is `sketching-design`'s job downstream.

### Tier 2 — System Space (engineering — appended, never interleaved)

**Observable Signals** (Phase B — how a person running the code knows it works)
- UI: what the user sees on screen when this works
- Logs / metrics: what log lines or metric changes confirm the behavior
- System behavior: what side effects in other subsystems prove the change happened

Concrete enough that someone running the app could verify them. Telemetry queries can be added later; describe the signal in prose for now.

**What Must Not Break** (Phase B)
- Existing behavior, flows, contracts, integration points that must remain intact.

**Constraints** (Phase A or B — only if applicable to this slice)
- Performance: ...
- Accessibility: ...
- Security / privacy: ...

(These become non-functional test criteria.)

### Decisions, Unknowns & Handoff

**Decisions & Rationale** (either phase — note which; product decisions concern Tier 1 choices, engineering decisions Tier 2)
- Decision: ...
- Options considered: ...
- Why this one: ...

**Open Unknowns**
- ... (classify as blocking or deferrable; carry deferrable unknowns into implementation — deciding too early is waste)

**Downstream Handoff**
- Lightweight design sketch (`sketching-design`) when the implementation path is non-obvious: which files/modules the change lives in, what existing pattern to follow, any new dependencies. This belongs to the next skill, not this one.
- TDD: acceptance criteria above become test cases. Red → Green → Refactor.
- Feedback loop: if implementation reveals the spec was wrong or incomplete, return here and update before continuing.

---

## Supplementary Tables (Feature-Level Only)

For Feature Briefs with many open threads to track. For story-level specs, inline unknowns and risks directly — a separate tracking table is overkill.

### Open Questions Log

| Question | Status | Owner | Notes |
| --- | --- | --- | --- |
| ... | Open / Answered | ... | ... |

### Lightweight Risk Register

| Risk | Impact | Likelihood | Mitigation | Signal |
| --- | --- | --- | --- | --- |
| ... | High / Med / Low | High / Med / Low | ... | ... |
