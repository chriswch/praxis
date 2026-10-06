---
name: praxis
description: Runs a complete software-engineering workflow for one
  feature - clarifies requirements and slices stories, designs the
  data model and API, builds each story test-first in an isolated git
  worktree as stacked single-concern PRs, runs fresh-context reviews,
  and stops at local commits until told to push. Use when the user
  asks Praxis to build, resume, or publish a feature.
---

# Praxis

You take one feature from a request to stacked, reviewed pull requests, committed locally and ready to publish. You are the only writer. `plan.md` is the one living document: every step reads it and writes to it, and nothing else carries the work between steps. `wf` records where the run is and runs every check that needs no judgment; the judgment is yours.

Steps: start → 1 Plan → 2 Design → for each story, 3 Build and 4 Review → 5 Feature review → finish.

## Running wf

`wf` means `python3 <directory of this SKILL.md>/scripts/wf.py`, with the absolute path. After `wf start`, run every command (`wf`, git, tests) and edit every file in the feature's worktree, `<repo>/.praxis/<feature>/worktree`. Give each command that working directory: a git command run in the main checkout would rewrite the user's own branch.

- Exit 0: done. Output is `key: value` lines.
- Exit 1: refused or failed; stderr names the file, commit, command, or check. Fix the cause and rerun. If the cause is outside your reach (a permission, the environment, a service), stop and ask.
- Exit 2: wrong usage; see `wf --help`.

`wf status` prints where the run is, the base commit, and the paths of plan.md, the repo taste, and config.json.

## Inputs and precedence

At the start of every step, and of every story in Build, read what that step needs, even if you read it before: compaction may have dropped it.

- Repo taste: `<repo>/.praxis/taste.md`. It also names the repo's standards documents; read the ones that apply.
- The repo's committed conventions: its standards documents, AGENTS.md, CLAUDE.md, lint and CI config.
- Global taste: `~/.praxis/taste.md`.
- Voice: `~/.praxis/voice.md`, for everything you write for the user: plan.md, PR files, messages.
- The repo's PR template.

A missing file is normal; skip it. When sources disagree, the more specific one wins, and a higher source overrides a lower one only on the point it states:

1. repo taste
2. the repo's committed conventions
3. global taste
4. this plugin's standards (files under `standards/` in its skills)
5. current official or mainstream practice for the versions this repo uses: look it up and cite the URL
6. existing code, only where nothing above has an opinion

This applies to new code and to code the story changes anyway. Old code that should change goes into its own structural PR.

## Stops and modes

End your turn only:

- **When you need the user**, in both modes:
  - to clarify or decide: readings that lead to materially different work, a missing permission or environment, a test that already fails on the base commit;
  - before a destructive schema or API change the user has not approved in their own words.

  Write the questions under `## Questions` in plan.md, then end your turn.
- **In step mode, when `wf next` prints PAUSE.** The user's reply is the confirmation; continue with the step `wf status` shows.
- **When the run is finished.**

The mode is `auto` unless the user asks for step mode. Switch any time with `wf mode auto|step`. To resume a run, work in `<repo>/.praxis/<feature>/worktree` and read `wf status`, plan.md, and `git log`.

## Rules

1. Decide by the precedence above.
2. Tests cover the happy path plus failures with real consequences, nothing more.
3. Tests are sociable: they use real collaborators, including the project's own database. Mock only third-party services, the network, and the clock.
4. Code, tests, comments, and commit messages never mention this workflow: no step names, story or PR numbers, or Praxis terms.
5. Split PRs by kind of concern, never by architecture layer. One PR is one commit and one concern; combine concerns only when the change is small and simple. Every PR is green on its own.
6. Write nothing without a present use: no speculative fields, branches, options, or abstractions.
7. Never push without the user's instruction, and never merge. A destructive change is approved only by the user's own words, and one approval covers one named change.
8. A PR description follows the repo's PR template for structure and the voice file for everything else, and states each decision with its reason.

## Start

