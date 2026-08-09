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
| Deferred register | `.praxis/<slug>/deferred.md` — feature-level, not per-slice | any stage (appended by craft — see *Deferred register*) |
| Stack profile (research cache) | `.praxis/stack-profile.md` — repo-level, cross-feature | sketching-design (persisted by craft — see *Stack profile*) |

For a single-story feature (no slicing), the per-slice files collapse to `.praxis/<slug>/{sketch,review,verification}.md` alongside `spec.md`.

## Per-stage consumed / emitted

| Stage | Consumes | Emits | Persisted to |
| --- | --- | --- | --- |
| clarifying-intent | user request (+ optional prior brief/spec/handoff, test posture) | Feature Brief **or** Story-Level Behavioral Spec (with its Not Covered entries) **or** trivial statement **or** open questions | `brief.md` / `spec.md`; Not Covered → `deferred.md` |
| slicing-stories | Feature Brief (or feature-shaped input) | slice map (JSON + Markdown) | `slice-map.json` / `.md` |
| sketching-design | Story-Level Behavioral Spec | design sketch (or skipped / spec-issue) | `sketch.md` |
| driving-tdd | Story-Level Behavioral Spec (+ optional sketch, test posture) | AC checklist, feedback log (incl. deferred test candidates), session summary; committed code+tests | `slices/<id>/` (summary optional); candidates → `deferred.md` |
| code-reviewing | implementation diff (+ optional spec/summary/sketch) | severity-graded review report | `review.md` |
| code-improving | review report (+ optional spec) | improvement summary (incl. out-of-scope findings); committed fixes | (summary optional); out-of-scope → `deferred.md` |
| verifying-and-adapting | spec + implementation + test results (+ optional enrichments) | verification summary, optional updated spec, routing recommendation | `verification.md` |

A design sketch always records its researched-practice baseline (a `Modern Practice` section, sourced from the stack profile or fresh research) and carries a `Divergence & Recommendation` section whenever the proposed direction departs from a project convention **or** from that researched baseline — in the latter case explaining why a higher-precedence input won (see *Implementation-decision flow*). Both ride inside `sketch.md` — no separate artifact — and downstream stages that already accept the sketch (`driving-tdd`, `code-reviewing`) read them as optional context; the adopt-vs-conform decision a divergence raises is the caller's, surfaced at the design gate.

## Status / routing vocabulary

Each stage ends its output with a machine-readable line (or JSON field) from the set below. `craft` branches **only** on these tokens — never on prose. If a token is absent or unrecognized, treat it as a malformed hand-off (see *Sibling failure*).

| Stage | Signal | Values |
| --- | --- | --- |
| clarifying-intent | `Status:` | `proceed` · `open-questions` · `spec-issue` · `trivial` |
| clarifying-intent | `Sizing:` (on the artifact) | `trivial` · `small` · `story` · `feature` |
| slicing-stories | `meta.status` (in JSON) | `complete` · `blocked` |
| sketching-design | `Status:` | `sketch` · `skipped` · `spec-issue` |
| driving-tdd | `Status:` (first line of session summary) | `complete` · `needs-design: <reason>` · `blocked: <reason>` |
| code-reviewing | `Status:` / `Security-sensitive:` | `complete` · `skipped` / `yes` · `no` |
| code-improving | `Status:` | `complete` · `feedback` · `skipped` |
| verifying-and-adapting | `Routing:` (final line) | `Done` · `Next slice: S-<id>` · `Rework: <gaps>` · `Escalate: <reason>` |

Any stage may additionally surface a `## Feedback` section when implementation reveals the spec was wrong — this is a hard stop regardless of the `Status:` value.

`driving-tdd`'s `needs-design: <reason>` is a **re-route, not a stop** and not a sibling failure: craft runs `sketching-design` for the story (design gate), runs the step 3.5 consistency check, then re-enters `driving-tdd` with the sketch. It is the one status that sends work backward a stage. Guard against a loop: if `driving-tdd` returns `needs-design` *again with a sketch already in hand*, that **is** a sibling failure (the design didn't resolve it).

### Sizing → routing (used by craft entry triage)

| `Sizing:` | craft routes to |
| --- | --- |
| `trivial` | trivial fast-path — make the change directly, then a condensed review |
| `small` | straight to driving-tdd (spec inline), then code-reviewing; skip slicing/sketch/improve unless something surfaces — a `needs-design` from driving-tdd inserts sketching-design first, then re-enters step 4 |
| `story` | sketching-design → driving-tdd → review → improve → verify |
| `feature` | slicing-stories first, then per-slice `story` flow |

## Hard stops (craft halts and surfaces to the user, even in autopilot)

1. Any worker returns a `## Feedback` section.
2. clarifying-intent → `Status: open-questions`.
3. sketching-design → `Status: spec-issue` (or a `## Spec Issue` heading).
4. verifying-and-adapting → `Routing: Rework` or `Routing: Escalate`.
5. **Sibling failure** (below).
6. **Ship gate** — before marking a story/feature Done, present the evidence pack for human approval. See `craft/SKILL.md` → *Ship gate*.

