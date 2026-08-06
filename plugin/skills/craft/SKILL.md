---
name: craft
description: Runs the whole Praxis pipeline end-to-end as one guided flow: clarify → slice → design → TDD → review → improve → verify. Manual mode checkpoints between stages; --autopilot runs through, commits across stages, and stops only at the human ship gate. Use for the full pipeline; a single stage goes to that stage's own skill.
---

# Craft

The single entry point for the Praxis `craft` workflow, shared across runtimes — Claude Code exposes it as `/praxis:craft`, Codex as `$craft`. You are the orchestrator. Invoke each sibling skill in turn, and pass each skill's output as input to the next.

## Mode

Parse the user request:

- If it starts with `--autopilot`, strip that flag and run in **autopilot** mode. The remaining text is the task.
- Otherwise, run in **manual** mode (default).

**Autopilot blast radius.** Autopilot runs the full pipeline without prompting. It creates multiple commits across stages, modifies production code and tests, and stops only on the hard-stop conditions listed below — including the ship gate before Done (see *Ship gate*). If the user did not invoke `--autopilot`, do not auto-confirm any gate.

## Communication during the run

A craft run spans many stages and can run long. Keep the reporting proportional to it.

- Before invoking a stage, say in one sentence what you're about to do. While it runs, speak up only for a gate, a hard stop, or a finding that changes the plan.
- At each gate and at the end, lead with the outcome — what happened, what was found — and put supporting detail after it.
- Hold artifacts to the length calibration in `references/contracts.md` → *Artifact anti-bloat*: cover the substance, skip filler sections, redundant summaries, and boilerplate.
- Correct an earlier statement when the error would change the user's code, decisions, or the routing. Smaller slips get fixed silently.

## Pipeline

```
clarifying-intent → [slicing-stories] → sketching-design → driving-tdd
  → code-reviewing → code-improving → verifying-and-adapting
```

The sibling skills you orchestrate (invoke each by its skill identity, not by file path):

- `clarifying-intent`
- `slicing-stories`
- `sketching-design`
- `driving-tdd`
- `code-reviewing`
- `code-improving`
- `verifying-and-adapting`

## Gates

A **gate** is a decision point between stages. Manual mode converges on **three high-value human gates**; everything else runs deterministically so low-value confirmations don't fatigue the user.

The three human gates (manual mode):

1. **Spec gate** — after `clarifying-intent`. Approve the spec before design or implementation; building the wrong thing is the most expensive error.
2. **Design gate** — after `sketching-design`. Approve the sketch (or its `skipped` rationale) before TDD. This is the canonical plan-approval checkpoint ("between Plan and Execute").
3. **Ship gate** — before Done. Present the evidence pack and get human approval before the story/feature is considered shipped (see *Ship gate*).

Deterministic transitions (no human gate):

- **Slice selection** — default to the first `pending` slice in the slice map's order. Don't ask; in manual mode the user can reorder at the one-time slice-map confirmation.
- **Slice-map confirmation** — manual mode presents the map once after `slicing-stories`; autopilot accepts it.
- Advancing design → TDD → review → improve → verify, once each deterministic check passes (a non-blocking `Status:`/`Routing:` line is present, tests are green or show no new failures, and the required artifact was written).

Mode summary:

- **Manual mode** — pause at the three human gates; run the rest deterministically. Use the structured-question tool when available.
- **Autopilot mode** — auto-confirm the spec, design, and deterministic transitions; the ship gate still stops (see *Ship gate*).

