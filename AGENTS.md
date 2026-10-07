# Praxis

An agent workflow plugin for Claude Code and Codex: one skill, `plugin/skills/praxis/`, and its script `scripts/wf.py`. README.md explains the workflow to users.

Each behavior is written down in exactly one place:
- `SKILL.md` says what the agent does.
- `wf.py` says what the script checks.
- The test names in `tests/test_wf.py` say what each behavior is.

Do not restate these elsewhere. The one exception is README.md, which summarizes them for users. When a behavior changes, update README.md in the same commit.

## Commands

- **Run all tests:** `python3 -m unittest discover -s tests`
- **Validate the plugin and the marketplace:** `claude plugin validate plugin` and `claude plugin validate .`. The validator warns that the Claude manifest has no version. Keep it that way; see below.
- **Load this checkout's plugin for one Claude Code session:** `claude --plugin-dir plugin`
- **Try it in Codex without touching your setup:** point `CODEX_HOME` at a temporary folder that holds a copy of your `config.toml` and a link to `auth.json`. Then run `codex plugin marketplace add <this checkout>` and `codex plugin add praxis@chriswch-atelier`.

## Rules

- **Every commit on `main` ships to users.** Keep the tests green before committing.
- **`wf.py` uses only the Python standard library and runs on Python 3.9,** the macOS system Python.
- **Every `SKILL.md`:**
  - has only `name` and `description` in its frontmatter;
  - stays under 5k tokens, because compaction re-attaches only the first 5k;
  - contains no `${…}`, `$ARGUMENTS`, or `` !` ``, because these only expand when a skill is invoked.

  `tests/test_package.py` checks all three.

## Decisions to keep, and why

- **The Claude manifest has no `version`.** A version keeps users on it until you change it. Without one, every commit is a new version, and auto-update picks it up.
- **The Codex manifest keeps `"version": "1.0.0"`.** Codex reinstalls a Git marketplace's plugins whenever it finds a new commit, whatever the version. Only installs from a local path need a manual reinstall.
- **SKILL.md runs the script as `python3 <this SKILL.md's directory>/scripts/wf.py`.**
  - Codex does not substitute `${CLAUDE_PLUGIN_ROOT}`.
  - Only Claude Code puts `bin/` on the PATH, and claude.ai refuses plugins that ship one.
  - Packaged skills may lose the executable bit.
- **`wf` reads `.praxis/config.json` itself instead of taking flags.** The test and setup commands reach `sh -c` unchanged, so `$WF_MAIN` is never expanded by the agent's shell. JSON because Python 3.9 has no `tomllib`.
- **`.praxis/` goes into `.git/info/exclude`.** Team repositories cannot commit it.
- **Worktrees live at `<repo>/.praxis/<feature>/worktree`.** Untracked version files such as `.ruby-version` are found by walking up to the main checkout.
- **`pr-done` registers the subject the commit actually got,** and publish uses it as the PR title. Commit hooks may rewrite the message, for example to add a ticket key.
- **Review fixups are committed with `--no-verify`.** Commit hooks may rewrite the `fixup!` subject that autosquash looks for. The gate reruns the PR's tests afterwards.
- **The reviewer's model and effort are Agent tool parameters, not an agent file.** The tool's `model` parameter overrides an agent file, and a user's global rules may ask for a cheap model on every dispatch.
- **Publish checks `gh repo view` before it pushes anything.** Otherwise a `gh` account that cannot see the repository leaves branches pushed with no PRs.
- **Everything ships in one plugin.** Plugin dependencies exist only in Claude Code, and reading files across plugins has no portable way.

## Extending

Ask in order; the first "yes" decides where new content goes.

1. **Can a tool decide it** (formatter, linter, migration check)? Then it belongs to the repository's own tools or CI. A standard only names the tool.
2. **Is it a team convention for one repository?** Then it goes in that repository's standards documents, or in its `AGENTS.md`/`CLAUDE.md` if it has none.
3. **Is it a one-line personal decision?** Then it goes in taste: `.praxis/taste.md` for one repository, `~/.praxis/taste.md` for all.
4. **Does it change how the workflow runs?** Then it goes in `SKILL.md`. A deterministic check goes in `wf.py`.
5. **Is it several code rules for one domain, used at specific steps?** Then it goes in `plugin/skills/praxis/standards/<topic>.md`, plus one row in the standards table in `SKILL.md`: file, steps, when it applies. Create the table with the first standard. `wf` gives the reviewer every `skills/*/standards/*.md`.
6. **Is it also needed outside a run, after you have asked an agent for the same job twice?** Then it becomes a new skill, `plugin/skills/<gerund-object>/`.
   - Its code rules go in its own `standards/`, and other reference material goes in `references/`.
   - Praxis reads it at the path `wf status` prints and never invokes it, so its frontmatter holds only `name` and `description`, and its internal links are relative.
   - Add a line to `SKILL.md` that names the step that reads it.

Skill names are permanent: a plugin has no migration path for renaming a skill.
