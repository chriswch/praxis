# Claude Hooks

Repo-scoped hook entrypoints live here.

Suggested hook responsibilities:
- Before stage launch: read the worker-launch payload and confirm the target stage, artifact dir, and handoff path.
- Before slice-level `clarifying-intent`: inject `inputs.boundary_handoff` when present.
- After stage completion: write `{artifact-dir}/results/<stage>.json` before asking the orchestrator to advance.

Praxis does not commit team-specific commands here by default. Add local hook scripts in this folder when a repo needs them.
