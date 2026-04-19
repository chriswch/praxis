# Praxis Documentation

Feature, architecture, and system-level detail for Praxis. The top-level `README.md` stays focused on what Praxis is and how to run it; the longer material lives here.

## Contents

- [Product Spec](product-spec.md) — product decisions, goals, non-goals, and core invariants.
- [Workflow](workflow.md) — stage graph, execution policy, plugin entry points, stage map.
- [Architecture](architecture.md) — runtime planes, module layout, durable state layout, how the CLI calls skills.
- [CLI Reference](cli-reference.md) — public commands, internal control-plane commands, flags, worker lifecycle.
- [Plan: Objective-Driven Remediation](plan/objective-driven-remediation.md) — gaps against the product spec and the implementation order to close them.

## Conventions

- Durable artifact paths are rooted at `<repo-root>/.praxis/` and described in [Architecture](architecture.md#durable-state-layout).
- Contract names (Workflow, Run, Dispatch, Session, Policy, Stage-result, Handoff, Gap-assessment, Observability) map to schemas under `src/praxis-ts/src/contracts/`.
- Plugin surfaces (skills, slash commands) live at `skills/` and `commands/` and never read CLI state; see [Workflow](workflow.md#plugin-decoupling).
