---
description: Drive the full Praxis craft workflow with user checkpoints between stages.
allowed-tools: Skill(praxis:clarifying-intent), Skill(praxis:slicing-stories), Skill(praxis:sketching-design), Skill(praxis:driving-tdd), Skill(praxis:code-reviewing), Skill(praxis:code-improving), Skill(praxis:verifying-and-adapting)
---

# Craft

## Task

$ARGUMENTS

## Claude-Specific Delta

- Use the listed Praxis stage skills as workers.
- `clarifying-intent` may run inline when user interaction is required.
- Prefer `driving-tdd` and `verifying-and-adapting` for the implementation and closeout stages.
