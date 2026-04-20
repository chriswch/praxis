# Praxis Plugin — Codex Instructions

This plugin provides Praxis's craft and forge workflows as installable slash
commands and skills for Codex. It stands on its own — no orchestrator, no
runtime state, no filesystem convention imposed by the plugin itself.

- The canonical entry points are `/craft` and `/forge`, defined under
  `commands/`.
- Reusable stage skills (clarifying-intent, slicing-stories, sketching-design,
  driving-tdd, code-reviewing, code-improving, rapid-implementing, and
  verifying-and-adapting) live under `skills/`.
- Each skill is stateless and dual-mode: it reads an input path when one is
  named in the prompt, reads the prompt body otherwise; it writes to an output
  path when one is named, responds inline otherwise.
- Skills do not hardcode any directory layout. Every path — for inputs, for
  outputs, for cross-step context — arrives from the caller's prompt.
- Authoritative Codex runtime configuration lives under `.codex-plugin/`.

Do not import concepts that only exist outside the plugin (campaign state, run
metadata, dispatch envelopes, etc.) into skill prose. If a caller wants to pass
extra context, it arrives as a normal field in the skill's input envelope.
