---
name: craft
description: Run the full Praxis craft workflow with user checkpoints between stages. Use when the user mentions Praxis craft, `/craft`, or wants clarification, design, TDD, review, improvement, and verification as one guided flow.
---

# Craft

Codex entry point for the Praxis `craft` workflow. You are the orchestrator. Invoke each sibling skill in turn, pass each skill's output as input to the next, and check in with the user between stages.

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

## Steps

1. **clarifying-intent** — Pass the user request. The skill returns one of:
   - A **trivial change** statement → implement it directly and stop.
   - A **Story-Level Behavioral Spec** → confirm with the user, then go to step 3.
   - A **Feature Brief** → confirm with the user, then go to step 2.
   - **Open questions** → answer them with the user, then re-invoke.

2. **slicing-stories** — Pass the Feature Brief. The skill returns a slice map. Confirm with the user, pick the first slice, and re-invoke **clarifying-intent** with that slice's story to produce a Story-Level Behavioral Spec for it.

3. **sketching-design** — Pass the spec. The skill returns a sketch, marks itself skipped, or surfaces a spec issue. If a spec issue is surfaced, return to **clarifying-intent**.

4. **driving-tdd** — Pass the spec and (if produced) the sketch. The skill commits implementation as it goes and returns the AC checklist, feedback log, and session summary. If it surfaces `## Feedback`, return to **clarifying-intent** for that gap, then re-invoke.

5. **code-reviewing** — Pass the spec and the TDD session summary. The skill returns a review report.

6. **code-improving** — Pass the review report and the spec. The skill commits fixes and returns an improvement summary. If it surfaces `## Feedback`, return to **clarifying-intent**.

7. **verifying-and-adapting** — Pass the spec, AC checklist, feedback log, session summary, optional sketch, and (multi-slice only) slice map. The skill returns a verification summary, optionally an updated spec, and a routing recommendation. Act on the recommendation:
   - **Next slice** → pick the next slice from the slice map and return to step 3 with a fresh **clarifying-intent** for it.
   - **Rework** → return to step 4 with the gaps.
   - **Escalate** → return to step 1 at feature level.
   - **Done** → the story (or feature) is complete.

## Notes

- Stop at every user checkpoint to confirm scope and any surfaced findings.
- Skills accept either inline content or a path/handle to read. Pass whatever is convenient.
- If you choose to persist any artifact (brief, slice map, spec, sketch, review, summary) to disk, you decide where. There is no enforced layout.
