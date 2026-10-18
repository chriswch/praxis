# PR voice

How to write the text published with a PR: its description, its inline comments, and its PR comment.

## Reader

Write for a reviewer who knows the codebase but has no context on this change, and often none on its domain. The description is also the lasting record of why: later readers see what changed in the diff, never why.

## Language

- Write in the language the repo's existing PRs use: its PR template, its recent PRs, or its commit messages. If none shows one, use the language the user writes in.
- Keep framework, method, and tool names in English (`Diátaxis`, `ADR`, `INVEST`), and explain them in the PR's language.
- Keep code identifiers, file paths, commands, and error text exactly as they are.

## Register

- Lead with the answer; detail follows for the reader who wants it.
- Cut hedges, throat-clearing, and restated conclusions.
- Measure terseness against what the reviewer needs, not word count. A purpose sentence before a mechanism, or a gloss for a domain term the reviewer lacks, is content. What goes is mechanics the diff already shows.
- State conclusions plainly, including unwelcome ones. Where confidence is low, say so once.
- Prefer a number, a command, or a file reference over an adjective.

## Where a reason goes

Each reason lives in one place:

- the description: why the change exists, what behavior changes, and the risk;
- an inline comment: the reason for one line, the previous behavior, an external constraint, dated evidence;
- a code comment: only what `standards/comments.md` allows.

When a reason would appear twice in one PR, keep it where the most readers will see it, and point to it from the other place.

## Description

- The sections below are the default. Where the repo has a PR template, fill its sections in its order and add none of your own. Delete a section you do not use instead of writing "N/A".
- One sentence per line. Different points never share a paragraph.
- **Brief:** one or two lines, stated as the behavior change a user or customer sees.
- **Approach:** only the overall design, in one or two points on which part of the system changes. Delete it when the change has no design of its own.
  - What was done as a list, one change per item; the reasons in a short block below the list ("Why X:", then one sentence per line).
  - What was deliberately left out, with what would bring it in ("add X when Y happens").
  - No reading order, files, functions, field mappings, test lists, line counts, or test counts. Detail about one file goes in an inline comment on it.
- **Before/After**, only when the UI or performance changes: screenshots for the UI, or when they will be added; for performance, a table of measured numbers with how they were measured: the command or source, what it measured, and its limits.
- **Background:** one sentence of why, plus links that open.
- **Additional Note:** `###` subheadings, holding only what someone must do or watch: Series order, Before merge, Rollout order, Glossary, Known gaps (in zh-TW: 系列順序, 合併前, 上線順序, Glossary, 已知未涵蓋). Each item says whether it is done or still to do. Delete the section when nothing is left in it.
- Tick the checklist truthfully.

## Stacked series

Add this to each description after publishing, when the PR numbers exist.

- Series order is the first subheading of Additional Note.
- It holds one sentence of purpose, then a numbered list of bare `#n` (GitHub renders the titles; no per-PR summaries), with ` <- this PR` (in zh-TW: ` <- 本 PR`) on this PR's line, then a blank line and the rollout constraints.
- It is identical in every PR of the series.
- No task lists, because they count toward the checklist, and no closing keywords.

Reason: once a base PR merges and its branch is deleted, GitHub retargets the next PR, and the stack is no longer visible anywhere else.

## Inline comments

- A comment sits on the line it explains. Write one only where the diff alone leaves a reviewer asking; a change the diff makes obvious gets none.
- One point per comment, one or two sentences, one sentence per line.
- Say what the diff cannot: this spot's role in the design, why it is done this way, its effect, the previous behavior, an external constraint with its official link, dated evidence ("measured on staging on 2026-09-23: …"). Never restate the code's logic.

## PR comment

For a script someone must run by hand.

- The first sentence says why the script exists.
- Then `###` sections: What it does, When and how to run it, How to verify (in zh-TW: 做了什麼, 什麼時候怎麼跑, 驗證).
- Where the script treats categories differently, a bold label per category, followed by what happens to it.
- The script goes in a `<details>` block.

## Cut

- Sentences that restate the diff: an added index, file and line counts, test counts, "no new lint offenses".
- Sentences with no information: "a normal deploy runs the migration; no manual step".
- References the reviewer cannot follow: "no ticket" when there is none, local or git-ignored files, commit SHAs where a PR number exists.
- Ticket numbers, and labels that exist nowhere in the code, such as the number of a rule or a design document: quote the rule itself. The exceptions are a requirement link the template asks for, a title prefix the repo's convention requires, and `#n` links to related PRs.
- Commentary on how the PR itself is organized.
- Long mechanism analysis (SQL, EXPLAIN output, derivations, future plans): keep one sentence with the conclusion.

## Words

- Gloss each domain term at first use by its purpose, for a reviewer outside that domain.
- No in-house jargon or coined terms. Pick one plain phrase and keep it across the series.
- State runtime guarantees as facts, not as "the code assumes…".
- Name the concrete entity (the actual company, product, or service), not an abstraction such as "the platform", and call a thing what the system calls it.
- State a precondition as an invariant: what must hold and who keeps it true, then what breaks if it does not.
