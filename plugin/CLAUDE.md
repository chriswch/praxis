# Praxis Plugin

This plugin provides Praxis's craft and forge workflows as slash commands and
skills for Claude Code. It stands on its own — no orchestrator, no runtime
state, no filesystem convention imposed by the plugin itself.

- Entry points: `/craft` and `/forge`, defined under `commands/`.
- Stage skills under `skills/`: clarifying-intent, slicing-stories,
  sketching-design, driving-tdd, code-reviewing, code-improving,
  rapid-implementing, verifying-and-adapting.
- Each skill is stateless and dual-mode: it reads an input path when one is
  named in the prompt, reads the prompt body otherwise; it writes to an
  output path when one is named, responds inline otherwise.
- Skills never hardcode a directory layout. Paths always come from the
  caller's prompt.
- Authoritative Claude plugin surfaces live under `.claude-plugin/`.

Do not import concepts that only exist outside the plugin (campaign state,
run metadata, dispatch envelopes, etc.) into skill prose. If a caller wants
to pass extra context, it arrives as a normal field in the skill's input
envelope.
