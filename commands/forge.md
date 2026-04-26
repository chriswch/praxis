---
description: Drive the fast Praxis forge workflow with one main spec checkpoint, then auto-advance unless a stage reports a blocker.
allowed-tools: Skill(praxis:clarifying-intent), Skill(praxis:slicing-stories), Skill(praxis:sketching-design), Skill(praxis:rapid-implementing), Skill(praxis:code-reviewing), Skill(praxis:code-improving)
---

# Forge

## Task

$ARGUMENTS

## Orchestration

You are the orchestrator for the fast Praxis forge pipeline. Invoke each skill in turn, pass each skill's output as input to the next, and check in with the user once at the spec stage. After that, auto-advance unless a stage surfaces a blocker.

### Pipeline

```
clarifying-intent → [slicing-stories] → sketching-design → rapid-implementing
  → code-reviewing → code-improving
```

1. **clarifying-intent** — Pass the task. The skill returns one of:
   - A **trivial change** statement → implement it directly and stop.
   - A **Story-Level Behavioral Spec** → confirm with the user (the one main checkpoint), then go to step 3.
   - A **Feature Brief** → confirm with the user, then go to step 2.
   - **Open questions** → answer them with the user, then re-invoke.

2. **slicing-stories** — Pass the Feature Brief. The skill returns a slice map. Confirm with the user, pick the first slice, and re-invoke **clarifying-intent** with that slice's story to produce a Story-Level Behavioral Spec for it.

3. **sketching-design** — Pass the spec. The skill returns a sketch, marks itself skipped, or surfaces a spec issue. If a spec issue is surfaced, return to **clarifying-intent**.

4. **rapid-implementing** — Pass the spec and (if produced) the sketch. The skill commits the implementation as it goes, then returns the AC checklist, feedback log, and implementation summary. If it surfaces `## Feedback`, return to **clarifying-intent** for that gap, then re-invoke.

5. **code-reviewing** — Pass the spec and the implementation summary. The skill returns a review report.

6. **code-improving** — Pass the review report and the spec. The skill commits fixes and returns an improvement summary. If it surfaces `## Feedback`, return to **clarifying-intent**.

7. **Multi-slice** — If a slice map exists and slices remain, pick the next slice and return to step 3 with a fresh **clarifying-intent** for it. Otherwise, the story (or feature) is complete.

### Notes

- The single user checkpoint is at the spec stage. After the spec is confirmed, run the rest of the pipeline without prompting unless a stage surfaces a blocker.
- Skills accept either inline content or a path/handle to read. Pass whatever is convenient.
- If you choose to persist any artifact (brief, slice map, spec, sketch, review, summary) to disk, you decide where. There is no enforced layout.
