---
name: craft
description: Run the entire Praxis craft workflow end-to-end as one guided flow that orchestrates every specialist stage in sequence (clarify → slice → design → TDD → review → improve → verify). Manual mode (default) checkpoints between stages; --autopilot runs end-to-end without prompting, creating multiple commits across stages and modifying production code and tests, stopping only on the four hard-stop conditions. Use when the user wants the whole pipeline (e.g. mentions Praxis craft, `/praxis:craft`, `$craft`, or "take this from idea to shipped") — not for a single stage, which should go to that stage's own skill.
---

# Craft

The single entry point for the Praxis `craft` workflow, shared across runtimes — Claude Code exposes it as `/praxis:craft`, Codex as `$craft`. You are the orchestrator. Invoke each sibling skill in turn, and pass each skill's output as input to the next.

## Mode

Parse the user request:

- If it starts with `--autopilot`, strip that flag and run in **autopilot** mode. The remaining text is the task.
- Otherwise, run in **manual** mode (default).

**Autopilot blast radius.** Autopilot runs the full pipeline without prompting. It creates multiple commits across stages, modifies production code and tests, and only stops on the four hard-stop conditions listed below. If the user did not invoke `--autopilot`, do not auto-confirm any gate.

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

A **gate** is a decision point between stages: the spec checkpoint, slice-map confirmation, slice selection, and `verifying-and-adapting`'s **Done / Next slice** routing.

- **Manual mode** — at every gate, ask the user (use the structured-question tool if available; otherwise present the artifact and the choices and wait for an answer). Never auto-confirm.
- **Autopilot mode** — auto-confirm every gate. Pick the obvious forward choice (confirm the spec, confirm the slice map, take the first/next slice, follow **Done** or **Next slice** as recommended).

## Hard stops (both modes)

Stop and surface the blocker to the user (do not auto-advance, even in autopilot) when:

1. Any worker returns a `## Feedback` section.
2. `clarifying-intent` returns **Open questions**.
3. `sketching-design` returns a `## Spec Issue`.
4. `verifying-and-adapting` recommends **Rework** or **Escalate**.

On a hard stop, present the blocker verbatim and wait for the user.

## Autopilot invocation directives

`clarifying-intent` is read-only (no Write grant) — **you, the orchestrator, own persistence**. It runs inline in your context, produces the artifact, and hands it back; you write it under `.praxis/` (see *Artifact layout* below) and route to the next skill. In autopilot mode, include this directive in your invocation prompt:

> Do the full product- and system-space work and produce the artifact (Feature Brief or Story-Level Behavioral Spec), but do NOT write any file yourself and do NOT emit the artifact as a standalone completed-deliverable text response. Then the orchestrator takes one of two paths:
>
> - **If the artifact is complete and ready** (status: `proceed`): emit NO substantive text. The orchestrator's immediate next actions are (1) a `Write` call persisting the artifact under `.praxis/` at the deterministic path for its type (see *Artifact layout*), then (2) a tool call invoking the next pipeline skill — `slicing-stories` if it is a Feature Brief, `sketching-design` if it is a Story Spec — passing the written path as input. Any completed-deliverable text between finishing the artifact and the `Write` call triggers end-of-turn and breaks the autopilot chain, so go straight from work to `Write` to the next skill call.
> - **If there are blocking unknowns** (status: `open-questions`) **or a discovered spec issue** (status: `spec-issue`): the orchestrator still `Write`s the partial artifact to its `.praxis/` path (so the work is preserved), then emits a short text response with the status line, the artifact path, and a brief explanation, and ends the turn so hard-stop handling can surface the blocker to the user.

In manual mode, do not include this directive — `clarifying-intent` emits its artifact inline so the user can review it directly, and you persist under `.praxis/` only if the user wants it saved.

**Why only `clarifying-intent`?** It is the only Praxis pipeline skill without `context: fork`. The other six pipeline skills each run in their own forked context: they do their work, return a compact tool result to the orchestrator, and the orchestrator's next action is naturally a tool call (the next skill). The orchestrator never authors the skill's output itself, so it never enters the "I just emitted a structured response" state that triggers end-of-turn in the model.

