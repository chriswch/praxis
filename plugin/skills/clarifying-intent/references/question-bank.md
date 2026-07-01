# Question Bank

Prefer a small batch (3–7) of the highest-leverage questions, then iterate. Use Phase A questions before any code reading; move to Phase B once Phase A is confirmed.

## Table of Contents

- Phase A — Product Space
  - Generic (start here)
  - Feature / product
  - Bug / incident (product side)
  - Data / analytics
  - Writing / communication
- Phase B — System Space
  - Generic (start here)
  - Engineering task / refactor
  - Integration / API
  - Bug / incident (system side)

---

## Phase A — Product Space

These questions clarify *who*, *why*, and *what success looks like* — never *how*. Do not read code while asking these.

### Generic (start here)

**Goal and success**
- What outcome are you trying to achieve (not the solution)?
- What does "success" look like, and how will you measure it?
- What is the definition of done?

**Audience and context**
- Who is this for (users/stakeholders), and what problem are they experiencing?
- What is the current state / baseline today?
- Why now (urgency, deadline, triggering event)?

**Hypothesis and validation**
- What do we believe will happen if we ship this, and why?
- What's the cheapest way to find out if we're wrong before building?
- What would convince you to abandon this idea?

**Scope and sizing** (triage only — detailed slicing and sequencing belong to `slicing-stories`)
- What is in scope vs out of scope for this effort?
- What are the must-haves vs nice-to-haves?
- Is this one user-facing behavior (story-sized), or several that could each ship independently (feature-sized → hand to `slicing-stories`)?

**Constraints**
- What constraints matter (time, budget, platform, policy/compliance, performance, security/privacy)?
- Are there required tools/stack/approvals?

**Examples**
- Can you provide a concrete example (input/output, screenshot, mock, error message, sample doc)?
- Are there "bad outcomes" we must avoid?

### Feature / product

- Who is the primary user persona and their key job-to-be-done?
- What are the primary user flows (happy path) and top edge cases?
- What is the rollout/release expectation (phased, beta, flags, backwards compatibility)?
- What analytics/telemetry would confirm this is being used and valued?

### Bug / incident (product side)

- What is expected vs actual user-facing behavior?
- What is the impact (users affected, severity, urgency)?
- Has this happened before? Are there workarounds users are already using?

### Data / analytics

- What decision will this analysis support?
- What metric definitions should be used (exact formula, inclusions/exclusions)?
- What time range, granularity, segments, cohorts matter?
- What output format is needed (query, chart, narrative, dashboard)?

### Writing / communication

- Who is the audience and what do they already know?
- What is the goal (inform, persuade, align, decide) and the single key takeaway?
- What constraints exist (length, tone, format, deadline)?
- What inputs must be incorporated (links, notes, quotes), and what must be avoided?

---

## Phase B — System Space

These questions clarify *where the change lands* and *what must not break*. Read code only to observe current behavior — never to evaluate implementation patterns, propose abstractions, or sketch designs.

### Generic (start here)

**Where it lands**
- Which top-level system flows does this change participate in?
- What are the entry points (user actions, API calls, scheduled jobs) that exercise this behavior?
- What systems or services produce or consume the data involved?

**Current behavior** (ask after reading the relevant modules)
- What does the system currently do at the point of this change?
- What inputs does it accept? What outputs does it produce? What side effects?
- What other subsystems depend on this behavior?

**Regression boundaries**
- What existing behavior must remain unchanged?
- What user flows or contracts touch this code path?
- Are there existing tests or contracts that codify current correct behavior?

**Observable signals**
- If this change worked correctly in production, how would someone running the code know?
- What user-visible change confirms it?
- What log line, metric, or system-level effect confirms it?
- What does failure look like — silent, loud, partial?

### Engineering task / refactor

- What is the desired end-state behavior (what should be different / equivalent afterward)?
- What parts must remain stable (APIs, behavior, performance)?
- What is the migration/rollout plan, if any?

**Behavioral edge cases from system knowledge** (ask after observing current behavior)
- Does the current system have implicit behaviors that the spec doesn't mention but this change would affect? (cron jobs, notifications, cascading logic)
- What happens at the boundaries when this behavior changes? (a field used for multiple purposes, a value other subsystems depend on)
- Does the proposed change fully address the stated problem, or does it solve a narrower one?

### Integration / API

- What systems are involved and who owns them?
- What is the data model and mapping (fields, types, required/optional)?
- What authentication/authorization model is required?
- What are the failure modes and retry/idempotency expectations?
- What are the performance limits (rate limits, payload size, latency)?

### Bug / incident (system side)

- Where does the bug surface (which entry point, which user flow)?
- What logs, stack traces, or telemetry are available?
- What changed recently (deploys, config, data, dependencies)?
- How is the bug reproduced, and how often?
