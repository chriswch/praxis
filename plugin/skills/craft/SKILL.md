---
name: craft
description: Run the full Praxis craft workflow. Manual mode (default) checkpoints between stages; --autopilot runs end-to-end without prompting, creating multiple commits across stages and modifying production code and tests, stopping only on the four hard-stop conditions. Use when the user mentions Praxis craft, `/craft`, or wants clarification, design, TDD, review, improvement, and verification as one guided flow.
---

# Craft

Codex entry point for the Praxis `craft` workflow. You are the orchestrator. Invoke each sibling skill in turn, and pass each skill's output as input to the next.

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

The sibling skills live next to this one:

- `../clarifying-intent/SKILL.md`
- `../slicing-stories/SKILL.md`
- `../sketching-design/SKILL.md`
- `../driving-tdd/SKILL.md`
- `../code-reviewing/SKILL.md`
- `../code-improving/SKILL.md`
- `../verifying-and-adapting/SKILL.md`

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

## Steps

1. **clarifying-intent** — Pass the user request. The skill returns one of:
   - A **trivial change** statement → implement it directly and stop.
   - A **Story-Level Behavioral Spec** → confirm at the spec gate, then go to step 3.
   - A **Feature Brief** → confirm at the spec gate, then go to step 2.
   - **Open questions** → hard-stop (condition 2).

2. **slicing-stories** — Pass the Feature Brief. The skill returns a slice map. Confirm at the slice-map gate, pick the first slice (via the slice-selection gate), and re-invoke **clarifying-intent** with that slice's story to produce a Story-Level Behavioral Spec for it.

3. **sketching-design** — Pass the spec. The skill returns a sketch, marks itself skipped, or returns `## Spec Issue` → hard-stop (condition 3).

4. **driving-tdd** — Pass the spec and (if produced) the sketch. The skill commits implementation as it goes and returns the AC checklist, feedback log, and session summary. If it surfaces `## Feedback`, hard-stop (condition 1).

5. **code-reviewing** — Pass the spec and the TDD session summary. The skill returns a review report.

6. **code-improving** — Pass the review report and the spec. The skill commits fixes and returns an improvement summary. If it surfaces `## Feedback`, hard-stop (condition 1).

7. **verifying-and-adapting** — Pass the spec, AC checklist, feedback log, session summary, optional sketch, and (multi-slice only) slice map. The skill returns a verification summary, optionally an updated spec, and a routing recommendation. Act on the recommendation:
   - **Done** → at the routing gate, the story (or feature) is complete.
   - **Next slice** → at the routing gate, pick the next slice from the slice map and return to step 3 with a fresh **clarifying-intent** for it.
   - **Rework** → hard-stop (condition 4).
   - **Escalate** → hard-stop (condition 4).

## Notes

- Skills accept either inline content or a path/handle to read. Pass whatever is convenient.
- If you choose to persist any artifact (brief, slice map, spec, sketch, review, summary) to disk, you decide where. There is no enforced layout.
