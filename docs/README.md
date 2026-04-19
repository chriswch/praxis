# Praxis Documentation

Praxis is a CLI agent. You give it an intent; it iterates against the repo until the code matches the intent or the loop exhausts its budget. Each pass derives a target spec, finds the gap, remediates through the `craft` workflow, and reassesses.

Praxis owns the loop. Claude Code and Codex do the bounded work as CLI subprocesses.

## Contents

- [Workflow](workflow.md) — the craft stage graph and the converge loop that drives it.
- [Architecture](architecture.md) — layers, contracts, data flow, and file structure.

## Core Ideas

- The CLI is the product. Plugin surfaces are thin wrappers over skills.
- Praxis calls agents only through the `/praxis:<stage>` slash command. Skills never read CLI state.
- Workflow truth lives under `.praxis/`. Transcripts explain what happened; they never advance the run.
- Fresh context at every stage. Cross-story context passes only through the explicit handoff contract.
