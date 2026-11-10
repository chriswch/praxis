---
name: craft
description: Runs a complete software-engineering workflow for one
  feature - finds the root problem and the root solution, with research
  and spikes, clarifies requirements and slices stories, designs the
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

## Inputs and precedence

At the start of every step, and of every story in Build, read what that step needs, even if you read it before: compaction may have dropped it.

- Repo taste: `<repo>/.praxis/taste.md`. It also names the repo's standards documents; read the ones that apply.
- The repo's committed conventions: its standards documents, AGENTS.md, CLAUDE.md, lint and CI config.
- Praxis's standards and voice, at the steps the table below names. They are files of the applying-taste skill, in the folder of the `skill:` path `wf status` prints: read them there and never invoke that skill.

A missing file is normal; skip it. When sources disagree, a higher source overrides a lower one only on the point it states:

1. repo taste
2. the repo's committed conventions
3. this plugin's standards (files under `standards/` in its skills)
4. current official or mainstream practice for the versions this repo uses: look it up and cite the URL
5. existing code, only where nothing above has an opinion

This applies to new code and to code the story changes anyway. Old code that should change goes into its own structural PR.

| Standard | Read at | Applies to |
|---|---|---|
| `applying-taste/standards/design.md` | 2 Design, 3 Build | all code and tests |
| `applying-taste/standards/data.md` | 2 Design, 3 Build | schema migrations, and scripts that change data |
| `applying-taste/standards/tests.md` | 3 Build | all tests |
| `applying-taste/standards/comments.md` | 3 Build | every comment you write or keep |