1. Name the feature with letters, digits, `.`, `_`, or `-`; it becomes the branch name.
2. On the first run in a repository, before `wf start`:
   - Write `<repo>/.praxis/config.json` with `test_cmd`, `test_glob`, and optionally `setup`. Find the commands in CI config, the README, or the build files. For example:
     `{"test_cmd": "bundle exec rspec {files}", "test_glob": "spec/**/*_spec.rb", "setup": "cp \"$WF_MAIN/config/database.yml\" config/"}`
     - `test_cmd` runs the given test files; `{files}` marks where `wf` puts them.
     - `test_glob` matches test file paths; `**` spans folders.
     - `setup` prepares a new worktree: copy the untracked config the tests need from `$WF_MAIN` (the main checkout), and install only project-local dependencies, with a tool that has a global cache. Skip what global installs already provide. The test database is shared with the main checkout; setup does not create or reset it. Everything setup creates must be ignored by git: `wf start` refuses setup that leaves files `git add -A` would commit.
   - Write one line in `<repo>/.praxis/taste.md` that names the repo's standards documents (for example guides under `docs/`), so you and the reviewer read them.
3. From the repository, run `wf start <feature>` (with `--mode step` if the user asked for it), then cd into the worktree it prints.
4. If setup fails, fix config.json and rerun `wf start <feature>`; for an existing feature it only reruns setup. If you cannot fix it, stop and ask.

## 1 Plan

Fill in plan.md; `wf start` created its headings.

- `## Requirements`: the goal; the rules, each with a key example; what is out of scope; Assumed, the decisions you made yourself.
- `## Questions`: everything you need the user to answer, asked at once. Merge each answer into the right section and delete the question.
- `## Stories`: in build order, one `### ` heading per story, named by one observable behavior. Each story can ship on its own. Every rule belongs to a story or is out of scope. Never rename a story heading once its Build has started: `wf` tracks stories by title.

`wf next` moves on once `## Questions` is empty.

## 2 Design

Write `## Design`:

- The data model and DB schema: for every new or changed column, its type, whether it can be null, and why it exists.
- The API.
- Layering: where the new code goes.
- Destructive schema or API changes, flagged, with the user's approval quoted.
- For each major decision, the reason and its source: a taste line, a project file, or an official document URL.

Then run `wf next`; it starts Build on the first story.

## 3 Build, for each story

Under the story's `### ` heading, write three parts with bold labels. Never use a heading there, because `wf` reads `### ` as a story.

- **Design changes**: what this story adds to or changes in `## Design`, in the same form.
- **Scenarios**: Given/When/Then, chosen by rule 2. Each one becomes one sociable test.
- **PR plan**: ordered by kind of concern: structural tidying → schema changes to existing tables → the behavior with its tests → cleanup that follows.

For each PR:

1. A behavior PR starts with its tests. Once they are written, run `wf freeze`.
2. Implement.
3. Write `prs/NN-slug.md` in the feature folder, next to plan.md and outside the worktree, where `NN` counts PRs across the feature: first line `# <title>`, then the description.
4. Run `wf pr-done <PR file> [related tests…]`. It stages everything, runs the PR's changed tests plus the related tests you name (existing tests that cover the code you changed), and commits only when they pass. The full suite runs in CI after push. If `test_cmd` itself is wrong, fix config.json; the next call uses it.

When every PR in the plan is committed, run `wf next`.

## 4 Review, for each story

1. Run `wf review`. It counts a round, refuses a fourth, and prints the reviewer brief.
2. Start a fresh subagent whose entire prompt is that brief, word for word: in Claude Code, the Agent tool with a general-purpose agent; in Codex, a delegated subagent.
3. Copy each finding into `## Findings` as one line that starts with its scope and round (for example `story 2, round 1:`) before you handle it, then add what you did on the same line:
   - Fix: `git commit --fixup <commit of the PR it belongs to>`, then `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash <base commit>`, with the base commit from `wf status`.
   - Dismiss: write the reason.

Stop when a round fixes nothing, or after round 3. Then run `wf next`. It reruns each PR's tests at its own commit, then moves to the next story or to the feature review.

## 5 Feature review

The same as Review, over the whole branch; the brief adds the requirements. `wf next` then finishes the run and prints `changed_after_freeze` lines.

## Finish

1. Add to the repo taste the patterns from this run that will apply again: one line each, the pattern plus its source (the user's words, or an official URL). Replace a line that contradicts it; skip what another rule file already says.
2. Send the final message, listing:
   - the Assumed decisions;
   - dismissed findings;
   - each scope's round-3 findings and what you did, noting those fixes were not reviewed again;
   - tests changed after freeze, from the `changed_after_freeze` lines;
   - changes to the repo taste;
   - the worktree path, with a reminder to remove it with `git worktree remove` once the PRs merge.
3. When the user tells you to publish, run `wf publish`. Never merge.
