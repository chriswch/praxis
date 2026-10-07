# Praxis

Praxis is an agent workflow for Claude Code and Codex. It takes one feature from a request to stacked, reviewed pull requests. It clarifies the requirements, designs the data model and API, and builds each story test-first in its own git worktree. A fresh reviewer checks every story. Praxis stops at local commits until you tell it to publish.

## How a run goes

```
start     a worktree at .praxis/<feature>/worktree, from the remote
          default branch; your own checkout is never touched
  |
Plan      goal, rules with key examples, out of scope, assumptions;
          questions for you; stories that can each ship on their own
Design    data model and schema (type, nullability, reason per field),
          API, layering; destructive changes need your approval
  |
  +- for each story
  |  Build    scenarios -> PR plan -> for each PR: tests, freeze,
  |           code, then commit only when the PR's tests pass
  |  Review   a fresh reviewer, up to 3 rounds; then every PR's tests
  |           rerun at its own commit
  |
Feature review   the whole branch, checked against the requirements
Finish           a final message; stacked PRs only when you say so
```

- **One PR per concern.** Each pull request is one commit with one concern, split by kind of change (tidying, schema change, behavior, cleanup), never by architecture layer.
- **Disclosed test edits.** Before a behavior PR's code is written, its tests are frozen. Any test changed after that is listed in the final message.
- **Local commits only.** Nothing leaves your machine until you ask for it, and Praxis never merges.

### Modes

- **auto** (default): runs to the end, stopping only when it needs you. That means a question it cannot settle from the code or your rules, a missing permission or environment, a test that already fails on the base commit, or a destructive schema or API change you have not approved in your own words.
- **step**: also pauses after every step; Build pauses once per story. Your reply continues the run.

### What it writes

Everything goes under `.praxis/` in your repository, which Praxis adds to `.git/info/exclude`, so it is never committed.

| Path | Holds |
|---|---|
| `.praxis/config.json` | how to run the repository's tests, and how to prepare a new worktree |
| `.praxis/taste.md` | this repository's taste: where its standards documents are, and rules you stated for it |
| `.praxis/<feature>/plan.md` | requirements, questions, stories, design, review findings |
| `.praxis/<feature>/prs/` | one description per PR, ready to publish |
| `.praxis/<feature>/worktree/` | the feature branch |

## Install

### Claude Code

```shell
/plugin marketplace add chriswch/praxis
/plugin install praxis@chriswch-atelier
/reload-plugins
```

Every commit to `main` is a new version. To get updates automatically, open `/plugin`, go to **Marketplaces**, select **chriswch-atelier**, and choose **Enable auto-update**.

### Codex

```shell
codex plugin marketplace add chriswch/praxis
codex plugin add praxis@chriswch-atelier
```

Codex refreshes the plugin when it finds a new commit, both in a background check at startup and on `codex plugin marketplace upgrade`.

Codex's default sandbox keeps `.git` read-only, which blocks the worktree and the commits. Allow writes to each repository you run Praxis in, in `~/.codex/config.toml`:

```toml
[sandbox_workspace_write]
writable_roots = ["/absolute/path/to/your-repo/.git"]
```

### Requirements

- `python3` 3.9 or later. The macOS system Python is enough.
- git 2.31 or later.
- `gh`, logged in to an account that can see the repository, to publish.

Start Claude Code or Codex from inside the repository. That way per-directory settings, such as a direnv `.envrc` that picks the `gh` account, are in effect.

## Use

- **Start:** describe the feature and ask for Praxis. In Claude Code use `/praxis:praxis`; in Codex use `$praxis`. Add "in step mode" to pause after every step.
- **First run in a repository:** the agent writes `.praxis/config.json` and a line in `.praxis/taste.md` that points to the repository's standards documents. Check both once. `test_cmd` must contain `{files}`.

  ```json
  {"test_cmd": "bundle exec rspec {files}", "test_glob": "spec/**/*_spec.rb", "setup": "cp \"$WF_MAIN/config/database.yml\" config/"}
  ```

- **Resume:** open a session in the repository and ask to continue the run. The state lives in `.praxis/<feature>/`.
- **Changes after the run:** ask for them. Each one goes into the PR it belongs to, and every PR's tests run again.
- **Publish:** say so, and say whether you want draft PRs. Branch names follow the convention in `.praxis/taste.md`.
- **Clean up:** after the PRs merge, remove the worktree with `git worktree remove`.

## Rules the agent follows

Precedence, from highest:

1. **Repository taste** (`.praxis/taste.md`)
2. **The repository's committed conventions:** its standards documents, `AGENTS.md`, `CLAUDE.md`, lint and CI config
3. **Your global taste** (`~/.praxis/taste.md`)
4. **Standards bundled with the plugin**
5. **Current official or mainstream practice** for the repository's versions, with a cited source
6. **Existing code**, only where nothing above has an opinion

A higher rule overrides a lower one only on the point it states. These rules apply to new code and to code a story changes anyway.

PR descriptions follow the repository's PR template, plus your voice profile in `~/.praxis/voice.md` if you have one.

## Design philosophy

- **Build what the request needs, and nothing more.** No speculative fields, options, or abstractions. Special cases wait until they actually happen.
- **One living document.** `plan.md` is the only handoff between steps. The agent rereads its inputs at the start of every step, so compaction or a new session loses nothing.
- **Scripts check, the model judges.** The bundled `wf` script records where the run is and refuses to move on when a deterministic check fails. Everything that needs judgment is left to the agent.
- **Tests prove behavior.** Tests are sociable: they use real collaborators, including the project's own database, and mock only third-party services, the network, and the clock. They cover the happy path plus failures with real consequences.
- **The reviewer judges what landed, not what was intended.** It never sees the plan or the design. It reports only four things:
  - behavior that does not match the PR description;
  - a failure with real consequences;
  - code that can be deleted;
  - a broken rule.
- **You stay in control of what leaves your machine.** Destructive changes need your approval in your own words, publishing waits for your word, and merging is always yours.