`clarifying-intent` runs inline in the orchestrator's context, so the orchestrator IS clarifying-intent while the skill executes. This is exactly why persistence is the orchestrator's job, not the skill's: `clarifying-intent`'s frontmatter grants no `Write` (it stays read-only by design), but the inline turn is the orchestrator's turn and carries the orchestrator's full tool grant — so the `Write` happens under the orchestrator's authority once the skill's read-only analysis is done. The old directive told the skill to "persist your artifact," which contradicted its no-Write grant; the artifact is now written by the orchestrator instead. The end-of-turn trigger here isn't the length of the output — it's the act of emitting a substantive text response after completing the work. Even a ~500-character structured status report triggers it, because the model treats any structured report as a completed deliverable that ends the message. No amount of "do not end the turn" instruction reliably overrides this default; the only robust fix is to not emit the report at all. (This end-of-turn-on-text-emission behavior is an observed Claude-runtime trait and may not apply on other runtimes such as Codex; the persistence-to-disk handoff in the directive above is the runtime-neutral mechanism that preserves the chain either way.)

The directive above mimics what forked skills do naturally: no text between work completion and the next tool call. The orchestrator's `Write` to `.praxis/` preserves the artifact for downstream skills; routing straight to the next tool call preserves the chain. Text is only emitted when we actually want the chain to stop (`open-questions` or `spec-issue`) — there, the orchestrator's hard-stop handling takes over.

## Steps

1. **clarifying-intent** — Pass the user request (in autopilot, include the persistence directive from *Autopilot invocation directives* above). The skill returns one of:
   - A **trivial change** statement → make the change directly and stop. This is the sanctioned trivial fast-path — skip the full pipeline.
   - A **Story-Level Behavioral Spec** → confirm at the spec gate, then go to step 3.
   - A **Feature Brief** → confirm at the spec gate, then go to step 2.
   - **Open questions** → hard-stop (condition 2).

2. **slicing-stories** — Pass the Feature Brief. The skill returns a slice map. Confirm at the slice-map gate, pick the first slice (via the slice-selection gate), and re-invoke **clarifying-intent** with that slice's story to produce a Story-Level Behavioral Spec for it (in autopilot, include the persistence directive on the re-invocation).

3. **sketching-design** — Pass the spec. The skill returns a sketch, marks itself skipped, or returns `## Spec Issue` → hard-stop (condition 3).

4. **driving-tdd** — Pass the spec and (if produced) the sketch. The skill commits implementation as it goes and returns the AC checklist, feedback log, and session summary. If it surfaces `## Feedback`, hard-stop (condition 1).

5. **code-reviewing** — Pass the spec and the TDD session summary. The skill returns a review report.

6. **code-improving** — Pass the review report and the spec. The skill commits fixes and returns an improvement summary. If it surfaces `## Feedback`, hard-stop (condition 1).

7. **verifying-and-adapting** — Pass the spec, AC checklist, feedback log, session summary, optional sketch, and (multi-slice only) slice map. The skill returns a verification summary, optionally an updated spec, and a routing recommendation. Act on the recommendation:
   - **Done** → at the routing gate, the story (or feature) is complete.
   - **Next slice** → at the routing gate, pick the next slice from the slice map and return to step 3 with a fresh **clarifying-intent** for it (in autopilot, include the persistence directive).
   - **Rework** → hard-stop (condition 4).
   - **Escalate** → hard-stop (condition 4).

## Artifact layout (`.praxis/`)

Persisted pipeline artifacts live under `.praxis/` at the repo root — deliberately outside the project's own source and `docs/` tree, because they are process artifacts (how the work was reasoned about), not shipped deliverables. Use a per-feature directory keyed by a short slug:

```
.praxis/<feature-slug>/
  brief.md                     # Feature Brief (clarifying-intent, feature-sized input)
  slice-map.json               # canonical slice map (slicing-stories) — source of truth
  slice-map.md                 # human-readable slice map
  spec.md                      # Story-Level Behavioral Spec (single-story feature, no slicing)
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
