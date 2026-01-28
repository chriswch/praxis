---
name: agile-issue-splitter
description: Decompose product features/behaviors into an execution-ready Agile/Scrum backlog of user stories, tasks, and bugs with clear acceptance criteria, dependencies, and prioritization; use when turning PRDs/spec notes/feature lists into trackable issues for Jira/Linear/GitHub and parallel team execution.
---

# Agile Issue Splitter

## Overview

Turn a raw list of features and behaviors into a self-contained, execution-ready issue backlog (User Story / Task / Bug) that supports parallel work and deterministic planning.

## Default Output (Issue Bundle)

Produce a single JSON object called an "Issue Bundle" that conforms to `references/issue-bundle.spec.md`.

- Prefer emitting JSON in a fenced `json` block.
- If writing to disk, name it `issue-bundle.json`.
- Keep every issue self-contained: a new team member should be able to implement it without the original feature list.

## Workflow

1. Intake and clarify (only if needed).
   - Restate the feature list in normalized bullets.
   - Ask up to 7 blocker questions; otherwise proceed with explicit assumptions in `meta.assumptions`.

2. Normalize features into atoms.
   - Split combined requirements (“A and B”) into separate behaviors.
   - Capture non-functional requirements (performance, reliability, accessibility, security/privacy) explicitly.

3. Create epics (optional but recommended).
   - Group related behaviors into epics with an objective and exit criteria.

4. Create user stories (value slices).
   - Write stories as vertical slices that can ship independently.
   - Enforce INVEST; split until each story is small enough for one sprint.
   - Add testable acceptance criteria (Given/When/Then).

5. Derive tasks (implementation slices).
   - Create tasks only when they represent discrete work items (setup, infra, refactor, test automation, docs, analytics, rollout).
   - Link tasks to a user story with `parent_id` whenever applicable.
   - Bias toward parallelism: prefer multiple independent tasks over one large task.

6. Capture bugs (defects).
   - Use Bug issues only for deviations from expected behavior.
   - Require reproduction steps, expected vs actual, environment, and severity.

7. Add dependencies and plan parallel execution.
   - Use `blocked_by` to represent hard prerequisites only.
   - Avoid cross-workstream dependencies when possible; split stories/tasks to reduce blocking.

8. Prioritize and sequence.
   - Assign `priority` (P0–P3) based on user impact and risk.
   - Order issues within each epic so the earliest items unlock later ones.

9. Run quality gates.
   - Ensure every User Story and Bug has acceptance criteria.
   - Ensure every issue has a clear verification step and definition of done.
   - If producing JSON, validate with `scripts/validate_issue_bundle.py`.

## Classification Rules

- **User Story**: Delivers user-visible value; describable as “As a … I want … so that …”; has acceptance criteria; potentially shippable.
- **Task**: Engineering work that enables/implements stories or improves maintainability; may be operational/spike; has a concrete deliverable and verification.
- **Bug**: Current behavior violates expected behavior; includes repro steps and impact; not a feature request.

## References and Tools

- Templates and checklists: `references/templates.md`
- Output schema: `references/issue-bundle.spec.md`
- Validator: `scripts/validate_issue_bundle.py` (`python3 scripts/validate_issue_bundle.py issue-bundle.json`)
