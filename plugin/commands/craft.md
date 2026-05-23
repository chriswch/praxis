---
description: Drive the full Praxis craft workflow. Manual mode (default) checkpoints between stages; --autopilot runs end-to-end without prompting, creating multiple commits across stages and modifying production code and tests, stopping only on the four hard-stop conditions below.
allowed-tools: Skill(praxis:clarifying-intent), Skill(praxis:slicing-stories), Skill(praxis:sketching-design), Skill(praxis:driving-tdd), Skill(praxis:code-reviewing), Skill(praxis:code-improving), Skill(praxis:verifying-and-adapting), AskUserQuestion
---

# Craft

## Task

$ARGUMENTS

## Mode

Parse `$ARGUMENTS`:

- If it starts with `--autopilot`, strip that flag and run in **autopilot** mode. The remaining text is the task.
- Otherwise, run in **manual** mode (default). The whole `$ARGUMENTS` is the task.

**Autopilot blast radius.** Autopilot runs the full pipeline without prompting. It creates multiple commits across stages, modifies production code and tests, and only stops on the four hard-stop conditions listed below. If the user did not invoke `--autopilot`, do not auto-confirm any gate.

## Orchestration

You are the orchestrator for the full Praxis craft pipeline. Invoke each skill in turn, pass each skill's output as input to the next.

### Pipeline

```
clarifying-intent → [slicing-stories] → sketching-design → driving-tdd
  → code-reviewing → code-improving → verifying-and-adapting
```

### Gates

A **gate** is a decision point between stages: the spec checkpoint, slice-map confirmation, slice selection, and `verifying-and-adapting`'s **Done / Next slice** routing.

- **Manual mode** — at every gate, call `AskUserQuestion` with the artifact and the choices. Do not free-form prompt; always use `AskUserQuestion`.
- **Autopilot mode** — auto-confirm every gate. Do not call `AskUserQuestion`. Pick the obvious forward choice (confirm the spec, confirm the slice map, take the first/next slice, follow **Done** or **Next slice** as recommended).

### Hard stops (both modes)

Stop and surface the blocker to the user (do not auto-advance, even in autopilot) when:

1. Any worker returns a `## Feedback` section.
2. `clarifying-intent` returns **Open questions**.
3. `sketching-design` returns a `## Spec Issue`.
4. `verifying-and-adapting` recommends **Rework** or **Escalate**.

On a hard stop, present the blocker verbatim and wait for the user.

### Autopilot invocation directives

In autopilot mode, when invoking **`clarifying-intent`**, include this directive in your invocation prompt:

> Persist your full artifact (Feature Brief or Story-Level Behavioral Spec) to disk at a deterministic path under `docs/` (e.g., `docs/specs/<short-slug>.md` — follow any existing project convention if present). Respond in chat with only:
>
> - A status line: one of `proceed` / `open-questions` / `spec-issue`
> - The artifact path
> - A one-paragraph summary (< 300 chars)
>
> Do not render the full artifact in chat. The next skill in the pipeline will read it from the path.

After `clarifying-intent` returns, pass the artifact **path** (not inline content) as input to the next skill.

In manual mode, do not include this directive — `clarifying-intent` should emit its artifact inline so the user can review it directly.

**Why only `clarifying-intent`?** It is the only Praxis pipeline skill without `context: fork`. The other skills run in their own forked context and return artifacts to the orchestrator as compact tool results, which the orchestrator can hand off without authoring them itself. `clarifying-intent` runs inline in the orchestrator's context: when the orchestrator authors a multi-thousand-character spec directly in its own response, the model tends to treat that response as a completed deliverable and end the turn (`stop_reason: end_turn`), breaking the autopilot chain. Persisting to disk keeps the orchestrator's reply short and the chain alive.

### Steps

1. **clarifying-intent** — Pass the task (in autopilot, include the persistence directive from *Autopilot invocation directives* above). The skill returns one of:
   - A **trivial change** statement → implement it directly and stop.
   - A **Story-Level Behavioral Spec** → confirm at the spec gate, then go to step 3.
   - A **Feature Brief** → confirm at the spec gate, then go to step 2.
   - **Open questions** → hard-stop (condition 2).

2. **slicing-stories** — Pass the Feature Brief. The skill returns a slice map. Confirm at the slice-map gate, pick the first slice (via the slice-selection gate), and re-invoke **clarifying-intent** with that slice's story to produce a Story-Level Behavioral Spec for it (in autopilot, include the persistence directive on the re-invocation).

3. **sketching-design** — Pass the spec. The skill returns a design sketch, marks itself skipped, or returns `## Spec Issue` → hard-stop (condition 3).

4. **driving-tdd** — Pass the spec and (if produced) the sketch. The skill commits implementation as it goes, then returns the AC checklist, feedback log, and session summary. If it surfaces `## Feedback`, hard-stop (condition 1).

5. **code-reviewing** — Pass the spec and the TDD session summary. The skill returns a review report.

6. **code-improving** — Pass the review report and the spec. The skill commits fixes and returns an improvement summary. If it surfaces `## Feedback`, hard-stop (condition 1).

7. **verifying-and-adapting** — Pass the spec, AC checklist, feedback log, session summary, optional sketch, and (multi-slice only) slice map. The skill returns a verification summary, optionally an updated spec, and a routing recommendation. Act on the recommendation:
   - **Done** → at the routing gate, the story (or feature) is complete.
   - **Next slice** → at the routing gate, pick the next slice from the slice map and return to step 3 with a fresh **clarifying-intent** for it (in autopilot, include the persistence directive).
   - **Rework** → hard-stop (condition 4).
   - **Escalate** → hard-stop (condition 4).

### Notes

- Skills accept either inline content or a path/handle to read. Pass whatever is convenient.
- If you choose to persist any artifact (brief, slice map, spec, sketch, review, summary) to disk, you decide where. There is no enforced layout.
