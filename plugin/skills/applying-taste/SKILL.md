---
name: applying-taste
description: Praxis's default engineering taste, git workflow, and PR
  voice - design, naming, errors, dependencies, tests, schema and data
  changes, code comments, how changes are committed and published, and
  how a pull request's description, inline comments, and PR comment
  read. A repository's own conventions override it on the points they
  state. Use when designing, implementing, testing, or reviewing code,
  writing a migration or a data script, committing, branching, opening
  or updating a pull request, or writing its text, in any repository,
  inside or outside a Praxis run.
---

# Praxis taste

Praxis's default style for code, for how changes are committed and published, and for the text published with a pull request. It holds only rules that apply in any language and framework.

## Precedence

When sources disagree, a higher one overrides a lower one only on the point it states:

1. the repository's Praxis taste: `.praxis/taste.md` in its main checkout
2. the repository's committed conventions: its standards documents, AGENTS.md, CLAUDE.md, lint and CI config
3. the files below
4. current official or mainstream practice for the versions the repository uses: look it up and cite the URL
5. existing code, only where nothing above has an opinion

This applies to new code and to code you change anyway.

## Files

Read the files that cover what you are about to write, review, or do:

| File | Applies to |
|---|---|
| `standards/design.md` | all code and tests |
| `standards/data.md` | schema migrations, and scripts that change data |
| `standards/tests.md` | all tests |
| `standards/comments.md` | every comment you write or keep |
| `references/git.md` | commits, branches, and pull requests: committing, integrating other branches, publishing, and changing a published branch |
| `references/voice.md` | the text published with a pull request: its description, inline comments, and PR comment |
