# Craft Pipeline Contracts

The single source of truth for how the orchestrator (`craft`) hands work between stage skills: what each stage **consumes** and **emits**, the exact **status/routing vocabulary** craft branches on, where artifacts live, and the rules that keep the whole thing from drifting.

Stage skills are independently usable — each names its own inputs/outputs in its `SKILL.md`. This file is what `craft` reads to chain them. When a stage skill's output wording and this file disagree, that is a bug in one of them; fix it, don't paper over it.

## Artifact layout (`.praxis/`)

Persisted artifacts live under `.praxis/<feature-slug>/` at the repo root — process artifacts, not shipped deliverables. The tree is defined in `craft/SKILL.md` → *Artifact layout*; this file is the per-stage mapping onto it. Autopilot enforces persistence; manual mode recommends it.

| Artifact | Path | Producer |
| --- | --- | --- |
| Feature Brief | `.praxis/<slug>/brief.md` | clarifying-intent (feature-sized input) |
| Slice map (canonical) | `.praxis/<slug>/slice-map.json` | slicing-stories |
| Slice map (readable) | `.praxis/<slug>/slice-map.md` | slicing-stories |
| Story-Level Behavioral Spec (single story) | `.praxis/<slug>/spec.md` | clarifying-intent |
| Story-Level Behavioral Spec (per slice) | `.praxis/<slug>/slices/<slice-id>/spec.md` | clarifying-intent |
| Design sketch | `.praxis/<slug>/slices/<slice-id>/sketch.md` | sketching-design |
| Review report | `.praxis/<slug>/slices/<slice-id>/review.md` | code-reviewing |
| Verification summary | `.praxis/<slug>/slices/<slice-id>/verification.md` | verifying-and-adapting |
| Pipeline state | `.praxis/<slug>/state.json` | craft (see *Pipeline state*) |

For a single-story feature (no slicing), the per-slice files collapse to `.praxis/<slug>/{sketch,review,verification}.md` alongside `spec.md`.

## Per-stage consumed / emitted

| Stage | Consumes | Emits | Persisted to |
| --- | --- | --- | --- |
| clarifying-intent | user request (+ optional prior brief/spec/handoff) | Feature Brief **or** Story-Level Behavioral Spec **or** trivial statement **or** open questions | `brief.md` / `spec.md` |
| slicing-stories | Feature Brief (or feature-shaped input) | slice map (JSON + Markdown) | `slice-map.json` / `.md` |
| sketching-design | Story-Level Behavioral Spec | design sketch (or skipped / spec-issue) | `sketch.md` |
| driving-tdd | Story-Level Behavioral Spec (+ optional sketch) | AC checklist, feedback log, session summary; committed code+tests | `slices/<id>/` (summary optional) |
| code-reviewing | implementation diff (+ optional spec/summary/sketch) | severity-graded review report | `review.md` |
| code-improving | review report (+ optional spec) | improvement summary; committed fixes | (summary optional) |
| verifying-and-adapting | spec + implementation + test results (+ optional enrichments) | verification summary, optional updated spec, routing recommendation | `verification.md` |

## Status / routing vocabulary

Each stage ends its output with a machine-readable line (or JSON field) from the set below. `craft` branches **only** on these tokens — never on prose. If a token is absent or unrecognized, treat it as a malformed hand-off (see *Sibling failure*).

| Stage | Signal | Values |
| --- | --- | --- |
| clarifying-intent | `Status:` | `proceed` · `open-questions` · `spec-issue` · `trivial` |
| clarifying-intent | `Sizing:` (on the artifact) | `trivial` · `small` · `story` · `feature` |
| slicing-stories | `meta.status` (in JSON) | `complete` · `blocked` |
| sketching-design | `Status:` | `sketch` · `skipped` · `spec-issue` |
| driving-tdd | `Status:` (first line of session summary) | `complete` · `blocked: <reason>` |
| code-reviewing | `Status:` / `Security-sensitive:` | `complete` · `skipped` / `yes` · `no` |
| code-improving | `Status:` | `complete` · `feedback` · `skipped` |
| verifying-and-adapting | `Routing:` (final line) | `Done` · `Next slice: S-<id>` · `Rework: <gaps>` · `Escalate: <reason>` |

