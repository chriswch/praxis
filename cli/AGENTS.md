# Praxis CLI — Codex Instructions

Praxis is a TypeScript CLI at `cli/`. It is the orchestrator that
drives plugin-side skills via prompt-based dispatch. All workflow semantics,
contracts, and runtime control live in the CLI; the plugin supplies skills
that the CLI composes prompts for at dispatch time.

- Treat `cli/src/workflows/`, `cli/src/contracts/`, and
  `cli/src/runtime/` as the source of truth.
- Install and work from `cli/` (`npm install`, `npm run build`,
  `npm test`).
- The CLI→plugin boundary is the `cli/src/runtime/dispatch/`
  module. Prompt composition, input staging, and output parsing all route
  through there; no other CLI file composes plugin-facing prompts.
- Keep orchestration in the main session; bounded stage work belongs to the
  current dispatch only.
- When the CLI passes cross-story context as part of an input envelope,
  treat that envelope plus the current dispatch and run metadata as the
  only cross-story carry-forward context.
- Do not rely on transcript continuity between stories; use
  `.praxis/run.json`, the current stage artifacts, and the staged dispatch
  input at `.praxis/dispatch/<stage>/input.json` instead.

Plugin surfaces are the host adapter's concern. The CLI does not read plugin
files on disk beyond its own instruction files (this `AGENTS.md` and the
neighboring `CLAUDE.md`).
