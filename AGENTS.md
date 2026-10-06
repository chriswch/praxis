# Praxis

An agent workflow plugin for Claude Code and Codex: one skill, `plugin/skills/praxis/`, and its script `scripts/wf.py`. The design and the reason for each decision are in `docs/design.md`.

## Commands

- Run all tests: `python3 -m unittest discover -s tests`
- Validate the plugin and the marketplace: `claude plugin validate plugin` and `claude plugin validate .`
- Load this checkout's plugin for one Claude Code session: `claude --plugin-dir plugin`

## Rules

- Every commit on `main` ships to users, because the Claude manifest has no `version`. Keep the tests green before committing.
- `wf.py` uses only the Python standard library and runs on Python 3.9, the macOS system Python.
- Before adding a standard, a reference file, or a skill, follow the `擴充` section of `docs/design.md`.