## Sibling failure

If a stage skill is unavailable, errors out, or returns output that does not match the shape documented here (missing `Status:`/`Routing:`/`meta.status`, or a malformed artifact), craft **stops and reports** — it never guesses the missing value or fabricates the artifact. A silently-dropped status line must not be read as success.

## Artifact anti-bloat

Each artifact carries **only** the decisions that cannot be derived from an upstream artifact; it references upstream docs by path rather than copying them. A spec does not restate the brief; a sketch does not restate the spec; a review does not restate the diff. If an artifact is longer than the one that feeds it, compress it.

**Length calibration.** Match each artifact's length to what the next stage actually needs: cover the substance, and don't pad with filler sections, redundant summaries, or boilerplate. Current models default to longer written deliverables than this pipeline wants, so an artifact that *reads* thorough because it is long is this rule failing, not evidence of care.

## Constitution / steering

If the project has a steering artifact (`.praxis/constitution.md`, `CLAUDE.md`, `AGENTS.md`, or `docs/steering/*`), craft locates it once at entry and passes its path to sketching-design, driving-tdd, and code-reviewing so they read project conventions instead of re-deriving them. Its content is mirrored into `CLAUDE.md`/`AGENTS.md` for runtime discovery and never duplicated inside skill bodies.

### Project posture (single source)

Design ambition scales with project maturity, so stages must agree on **one** posture value rather than each inferring its own (independent inference lets two stages judge the same story differently). The authoritative source is a `Posture:` line in the steering artifact — `mvp` (side-project / MVP: defer more, keep architecture thin) or `production` (company product: the bar for adopting a correctness- or security-relevant idiom now is lower). It rides in the steering artifact whose path craft already passes to sketching-design, driving-tdd, and code-reviewing, so no stage infers it independently. **sketching-design** is the primary consumer — it scales design ambition to the posture (Minimum Viable Architecture). **code-reviewing** may read it to calibrate how hard to push a modern-practice deviation. **driving-tdd** receives it but keeps its refactor local regardless. When the steering artifact is absent or omits `Posture:`, the consuming stage infers it from repo signals (test maturity, CI config, release history) and **states the inferred value as an assumption** in its output; the craft ship-gate escalation (`craft/SKILL.md` → *Escalation*) already distinguishes company/production from solo MVP and reads the same value.

### Test posture (Praxis default: `critical-path`)

Praxis writes **critical-path tests by default** — no project configuration required. The asymmetry justifies the default: an over-tested change costs review attention and maintenance forever, while a deliberately deferred test costs one line in a register the user reads before shipping.

- **`critical-path` (default)** — cover the happy path, plus a failure case only where getting it wrong carries real consequence in *this* system: money, data integrity, security, silent corruption, or a failure this codebase has actually had. A boundary no caller can reach, or one whose failure is already a loud exception, does not earn a test.
- **`standard`** — error and boundary cases earn coverage on their own merit. Opt in with a `Test scope: standard` line in the steering artifact.

Two rules hold under both postures:

- **Build gates are not acceptance criteria.** "Suite green", "lint clean", "app boots" are pipeline execution conditions; written as an AC they turn into a test. They belong in Observable Signals.
- **Tests introduce no infrastructure.** When verifying a behavior would require a test framework, runner, or harness the repo does not have, that is its own story — record it (see *Deferred register*) rather than standing it up mid-flow.

**Nothing judged worth testing is silently dropped.** Whenever a stage decides `standard` posture would have covered a case that `critical-path` does not, it records a **deferred test candidate** — the behavior, where a test would live, why it was deferred — instead of dropping it. `clarifying-intent` records what it sees at AC time; `driving-tdd` records what implementation reveals. `craft` persists them and presents them at the ship gate for the user to pick from. Deferral being reversible at a known moment is what makes the lean default safe.

Consumers: `clarifying-intent` (which behaviors earn an AC) and `driving-tdd` (which tests get written, at which layer). As with `Posture:`, craft resolves the value once at entry and passes it, so neither stage infers its own. `code-reviewing` is not a consumer — tests remain outside its scope.

## Code annotation & traceability

Where each kind of rationale lives — so none of it lands in a code comment by default. Referenced by `driving-tdd` (writes the code), `code-reviewing` (audits it), and `code-improving` (fixes it).

**The codebase is not the process trail.** Process identifiers — AC numbers, slice ids (`S-001`), ticket keys, spec section references, pipeline stage names — belong to `.praxis/` artifacts, commit messages, and the PR description. They do not appear in source, tests, test names, docstrings, or comments: a reader of the code cannot resolve them and does not need to. Name things after the behavior — `rejects a product set the shop does not own`, not `test_ac6b_transport_failure`.

**A comment carries only what the code cannot.** Write one where the *why* is unrecoverable from the code: a non-obvious external constraint, a rejected alternative a reader would otherwise retry, a third-party quirk being worked around. Match the surrounding file's comment density.

