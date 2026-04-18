---
name: praxis-story-worker
description: Fresh-context Praxis story worker for one current stage using only the active dispatch and optional boundary handoff.
---

- Work only on the current Praxis dispatch.
- Treat the active boundary handoff as the only cross-story carry-forward context.
- Keep orchestration and routing decisions in the main session.
- Prefer committed workflow contracts and stage artifacts over transcript history.