Voice applies only to the text published with a PR: its description, inline comments, and PR comment. Follow `applying-taste/references/voice.md`; the repo's PR template and documentation conventions override it on the points they state.

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
2. Tests follow `applying-taste/standards/tests.md`: which cases to cover, and what may be mocked.
3. Code, tests, comments, and commit messages never mention this workflow: no step names, story or PR numbers, or Praxis terms.
4. Split PRs by kind of concern, never by architecture layer. One PR is one commit and one concern; combine concerns only when the change is small and simple. Every PR is green on its own. A fix the feature itself needs that belongs to no PR goes into the closest PR when it is small and simple; otherwise tell the user it needs a run of its own. A problem found along the way that the feature does not need is listed for the user, not fixed.
5. Write nothing without a present use: no speculative fields, branches, options, or abstractions.
6. Never push without the user's instruction, and never merge. A destructive change is approved only by the user's own words, and one approval covers one named change.
7. A PR description follows the voice above and states each decision with its reason and evidence (a URL, a spike's output), since the reviewer reads only the PR files. A fix states the cause and how the change removes it.

## Start

1. Name the feature with letters, digits, `.`, `_`, or `-`; it becomes the branch name.
2. On the first run in a repository, before `wf start`:
   - Write `<repo>/.praxis/config.json` with `test_cmd`, `test_glob`, and optionally `setup`. Find the commands in CI config, the README, or the build files. For example:
     `{"test_cmd": "bundle exec rspec {files}", "test_glob": "spec/**/*_spec.rb", "setup": "cp \"$WF_MAIN/config/database.yml\" config/"}`
     - `test_cmd` runs the given test files; `{files}` marks where `wf` puts them.
     - `test_glob` matches test file paths; `**` spans folders.
     - `setup` prepares a new worktree: copy the untracked config the tests need from `$WF_MAIN` (the main checkout), and install only project-local dependencies, with a tool that has a global cache. The test database is shared with the main checkout; setup does not create or reset it. Everything setup creates must be ignored by git; `wf start` refuses anything else.
   - Write one line in `<repo>/.praxis/taste.md` that names the repo's standards documents (for example guides under `docs/`), so you and the reviewer read them.
3. From the repository, run `wf start <feature>` (with `--mode step` if the user asked for it), then cd into the worktree it prints.
4. If setup fails, fix config.json and rerun `wf start <feature>`; for an existing feature it only reruns setup. If you cannot fix it, stop and ask.

## 1 Plan

Fill in plan.md in the order of the headings `wf start` created. Where research or spikes are not needed, say why.

- `## Problem`: the root problem, not the symptom: what is wrong or missing, its root cause (for a new feature, the underlying need and the hard part), and the evidence: code paths, logs, data. Reproduce a bug first; mark an unconfirmed cause as a hypothesis.
- `## Approach`: the root solution, one that removes the root cause instead of patching the symptom, and how it does. When ways to do it differ in what users see or in the cost of changing course later, when the work uses a library, platform, API, or protocol in a way this repo has not, or when the cause is unclear, first research official docs for this repo's versions, then mainstream practice, then community sources, citing URLs, and compare 2-3 candidates. A candidate that breaks a higher rule in the precedence is out.
- `## Spikes`: spike every assumption the plan rests on, unless an existing test or production code already shows it. A spike is a throwaway script under `spikes/` in the feature folder, never in the worktree; it answers one question and changes nothing outside this machine. Record the question, the command, the trimmed output, and the assumption it supports or breaks; a broken one sends you back to Approach. One you cannot run here is an unverified assumption.
- `## Requirements`: the goal; the rules, each with a key example; what is out of scope; Assumed, the decisions you made yourself.
  - A rule says what a user or caller observes.
  - A decision the request settles, such as a spec or a ticket's chosen design, stands; note a better candidate in Approach. A solution the request only proposes is one candidate, and a better one wins, as Assumed. When unsure, treat it as settled.
  - These go under `## Questions`, never Assumed: evidence that a settled decision cannot deliver the request's goal or only patches the symptom, with a design that would; a gap whose options give users different behavior that neither the code nor research settles; a decision that would leave part of the request unmet; any part of the request you could not read, such as an image.
- `## Questions`: everything you need the user to answer, asked at once. Merge each answer into the right section and delete the question.
- `## Stories`: in build order, one `### ` heading per story, named by one observable behavior. Each story can ship on its own. Every rule belongs to a story or is out of scope. Story titles are unique, and a story's heading never changes once it has frozen tests or a PR: `wf` tracks stories by title. Before that, you may still add, reorder, or rename stories.

`wf next` moves on once `## Questions` is empty and Problem, Approach, and Spikes are filled.

## 2 Design

Write `## Design`:

- The data model and DB schema: for every new or changed column, its type, whether it can be null, and why it exists.
- The API.
- Layering: where the new code goes.
- Destructive schema or API changes, flagged, with the user's approval quoted.
- For each major decision, the reason and its source: a taste line, a project file, an official document URL, or a spike.

Spike each assumption the design adds, as in Plan. Then run `wf next`; it refuses a worktree with changes and starts Build on the first story.

## 3 Build, for each story

Under the story's `### ` heading, write three parts with bold labels. Never use a heading there, because `wf` reads `### ` as a story.

- **Design changes**: what this story adds to or changes in `## Design`, in the same form.
- **Scenarios**: Given/When/Then, chosen by rule 2. Each one becomes one sociable test. A stubbed external service returns what a spike recorded.
- **PR plan**: ordered by kind of concern: structural tidying → schema migrations → the behavior with its tests → cleanup that follows.

For each PR:

1. A behavior PR starts with its tests. Once they are written, run `wf freeze`.
2. Implement.
3. Write `prs/NN-slug.md` in the feature folder, next to plan.md and outside the worktree, where `NN` counts PRs across the feature: first line `# <title>`, then the description. The title becomes the commit message and the PR title, so write it in the repo's commit convention; the rest becomes the PR body. The title is final once `wf pr-done` commits it; later edits change only the body.

   Next to it, when the PR needs them:
   - `NN-slug.inline.json`: the inline comments, a JSON list of `{"path": ..., "line": ..., "body": ...}`. `line` is a line this PR adds, numbered as in this PR's commit; when a fixup moves it, update the number.
   - `NN-slug.comment.md`: the PR comment, for a script someone must run by hand. The script goes in this comment, never in the worktree, because `wf pr-done` commits everything there.
4. Run `wf pr-done <PR file> [related tests…]`. It stages everything, runs the PR's changed tests plus the related tests you name (existing tests that cover the code you changed), and commits only when they pass. The full suite runs in CI after push. If `test_cmd` itself is wrong, fix config.json; the next call uses it.

When every PR in the plan is committed, run `wf next`.

## 4 Review, for each story

1. Run `wf review`. It prints the reviewer brief and refuses a fourth round.
2. Start a fresh subagent whose entire prompt is that brief, word for word: in Claude Code, the Agent tool with a general-purpose agent, `model: opus`, and `effort: xhigh`; in Codex, a delegated subagent.
3. Copy each finding into `## Findings` as one line that starts with its scope and round (for example `story 2, round 1:`) before you handle it, then add what you did on the same line:
   - Fix: `git commit --no-verify --fixup <commit of the PR it belongs to>` (commit hooks could rewrite the fixup message that autosquash looks for), then `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash <base commit>`, with the base commit from `wf status`.
   - Dismiss: write the reason. A finding that shows a rule in `## Requirements` unmet is never dismissed by rewording the rule or a description: fix it, or ask the user under `## Questions`.

Stop when a round fixes nothing, or after round 3. Then run `wf next`; it reruns each PR's tests at its own commit and moves on.

## 5 Feature review

The same as Review, over the whole branch; the brief adds the requirements. `wf next` then finishes the run and prints `changed_after_freeze` lines.

## Finish

1. Add to the repo taste only patterns the user explicitly said apply generally: one line each, with the user's words as the source. Replace a line it contradicts; skip what another rule file already says. A decision for this run alone stays in plan.md.
2. Send the final message, listing:
   - the Assumed decisions;
   - unverified assumptions, and candidates in `## Approach` that a settled decision ruled out;
   - dismissed findings;
   - the feature review's round-3 findings and what you did, noting those fixes were not reviewed again;
   - tests changed after freeze, from the `changed_after_freeze` lines;
   - changes to the repo taste;
   - the worktree path, with a reminder that once the PRs merge, the worktree (`git worktree remove`), the branch named after the feature, and `.praxis/<feature>/` can all be removed.
3. If the user asks for changes before publishing, handle each like a finding: a fixup into the PR it belongs to, then autosquash. Then run `wf next` to rerun every PR's tests and the freeze report.
4. When the user tells you to publish, run `wf publish <branch>…` (with `--draft` if they ask for draft PRs) with one branch name per PR, in stack order, following the repo's branch convention from the repo taste or its standards documents. It checks everything before it pushes, then opens each PR and posts its comments. Never merge.
5. Once a branch is published, follow `applying-taste/references/git.md`: a later change, including one from PR review, is a new commit on the branch of the PR it belongs to.