**Escalation to a mandatory human gate (both modes).** When a change touches security-sensitive surfaces (`code-reviewing` returns `Security-sensitive: yes`), a public API contract, or cross-cutting architecture (signal: `code-reviewing`'s breaking-changes layer, or a risk flagged in the sketch), the ship gate is a mandatory human stop even in autopilot. For company/production work, additionally route the diff to a dedicated human/security review *outside the agent loop*. For solo MVP work, the ship gate is the minimum, and it must still be evidence-based — a human sees the executed tests and real behavior, not the agent's claim.

## Ship gate

Before marking a story (or, for a multi-slice feature, the whole feature) **Done**, stop and present an **evidence pack** for human approval. This is the one gate autopilot may never skip: a full autopilot run that reaches Done still stops here. The pack carries:

- `verifying-and-adapting`'s verification summary, including the executed acceptance checks and their observed output.
- The list of commits produced this run.
- Suite status (command + verbatim result).
- Any `Security-sensitive: yes` flag and what it touched.

Only the human's approval closes the story. Optionally, produce a terminal merge-readiness summary or open a PR after approval.

## Hard stops (both modes)

Stop and surface the blocker to the user (do not auto-advance, even in autopilot) when:

1. Any worker returns a `## Feedback` section.
2. `clarifying-intent` returns `Status: open-questions`.
3. `sketching-design` returns `Status: spec-issue` (or a `## Spec Issue` heading).
4. `verifying-and-adapting` returns `Routing: Rework` or `Routing: Escalate`.
5. **Sibling failure** — a stage skill is unavailable, errors, or returns output that doesn't match its documented shape (a missing `Status:`/`Routing:`/`meta.status`, or a malformed artifact). Never guess the missing value or fabricate the artifact — report and stop. `slicing-stories` returning `meta.status: blocked` (with `## Blocking Questions`) is the sanctioned form of this stop.
6. **Ship gate** — the mandatory human approval before Done (see *Ship gate*), including the security / public-API / architecture escalation.

On a hard stop, present the blocker verbatim and wait for the user.

## Autopilot invocation directives

`clarifying-intent` is read-only (no Write grant) — **you, the orchestrator, own persistence**. It runs inline in your context, produces the artifact, and hands it back; you write it under `.praxis/` (see *Artifact layout* below) and route to the next skill. In autopilot mode, include this directive in your invocation prompt:

> Do the full product- and system-space work and produce the artifact (Feature Brief or Story-Level Behavioral Spec), but do NOT write any file yourself and do NOT emit the artifact as a standalone completed-deliverable text response. Then the orchestrator takes one of two paths:
>
> - **If the artifact is complete and ready** (status: `proceed`): emit NO substantive text. The orchestrator's immediate next actions are (1) a `Write` call persisting the artifact under `.praxis/` at the deterministic path for its type (see *Artifact layout*), then (2) a tool call invoking the next pipeline skill — the one *Steps* §1 routes to for this artifact (the routing lives there, not here) — passing the written path as input. Any completed-deliverable text between finishing the artifact and the `Write` call triggers end-of-turn and breaks the autopilot chain, so go straight from work to `Write` to the next skill call.
> - **If there are blocking unknowns** (status: `open-questions`) **or a discovered spec issue** (status: `spec-issue`): the orchestrator still `Write`s the partial artifact to its `.praxis/` path (so the work is preserved), then emits a short text response with the status line, the artifact path, and a brief explanation, and ends the turn so hard-stop handling can surface the blocker to the user.

In manual mode, do not include this directive — `clarifying-intent` emits its artifact inline so the user can review it directly, and you persist under `.praxis/` only if the user wants it saved.

**When to attach it.** Attach this directive to any pipeline skill that runs *inline* in your context — i.e. any skill without `context: fork`. Check the `context:` frontmatter, not the skill name: today only `clarifying-intent` qualifies, but the rule generalizes. Forked skills don't need it — they return a tool result and the next tool call follows naturally. The full rationale (why an inline skill would otherwise break the chain, and why persistence is the orchestrator's job) is in `references/autopilot-chain.md`.

## Steps

**Entry points — you don't always start at step 1.** Inspect what you were handed and jump in:

- Raw request / rough idea → step 1.
- An existing Feature Brief (`Sizing: feature`) → step 2.
- A Story-Level Behavioral Spec → step 3 (entry triage may send a `small` spec straight to step 4).
- Implementation already written, needs review → step 5.

On invocation, detect an in-progress run via `.praxis/<slug>/state.json` (see *Pipeline state*) and offer to resume from the last passed gate instead of restarting.

**Steering artifact.** Before step 1, locate the project's steering/constitution artifact (`.praxis/constitution.md`, `CLAUDE.md`/`AGENTS.md`, or `docs/steering/*`). If present, pass its path to `sketching-design`, `driving-tdd`, and `code-reviewing` so they read project conventions instead of re-deriving them each run. Its content is mirrored into `CLAUDE.md`/`AGENTS.md` for runtime discovery, never copied into skill bodies (see `references/contracts.md` → *Constitution / steering*).

