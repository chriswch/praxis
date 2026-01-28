---
name: clarify-intent
description: Clarify ambiguous ideas, features, tasks, user stories, or problems by eliciting intent, constraints, unknowns, risks, and success criteria; ask focused questions; then produce a structured brief (goals, non-goals, assumptions, open questions, acceptance criteria, and next steps). Use when a request is vague/underspecified, when scoping work, or before planning/coding.
---

# Clarify Intent

## Overview

Turn an underspecified request into an actionable, shared understanding by asking high-leverage questions and summarizing the result as an "Intent Brief".

## Workflow

1. Decide whether clarification is needed.
   - Proceed immediately only if you can state the goal, deliverable, constraints, and definition of done with high confidence.
   - Otherwise, switch into "clarify" mode.

2. Reflect back the current understanding.
   - Restate the request in 1–3 bullets.
   - Call out any assumptions you are currently making.

3. Ask a small batch of high-leverage questions.
   - Ask 3–7 questions at a time; wait for answers; iterate.
   - Prioritize blockers (answers that change approach or scope).
   - Offer options when that reduces ambiguity.

4. Track unknowns, risks, and decisions.
   - Maintain an explicit list of open questions (mark "blocker" vs "nice-to-have").
   - Note constraints and decisions as they become clear.

5. Propose a draft "Intent Brief".
   - Summarize goals, non-goals, constraints, acceptance criteria, assumptions, open questions, risks, and next steps.
   - Ask for confirmation/corrections before doing substantive work.

6. If the user cannot answer key questions, offer next-step tactics.
   - Suggest a quick spike/prototype, gathering examples, consulting stakeholders, or defining a temporary assumption with a timebox.

## Default Output

Use this structure unless the user requests otherwise:

- **Clarifying questions**: numbered, grouped by theme
- **Working assumptions**: what you will assume if unanswered
- **Unknowns & risks**: open questions + potential pitfalls
- **Intent brief**: goals, non-goals, constraints, definition of done
- **Next steps**: smallest set of actions to move forward

For full templates and question sets, read:
- `references/templates.md`
- `references/question-bank.md`

## Questioning Heuristics

- Ask for concrete examples (inputs/outputs, screenshots/logs, "what would a good result look like?").
- Separate "goal" from "solution" (what they want vs how to do it).
- Confirm scope boundaries early (in-scope / out-of-scope).
- Elicit constraints explicitly (time, budget, platform, policies, performance, security/privacy).
- Surface tradeoffs when constraints conflict; propose 2–3 viable options.
- Stop asking once you can write a credible definition of done; proceed and keep remaining unknowns explicit.

## Common Traps To Avoid

- Do not ask a long questionnaire up front; batch and iterate.
- Do not implicitly accept ambiguous terms ("fast", "simple", "secure"); ask what they mean.
- Do not guess silently; make assumptions explicit and confirm.
