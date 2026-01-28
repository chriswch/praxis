# Issue Bundle Spec (v1)

Use this spec for the default output of the `agile-issue-splitter` skill. The goal is a deterministic, self-contained backlog artifact that can be pasted into issue trackers or consumed by other agents without needing the original feature list.

## Conventions

- **JSON only**: Output must be valid JSON (no comments, trailing commas).
- **IDs**:
  - Epics: `E-001`, `E-002`, …
  - User Stories: `US-001`, `US-002`, …
  - Tasks: `TASK-001`, `TASK-002`, …
  - Bugs: `BUG-001`, `BUG-002`, …
  - Questions: `Q-001`, `Q-002`, …
- **Uniqueness**: Every `id` must be unique across `epics` and `issues` (questions live under `meta.open_questions`).
- **Dependencies**: `blocked_by` contains **hard prerequisites only** and must reference existing issue IDs.
- **Self-contained**: Every issue’s `description` must include enough context to implement and verify it without external docs.

## Top-Level Shape

```json
{
  "meta": {
    "project": "TBD",
    "source": "PRD / notes / chat / link",
    "generated_at": "2026-01-25T00:00:00Z",
    "assumptions": [],
    "open_questions": []
  },
  "epics": [],
  "issues": []
}
```

### `meta` (required)

- `project` (string, required): Product/project name.
- `source` (string, required): Where the input features/behaviors came from.
- `generated_at` (string, required): ISO-8601 UTC timestamp (use `Z`).
- `assumptions` (string[], required): Assumptions made to proceed without blockers.
- `open_questions` (OpenQuestion[], required): Unresolved questions that impact scope/behavior.

#### `OpenQuestion`

- `id` (string, required): `Q-###`.
- `type` (string, required): `blocker` | `nice_to_have`.
- `owner` (string, required): `product` | `engineering` | `design` | `qa` | `security` | `data` | `tbd`.
- `question` (string, required)
- `context` (string, optional): Why it matters / what decision it affects.

### `epics` (Epic[], required; may be empty)

Use epics to group related work. If the input is small, `epics` may be empty.

#### `Epic`

- `id` (string, required): `E-###`.
- `title` (string, required)
- `objective` (string, required): Outcome-oriented statement.
- `exit_criteria` (string[], required): Observable conditions that mean the epic is “done”.
- `non_goals` (string[], optional): Explicitly out of scope.

### `issues` (Issue[], required; may be empty)

All actionable work items live here and are classified as `user_story`, `task`, or `bug`.

## Issue (Common Fields)

These fields apply to all issues unless stated otherwise.

- `id` (string, required): Must match the type prefix (`US-`, `TASK-`, `BUG-`).
- `type` (string, required): `user_story` | `task` | `bug`.
- `title` (string, required): Short, specific, outcome-focused.
- `description` (string, required): Full context, constraints, and intent.
- `priority` (string, required): `P0` | `P1` | `P2` | `P3`.
- `status` (string, required): `backlog` | `ready` | `in_progress` | `blocked` | `in_review` | `done` | `won_t_do`.
- `labels` (string[], required): Use stable tags like `area/frontend`, `area/backend`, `area/infra`, `area/qa`, `area/docs`, `kind/spike`, etc.
- `epic_id` (string, optional): Epic `id` if applicable.
- `parent_id` (string, optional): Parent issue `id` when this item is a child (commonly tasks/bugs under a user story).
- `workstream` (string, optional): Team/lane for parallel execution (e.g., `frontend`, `backend`, `design`, `qa`, `infra`).
- `blocked_by` (string[], required): Issue IDs that must be done first.
- `estimate` (Estimate, required)
- `acceptance_criteria` (string[], required for `user_story` and `bug`; optional for `task`)
- `definition_of_done` (string[], optional but recommended)

### `Estimate`

- `method` (string, required): `story_points` | `ideal_hours` | `t_shirt` | `unknown`
- `value` (number|string|null, required):
  - `story_points`: integer (recommend Fibonacci)
  - `ideal_hours`: number (e.g., `3`, `7.5`)
  - `t_shirt`: `XS` | `S` | `M` | `L` | `XL`
  - `unknown`: `null`

## User Story (`type: "user_story"`)

Additional required fields:

- `persona` (string, required)
- `story` (string, required): Use “As a … I want … so that …”.
- `value` (string, required): Why it matters / expected outcome.

Notes:
- Require at least 3 acceptance criteria and include edge cases where relevant.
- Prefer vertical slices that can ship independently behind flags if needed.

## Task (`type: "task"`)

Additional required fields:

- `task_kind` (string, required): `implementation` | `test` | `docs` | `spike` | `refactor` | `ops` | `analytics` | `release`
- `deliverable` (string, required): What will exist when done (PR merged, dashboard created, runbook updated, etc.).
- `verification` (string, required): How to verify completion (command, test, manual check).

Notes:
- Use tasks for enabling work, technical decomposition, or operational items; avoid turning all stories into tasks.
- Prefer tasks that can be executed in parallel and keep `blocked_by` minimal.

## Bug (`type: "bug"`)

Additional required fields:

- `severity` (string, required): `S0` | `S1` | `S2` | `S3`
  - `S0`: data loss/security incident/outage
  - `S1`: major user impact, no workaround
  - `S2`: moderate impact or workaround exists
  - `S3`: minor/cosmetic
- `environment` (string, required): Affected versions/platforms.
- `steps_to_reproduce` (string[], required)
- `expected` (string, required)
- `actual` (string, required)

Notes:
- Bugs must include a clear verification approach in acceptance criteria (e.g., regression test added, repro no longer possible).

