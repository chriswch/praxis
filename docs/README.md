# Docs

This directory contains committed documentation for features that Praxis already
implements and exposes.

Do not put WIP feature plans, target-architecture drafts, or migration gap notes
here. Keep those local runtime notes under `.praxis/runtime/docs/` so they stay
out of the committed project docs.

## Current Feature Docs

- `docs/features/workflows.md` - the shipped `craft` and `forge` workflows,
  plus execution modes
- `docs/features/runtime.md` - durable state, orchestration, handoffs, resume,
  and trace behavior
- `docs/features/adapters.md` - current Claude and Codex integration surfaces
- `docs/features/evals.md` - eval and contract-test coverage available in the repo

## Update Rule

When shipped behavior changes:

1. Update `README.md` for the project-level overview.
2. Update the matching file in `docs/features/`.
3. Update `workflow/reference/runtime-reference.md` if the runtime contract or
   operational semantics changed.