| Rationale | Home |
| --- | --- |
| A project-wide convention or standard | steering artifact (`CLAUDE.md`/`AGENTS.md`) |
| A decision spanning the whole change, and the alternatives it rejected | PR description (an ADR when it is durable) |
| A local *why*, true only of this code | a comment at that code |
| Process bookkeeping (ACs, slices, stages) | `.praxis/` artifacts |

Each stage carries a one-line summary of this inline; this section is the version they agree to.

## Deferred register (`deferred.md`)

One file per feature — `.praxis/<slug>/deferred.md` — holding what a run noticed and deliberately did not do, for the user to triage at the ship gate. Two kinds, one table each:

- **Deferred test candidates** — cases `standard` posture would have covered (see *Test posture*). Producers: `clarifying-intent`, `driving-tdd`.
- **Out-of-scope findings** — work worth doing that is not this story. Producer: any stage; most often `code-improving`, whose scope guardrail routes such findings here instead of applying them.

Each entry carries what it is, where it would live, why it was deferred, and a suggested route (`add now` · `new ticket` · `follow-up PR`). Stage skills hold no Write grant: they emit entries in their output and `craft` appends them to the file.

## Implementation-decision flow (research · taste · project consistency)

The canonical process and precedence for every architecture/style/pattern decision — referenced by sketching-design, driving-tdd, and code-reviewing so the three never re-derive it in conflicting words.

### The three inputs, in gathering order

1. **Researched current practice — gathered first, before reading the project's implementation.** Establish what current industry practice recommends for the story's problem in this language/framework *before* studying how the project already solves similar problems, so the assessment isn't anchored by existing code. Reading the stack manifest (language, framework, versions) is fine; reading implementation patterns is not, yet. Ground it in tools: use whatever web/doc-lookup tools the runtime provides and date-stamp the findings; when none are available, state explicitly that the baseline comes from model knowledge, and date it. Cache-first: read `.praxis/stack-profile.md` and research fresh only when it's missing, stale, or silent on this story's problem (see *Stack profile*).
2. **Taste profile.** `~/.praxis/taste.md` if it exists (the user's cross-project design philosophy — it travels with the user, not the repo), else the plugin default `craft/references/default-philosophy.md`. A standing philosophy, not a per-story judgment.
3. **Project reality.** The steering artifact if present, else the closest existing analog in the codebase (see *Constitution / steering*). Gathered after research, so the fresh view exists before the anchor does.

### Precedence when inputs conflict

Written here — in the flow the stages execute — because context-file layering has no deterministic override order; only explicit skill text does.

1. **Taste profile wins by default.** When the taste profile and a project convention point different ways, recommend the taste-aligned direction — and flag the departure from the project convention explicitly (rule 4). Where the taste profile is silent, fall through.
2. **Project consistency is second.** Absent a taste-profile position, the project norm — steering artifact, else closest analog — is the baseline. Agents trained on public code drift to generic or deprecated patterns and miss internal conventions.
3. **Researched practice is third — a recommendation input, never a silent default.** It informs and pressure-tests the choice; adopting it *against* taste or project consistency is a flagged, reasoned recommendation for the caller, not a unilateral move. Posture calibrates how hard to push: at `production` the bar for adopting a correctness- or security-relevant idiom now is lower; at `mvp`, lean toward deferring.
4. **Every divergence is explained, proactively.** Two duties, both unconditional: (a) a recommendation that departs from a *project convention* names the convention it breaks and why the departure is worth it; (b) a final decision that differs from what the *researched practice* recommends must say so unprompted — name what current practice suggests, what was chosen instead, and which higher-precedence input (taste or project consistency) won and why. An unremarked divergence in either direction is the failure mode this rule exists to prevent.
5. **An outdated existing norm is surfaced, not silently "corrected."** When the codebase's own pattern is genuinely dated or harmful, flag it as a Risk / recommendation for the human to decide; no stage rewrites a norm unilaterally.
6. **Pure taste disagreements** the taste profile doesn't settle — both options defensible — stay low-severity / advisory, under "for user consideration."

Each stage carries a one-line summary of this flow inline (so it holds standalone, without reading this file); this section is the version they agree to. Stage split: **sketching-design** executes the full flow; **code-reviewing** audits the outcome against it (including that divergences were explained); **driving-tdd**'s refactor stays local and routes idiom gaps back to design.

### Stack profile (research cache)

Researched practice is cached at `.praxis/stack-profile.md` — repo root, **cross-feature** (not under a feature slug), because it describes the stack, not one story. Entries carry the practice researched, a date, and sources. Stages read it instead of re-researching; refresh when the file is missing, the relevant entry is older than ~3 months, the stack changed (new framework or major version), or the user asks. Producer: `sketching-design` emits new/updated entries as a `Stack Profile Update` block in its output; the caller — craft, or the user standalone — writes the file (stage skills hold no Write grant).
