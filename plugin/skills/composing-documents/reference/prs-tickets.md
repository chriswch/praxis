# PR/MR descriptions and issue tickets

For pull/merge request descriptions and issue/Jira tickets. The defining constraint of both genres: the reader is expert on the codebase axis but often novice on the change's domain axis, and their attention is the scarcest resource in the pipeline.

## PR / MR descriptions

**Reviewer model.** Write as though the reviewer has zero context on the PR's scope — not zero technical skill (Shopify's rule, aimed at new integrations, patterns, and architecture). The description is also a permanent record: future readers doing archaeology can see *what* from the diff but never *why* (Google eng-practices — Chesterton's fence).

**Skeleton** (sections optional — omit empty ones rather than fill boilerplate):
1. **TL;DR** — what + why, one line.
2. **Domain purpose** — 1–3 plain sentences: what this enables and for whom, glossing the 1–2 pivotal domain terms at first use ("these six events form a conversion funnel — the ordered steps a user takes toward publishing — so PM can see where merchants drop off"). This is the advance organizer everything below hangs on; without it, configuration rationale reads as arbitrary.
3. **Approach & key decisions** — why this way; alternatives only where the choice is contestable.
4. **Definitions** — events, interfaces, flags, mappings, as tables.
5. **Verification** — what you ran or clicked, and what the reviewer can check.
6. **`<details>` optional depth** — background some reviewers will want; never content required for approval (collapsed content gets skipped).

**Rules:**
- **Motivation before mechanism.** The reader may not yet know the problem exists (TC39/PEP/KEP convention).
- **Why over what.** The diff shows what changed; the description records why. Trim narration that restates the diff — annotate the diff at the line instead (GitHub's 2026 guidance on agent-authored PRs: "Agents love verbosity. They describe what's better explored through the code itself.").
- **Background as pointers.** Link tickets, design docs, dashboards; inline only the one-sentence version of each.
- **State the feedback type wanted** — quick look vs deep critique vs one risky file (the strongest single predictor of reviewer engagement in the 2026 80K-PR study). For multi-file PRs, give a reading order.
- **Structure over length.** Headers, bullets, tables — structured descriptions correlate with faster review and higher merge rates; raw length does not. Rough band: 50–100 words for a bug fix, 150–250 for a single feature, 300–400 for multi-component; past that, move depth into `<details>` or a linked doc.
- **Length is conserved** (core skill rule): the domain-purpose sentences are paid for by the restated-diff narration you cut.

## Issue / Jira tickets

The ticket is the durable context container: the implementer usually was not in the room where the need was discussed, and chat/meeting context evaporates. At creation time, paste in — don't just link — the decision, the why-and-for-whom (the Story), constraints, and points of contact. Acceptance criteria are observable behaviors, not restated requirements (hand the phrasing to `clear-writing`'s spec guidance). Stale pasted context misleads: update the ticket when the underlying decision changes.

## AI-era note (2026)

Review queues are flooded with AI-authored PRs and reviewer capacity has not scaled; the description is the cheapest trust signal a reviewer gets before deciding how deeply to engage. An unedited agent-generated description reads as "author never looked at this." Self-review the diff and the description, trim, run the fresh-context reader (core move 7), then request review.
