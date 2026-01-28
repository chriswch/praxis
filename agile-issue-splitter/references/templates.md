# Templates and Checklists

Use these templates to keep issues self-contained, small, testable, and parallelizable. Match the fields to `references/issue-bundle.spec.md`.

## Definition of Ready (DoR) (apply to User Stories; adapt for Bugs/Tasks)

- Problem and intended outcome are clear.
- Acceptance criteria are testable (no vague words like “fast”, “simple” without thresholds).
- Dependencies are captured in `blocked_by` (and only hard blockers are listed).
- Non-functional requirements (accessibility, privacy, performance, reliability) are captured as acceptance criteria or explicit tasks.
- Estimate is present and not wildly larger than a sprint-sized item.
- Open questions are either answered or logged in `meta.open_questions` (blockers flagged).

## Definition of Done (DoD) (default)

- Acceptance criteria met and verified.
- Automated tests added/updated when appropriate.
- Observability added/updated when appropriate (logs/metrics/tracing/alerts).
- Docs/runbooks updated when appropriate.
- No known P0/P1 regressions introduced; rollout plan executed if needed (flags, staged release).

## User Story Template

```json
{
  "id": "US-001",
  "type": "user_story",
  "title": "User can reset password via email",
  "description": "Allow a signed-out user to request a password reset email and set a new password using a one-time link. Include rate limiting and clear error states. Do not reveal whether an email is registered.",
  "priority": "P1",
  "status": "backlog",
  "labels": ["area/backend", "area/frontend", "area/qa"],
  "epic_id": "E-001",
  "workstream": "fullstack",
  "blocked_by": [],
  "estimate": { "method": "story_points", "value": 5 },
  "persona": "Signed-out user",
  "story": "As a signed-out user, I want to reset my password via email so that I can regain access to my account.",
  "value": "Reduce support burden and account lockouts.",
  "acceptance_criteria": [
    "Given I am signed out, when I request a password reset for a registered email, then I receive an email with a one-time reset link within 5 minutes.",
    "Given I request a password reset for an unregistered email, when the request completes, then the UI shows the same success message as for registered emails.",
    "Given I open a valid reset link, when I set a new password that meets policy, then I can sign in with the new password and the link cannot be reused."
  ],
  "definition_of_done": [
    "Unit/integration tests cover token validation and rate limiting",
    "Manual QA verifies common edge cases (expired token, reused token)"
  ]
}
```

## Task Template

```json
{
  "id": "TASK-001",
  "type": "task",
  "title": "Add rate limiting for password reset requests",
  "description": "Implement per-IP and per-account rate limits for password reset requests to reduce abuse. Ensure limits are configurable and observable.",
  "priority": "P1",
  "status": "backlog",
  "labels": ["area/backend", "kind/ops"],
  "epic_id": "E-001",
  "parent_id": "US-001",
  "workstream": "backend",
  "blocked_by": [],
  "estimate": { "method": "ideal_hours", "value": 6 },
  "task_kind": "implementation",
  "deliverable": "Merged PR with rate limiting enabled and documented config knobs",
  "verification": "Run integration tests; verify metrics/logs show throttling when exceeding limits",
  "definition_of_done": [
    "Configurable limits documented",
    "Metrics/alerts added for throttling events"
  ]
}
```

## Bug Template

```json
{
  "id": "BUG-001",
  "type": "bug",
  "title": "Password reset link sometimes opens blank page on Safari",
  "description": "Some users report a blank page when opening the reset link in Safari. The server receives the request, but the frontend fails to render the reset form.",
  "priority": "P1",
  "status": "backlog",
  "labels": ["area/frontend", "area/qa"],
  "epic_id": "E-001",
  "parent_id": "US-001",
  "workstream": "frontend",
  "blocked_by": [],
  "estimate": { "method": "ideal_hours", "value": 4 },
  "severity": "S2",
  "environment": "Safari 17.x on macOS 14, app v1.2.3",
  "steps_to_reproduce": [
    "Open Safari",
    "Paste a valid password reset link from email",
    "Observe blank page"
  ],
  "expected": "Reset form renders with new password inputs and submit button.",
  "actual": "Blank page (no visible UI).",
  "acceptance_criteria": [
    "Given Safari 17.x, when I open a valid reset link, then the reset form renders and can submit successfully.",
    "Given the issue is fixed, when CI runs, then an automated test covers the failing route/render path."
  ],
  "definition_of_done": [
    "Regression test added",
    "Verified on Safari and at least one Chromium browser"
  ]
}
```

## Story Slicing Heuristics (INVEST-friendly)

- Slice **vertically** (end-to-end behavior) instead of by layer (frontend-only/backend-only).
- Start with a “thin happy path”, then add:
  - validation/error states
  - edge cases
  - permissions/roles
  - performance/accessibility
  - telemetry/analytics
- If a story is too big: split by persona, workflow step, data subset, or capability tier (read → create → edit → bulk).
- When unknowns are material: add a timeboxed `task_kind: "spike"` task and keep assumptions explicit.

## Parallel Execution Heuristics

- Prefer separate tasks per workstream (backend/frontend/qa/infra/docs) that can proceed with mocked contracts.
- Define contracts early (API shapes, events, data models) to reduce blocking.
- Use `blocked_by` only for hard prerequisites; otherwise rely on coordination and interface contracts.

