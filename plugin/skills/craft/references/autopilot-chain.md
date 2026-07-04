# Autopilot chain — why the clarifying-intent directive exists

Background for the injectable directive in `SKILL.md` → *Autopilot invocation directives*. You don't need this to run the pipeline; read it when you're wondering why one skill is handled differently in autopilot.

## The precondition

Attach the autopilot persistence directive to **any pipeline skill that runs inline in your (the orchestrator's) context** — i.e. any skill without `context: fork`. Today that is only `clarifying-intent`; the check is on the `context:` frontmatter, not on the skill's name, so a future inline skill would qualify automatically.

## Why forked skills don't need it

The other six pipeline skills each run in their own forked context: they do their work, return a compact tool result to the orchestrator, and the orchestrator's next action is naturally a tool call (the next skill). The orchestrator never authors the skill's output itself, so it never enters the "I just emitted a structured response" state that triggers end-of-turn in the model.

## Why an inline skill does

`clarifying-intent` runs inline in the orchestrator's context, so the orchestrator IS clarifying-intent while the skill executes. Two consequences:

**Persistence is the orchestrator's job, not the skill's.** `clarifying-intent`'s frontmatter grants no `Write` (it stays read-only by design), but the inline turn is the orchestrator's turn and carries the orchestrator's full tool grant — so the `Write` happens under the orchestrator's authority once the skill's read-only analysis is done. An earlier design told the skill to "persist your artifact," which contradicted its no-Write grant; the artifact is written by the orchestrator instead.

**Emitting the artifact as text ends the turn.** The end-of-turn trigger isn't the length of the output — it's the act of emitting a substantive text response after completing the work. Even a ~500-character structured status report triggers it, because the model treats any structured report as a completed deliverable that ends the message. No amount of "do not end the turn" instruction reliably overrides this default; the only robust fix is to not emit the report at all.

This end-of-turn-on-text-emission behavior is an observed Claude-runtime trait and may not apply on other runtimes such as Codex; the persistence-to-disk handoff in the directive is the runtime-neutral mechanism that preserves the chain either way.

## How the directive preserves the chain

The directive mimics what forked skills do naturally: no text between work completion and the next tool call. The orchestrator's `Write` to `.praxis/` preserves the artifact for downstream skills; routing straight to the next tool call (the routing itself lives in *Steps* §1, not duplicated in the directive) preserves the chain. Text is only emitted when we actually want the chain to stop (`open-questions` or `spec-issue`) — there, the orchestrator's hard-stop handling takes over.
