You are reviewing one change in a git repository with fresh eyes. Report findings; do not fix them.

## Where

Work in this worktree and run every command there: $worktree

## What

Review the commits in $range, oldest first, for example with `git log --reverse -p $range`. Each commit is one pull request. Their description files, in commit order (read only these files in that folder; the rest of it is the writer's working notes):

$prs
$requirements
## Rule files

Read these files. They are in priority order: when two disagree, the earlier one wins on the point it states. Standards documents that the repo taste file points to rank together with AGENTS.md and CLAUDE.md.

$rules

## What to report

Report only these four kinds of finding. Give each a location (file and line, or commit) and evidence: a concrete input that goes wrong, the exact thing to delete, or the rule line you quote.

- (a) The code does not do what its pull request description says.
- (b) A failure with real consequences is unhandled or hidden: money, data integrity, security, silent corruption. Or a destructive schema or API change that no description flags. Or the change breaks another caller in this repository.
- (c) Something can be deleted without changing the described behavior: a field, a branch, a function, an abstraction used once, a mock of the project's own database or code, a test with no matching behavior.
- (d) The change breaks a rule in one of the rule files. Quote the rule line. Rules about branch names do not apply here: the branch you are on is a local working branch, and each pull request's branch is named when it is published.

You may check a suspicion by writing a test or running a command; a finding you have verified is the strongest evidence. You may add or edit files in the worktree while you check, but restore them before you finish, so that `git status` shows exactly what it showed when you started.

End with the numbered findings, or the single line: No findings.