Any stage may additionally surface a `## Feedback` section when implementation reveals the spec was wrong — this is a hard stop regardless of the `Status:` value.

### Sizing → routing (used by craft entry triage)

| `Sizing:` | craft routes to |
| --- | --- |
| `trivial` | trivial fast-path — make the change directly, then a condensed review |
| `small` | straight to driving-tdd (spec inline), then code-reviewing; skip slicing/sketch/improve unless something surfaces |
| `story` | sketching-design → driving-tdd → review → improve → verify |
| `feature` | slicing-stories first, then per-slice `story` flow |

## Hard stops (craft halts and surfaces to the user, even in autopilot)

1. Any worker returns a `## Feedback` section.
2. clarifying-intent → `Status: open-questions`.
3. sketching-design → `Status: spec-issue` (or a `## Spec Issue` heading).
4. verifying-and-adapting → `Routing: Rework` or `Routing: Escalate`.
5. **Sibling failure** (below).
6. **Ship gate** — before marking a story/feature Done, present the evidence pack for human approval; never auto-confirm, even in autopilot. See `craft/SKILL.md` → *Gates*.

## Sibling failure

If a stage skill is unavailable, errors out, or returns output that does not match the shape documented here (missing `Status:`/`Routing:`/`meta.status`, or a malformed artifact), craft **stops and reports** — it never guesses the missing value or fabricates the artifact. A silently-dropped status line must not be read as success.

## Artifact anti-bloat

Each artifact carries **only** the decisions that cannot be derived from an upstream artifact; it references upstream docs by path rather than copying them. A spec does not restate the brief; a sketch does not restate the spec; a review does not restate the diff. This is a deliberate guard against the well-documented failure mode where spec-driven pipelines bury the reader in redundant Markdown (Böckeler, *Exploring Gen AI: SDD tools*). If an artifact is longer than the one that feeds it, compress it.

## Constitution / steering

If the project has a steering artifact (`.praxis/constitution.md`, `CLAUDE.md`, `AGENTS.md`, or `docs/steering/*`), craft locates it once at entry and passes its path to sketching-design, driving-tdd, and code-reviewing so they read project conventions instead of re-deriving them. Its content is mirrored into `CLAUDE.md`/`AGENTS.md` for runtime discovery and never duplicated inside skill bodies.

### Project posture (single source)

Design ambition scales with project maturity, so stages must agree on **one** posture value rather than each inferring its own (independent inference lets two stages judge the same story differently). The authoritative source is a `Posture:` line in the steering artifact — `mvp` (side-project / MVP: defer more, keep architecture thin) or `production` (company product: the bar for adopting a correctness- or security-relevant idiom now is lower). craft reads it once at entry and passes it, alongside the steering path, to sketching-design, driving-tdd, and code-reviewing. When the steering artifact is absent or omits `Posture:`, a stage infers it from repo signals (test maturity, CI config, release history) and **states the inferred value as an assumption** in its output; the craft ship-gate escalation (`craft/SKILL.md` → *Escalation*) already distinguishes company/production from solo MVP and reads the same value.

## Conventions precedence (project norms vs modern best practice)

The canonical rule for resolving "conform to the project's current norms **or** modern best practice" — referenced by sketching-design, driving-tdd, and code-reviewing so the three never re-derive it in conflicting words:

1. **Project norms win by default.** The steering artifact if present, else the closest existing analog in the codebase, is the baseline. Agents trained on public code drift to generic or deprecated patterns and miss internal conventions, so consistency is the higher-priority default — not an agent's from-scratch instinct.
2. **Modern (2026) best practice is a flagged deviation, never a silent default.** A stage may recommend departing from a project norm only as an explicit, reasoned finding that names the specific convention it breaks and why the deviation is worth it at this project's posture.
3. **An outdated existing norm is surfaced, not silently "corrected."** When the codebase's own pattern is genuinely dated or harmful, flag it as a Risk / recommendation for the human to decide; no stage rewrites a norm unilaterally.
4. **Pure taste disagreements** where both options are defensible stay low-severity / advisory and go under "for user consideration."

Each stage carries a one-line summary of this rule inline (so it holds standalone, without reading this file); this section is the version they agree to.