Also read the artifact's `Posture:` value (`mvp` | `production`) once here. It rides in the steering artifact whose path you already pass to the three stages, so the value comes from one shared source instead of each stage inferring its own: sketching-design scales design ambition on it, code-reviewing may calibrate idiom-deviation strength, and driving-tdd keeps its refactor local regardless. If it's absent, the consuming stage infers and states its assumption (see `references/contracts.md` → *Project posture*). The ship-gate escalation below reads the same value.

**Decision-flow inputs.** Alongside the steering artifact, locate the other two decision-flow inputs once at entry (see `references/contracts.md` → *Implementation-decision flow*): the **taste profile** — `~/.praxis/taste.md` if present, else the plugin default `craft/references/default-philosophy.md` — and the **stack profile** research cache at `.praxis/stack-profile.md` (repo root, cross-feature). Pass both paths to `sketching-design` and `code-reviewing`. When `sketching-design` returns a `Stack Profile Update` block, write it into `.praxis/stack-profile.md` — stage skills hold no Write grant, so this persistence is yours.

**Entry triage — size the work before running the pipeline.** Read `clarifying-intent`'s `Sizing:` line (or judge it yourself for a spec handed in directly) and scale pipeline depth. Running all seven stages on a one-line change is the documented "sledgehammer" failure mode:

- `Sizing: trivial` → make the change directly (step 1's fast-path); no pipeline.
- `Sizing: small` → straight to **driving-tdd** (step 4) with the spec inline, then **code-reviewing** (step 5); skip slicing, sketch, and improve unless review surfaces something. If driving-tdd returns `Status: needs-design` (the design path wasn't obvious after all), insert **sketching-design** for this story, then re-enter step 4 — the sketch is added on demand, not skipped blindly.
- `Sizing: story` → the full per-slice flow (steps 3–7).
- `Sizing: feature` → slice first (step 2), then run each slice as a `story`.

1. **clarifying-intent** — Pass the user request (in autopilot, include the persistence directive from *Autopilot invocation directives*). Persist the returned artifact under `.praxis/`, then branch on its `Status:` / `Sizing:`:
   - `Status: trivial` → make the change directly and stop. Sanctioned trivial fast-path.
   - `Status: proceed` + `Sizing: feature` (Feature Brief) → spec gate, then step 2.
   - `Status: proceed` + `Sizing: small | story` (Story Spec) → spec gate, then entry triage routes it (`small` → step 4; `story` → step 3).
   - `Status: open-questions` → hard-stop (condition 2).
   - `Status: spec-issue` → hard-stop (condition 3).

2. **slicing-stories** — Pass the Feature Brief. The skill returns a slice map with `meta.status`. `blocked` → hard-stop (condition 5). `complete` → confirm the map (manual) / accept (autopilot), record each slice as `pending` in `.praxis/<slug>/state.json`, take the first `pending` slice (deterministic — no gate), and re-invoke **clarifying-intent** for its story (autopilot: persistence directive).

3. **sketching-design** — Pass the spec (plus the steering, taste-profile, and stack-profile paths located at entry). Persist a returned sketch under `.praxis/`; if it carries a `Stack Profile Update` block, also write/refresh `.praxis/stack-profile.md` (see `references/contracts.md` → *Stack profile*). `Status: sketch` → design gate, then step 3.5. `Status: skipped` → step 3.5. `Status: spec-issue` → hard-stop (condition 3).

   **3.5 Cross-artifact consistency check (before TDD).** Before invoking `driving-tdd`, confirm the artifacts agree: every spec acceptance criterion is addressed by the sketch's change map, and (multi-slice) the work stays within the slice's `scope_in`/`scope_out`. A mismatch — an AC with nowhere to live, or a sketch reaching outside the slice — is a spec/design inconsistency; treat it like a `## Spec Issue` (hard-stop condition 3) rather than coding against a contradiction. Skip the change-map half when the sketch was `skipped`.

4. **driving-tdd** — Pass the spec and (if produced) the sketch. The skill commits implementation and returns the AC checklist, feedback log, and session summary (`Status: complete | needs-design | blocked`). `## Feedback` or `Status: blocked` → hard-stop (condition 1).
   - `Status: needs-design` → **re-route** (not a hard stop): the design path was non-obvious and no sketch was in hand. Run **sketching-design** on this spec (design gate as usual), run the step 3.5 consistency check, then re-enter step 4 with the sketch. If driving-tdd returns `needs-design` *again with a sketch already provided*, treat it as a sibling failure (hard-stop condition 5) — the design didn't resolve the ambiguity.

5. **code-reviewing** — Pass the implementation (with the spec and TDD summary as optional context, plus the steering, taste-profile, and stack-profile paths located at entry). Persist the review under `.praxis/`. Note its `Security-sensitive:` header for the ship-gate escalation.

6. **code-improving** — Pass the review report and the spec. The skill commits fixes and returns an improvement summary (`Status:`). `## Feedback` → hard-stop (condition 1).
   - **Re-review loop (bounded).** After fixes, if the improvement summary reports unresolved critical/high findings — or the fixes were substantial — re-run **code-reviewing** on the fix commits, then **code-improving** again. Loop review→improve at most **3 rounds**. If critical/high findings still remain after the cap, stop and **reject-and-decompose**: surface a hard stop recommending the story return to `clarifying-intent` / `slicing-stories`. A story that can't be made clean in three rounds is usually under-specified or too big — not a fix-harder problem.

7. **verifying-and-adapting** — Pass the spec, AC checklist, feedback log, session summary, improvement summary, optional sketch, and (multi-slice only) the slice map, plus (final slice) the Feature Brief. The skill returns a verification summary, optionally an updated spec, and a `Routing:` line. Persist the verification under `.praxis/`; if the spec was updated, **overwrite the spec artifact** (the living-spec write-back is a required orchestrator action, since the skill holds no Write grant). Update the slice's state in `state.json`, then act on `Routing:`:
   - `Routing: Done` → **ship gate** (hard-stop condition 6), then the story/feature is complete.
   - `Routing: Next slice: S-<id>` → mark this slice `done` in `state.json`, pick the next `pending` slice, and return to step 3 with a fresh **clarifying-intent** for it (autopilot: persistence directive).
   - `Routing: Rework` → hard-stop (condition 4).
   - `Routing: Escalate` → hard-stop (condition 4).

## Pipeline state

For any multi-slice or resumable run, keep `.praxis/<slug>/state.json`: the slug, the current stage, and each slice's status (`pending | in-progress | done`) with its artifact paths. Update it at every gate. On invocation, if a fresh `state.json` with in-progress work exists, offer to resume from the last passed gate rather than restarting from `clarifying-intent` — this is what lets a cancelled or compaction-truncated autopilot run pick back up.

## Artifact layout (`.praxis/`)

Persisted pipeline artifacts live under `.praxis/` at the repo root — deliberately outside the project's own source and `docs/` tree, because they are process artifacts (how the work was reasoned about), not shipped deliverables. Use a per-feature directory keyed by a short slug:

```
.praxis/<feature-slug>/
  brief.md                     # Feature Brief (clarifying-intent, feature-sized input)
  slice-map.json               # canonical slice map (slicing-stories) — source of truth
  slice-map.md                 # human-readable slice map
  spec.md                      # Story-Level Behavioral Spec (single-story feature, no slicing)
  state.json                   # pipeline state — current stage + per-slice status (craft; resumable runs)
  slices/<slice-id>/
    spec.md                    # per-slice Story-Level Behavioral Spec
    sketch.md                  # design sketch (sketching-design)
    review.md                  # review report (code-reviewing)
    verification.md            # verification summary (verifying-and-adapting)
```

- **Autopilot**: this layout is enforced. Persist every artifact to its path so the chain — and any later resume — can find it. When you `Write` an artifact, pass that path (not inline content) to the next skill.
- **Manual**: recommended, not enforced. Persist where the user prefers, or keep artifacts inline; offer to save under `.praxis/` when it helps.
- `.praxis/` holds process artifacts — add it to the project's `.gitignore` unless the team decides to commit them (committing aids multi-session resume and review).

## Notes

- Skills accept either inline content or a path/handle to read. In autopilot, prefer passing the `.praxis/` path you just wrote; inline is fine in manual mode.

## References

- `references/contracts.md` — the pipeline contract: per-stage consumed/emitted artifact types, the exact status/routing vocabulary this orchestrator branches on, the artifact→path mapping, and the sibling-failure and anti-bloat rules. Read it before wiring any stage hand-off.
- `references/autopilot-chain.md` — why the autopilot directive exists and when to attach it (the inline-skill / end-of-turn rationale). Read it only if the *Autopilot invocation directives* section raises a question.
