---
name: composing-documents
description: "Document-level shaping — pick the genre framework, the structure, and the altitude for the audience, before and while drafting. Covers software architecture and spec docs, domain/background explainers, PR/MR descriptions, issue/Jira tickets, engineering blog posts, and tech-talk slides, and applies its core moves to any other genre. Use when planning, outlining, or restructuring a substantial document, or when asked what a doc should contain or how to explain something to a reader who lacks the domain. For sentence-level tightening of existing prose, hand off to clear-writing."
---

# Composing Documents

Choose the right shape for a document before filling it in. The genre and the audience decide the framework; the framework decides the structure. Most documents fail not because the sentences are bad, but because the wrong content sits in the wrong shape for the wrong reader — and the most common miss is a reader who is expert on one axis (the stack) and novice on another (the domain).

This skill handles document-level decisions: which genre, which framework, which structure, which altitude for the audience. For sentence- and paragraph-level clarity and concision, hand off to `clear-writing`. The two compose — shape here, polish there.

## How to use this skill

1. Name the genre and the audience — the audience on two axes (core move 1).
2. Apply the **core moves** below — they hold for every document.
3. Open the matching reference file for genre-specific frameworks and structure:
   - `reference/foundations.md` — cross-cutting frameworks every genre draws on (Diátaxis, Pyramid Principle, progressive disclosure, minimalism, two-axis audience adaptation, AI-era practices). Read this for the "why" behind a core move or a framework's trade-off.
   - `reference/technical.md` — software architecture, testing, design patterns, conventions, feature specs (PRD/RFC), and domain/background explainers.
   - `reference/prs-tickets.md` — PR/MR descriptions and issue/Jira tickets.
   - `reference/blog.md` — engineering blog posts and long-form technical articles.
   - `reference/slides.md` — tech-talk and sharing-session slides.
   - **No dedicated file yet** (e.g. marketing copy, business/operational comms)? Apply the core moves plus `reference/foundations.md`; together they carry most of the way for any genre. Add a new `reference/<genre>.md` when one recurs often enough to deserve its own page.

## Core moves (every document)

1. **Name the genre and the audience first — the audience on two axes.** For each named reader, rate separately: (a) craft/stack expertise, and (b) domain proximity, for **each knowledge domain the document touches** (analytics, billing, ads delivery, compliance, …). Answer two questions before drafting: "What technical knowledge does this document require?" and "What domain knowledge — independent of any code, platform, or tool — does it require?" The second answer is never "n/a". A reader can be expert on one axis and novice on the other; for PR reviewers this mixed profile is the common case, not the exception. "Engineer" is a role, not a persona.
2. **Place each section in Diátaxis.** Every section serves exactly one of four needs — *tutorial* (learn by doing), *how-to* (accomplish a task), *reference* (look up facts), *explanation* (understand why). Mixing modes in one section is the most common failure; when a section drifts from "why" into "steps," split it. (Details: `reference/foundations.md`.)
3. **Lead with the conclusion** (Pyramid Principle / BLUF). Writers trained on "background → derivation → conclusion" bury the point; readers want "conclusion → reasons if they read on." Put the main message at the top of the document and the strongest unit at the end of each section. Conclusion-first still permits — requires — one short Situation beat (SCQA): the minimum shared context that makes the conclusion land, kept to a paragraph.
4. **Write the minimum that prevents expensive misunderstanding** (minimalism + progressive disclosure). Give essentials first; push detail behind layers — appendix, links, collapsible blocks. Every needless sentence dilutes the useful ones. The minimum *includes* weak-axis grounding (move 5) — a doc that saves three sentences of purpose and costs the reviewer an hour of confusion did not save anything.
5. **Match the reader per axis, not per label.** The abstraction ladder applies per axis: go down to code and data on the axis where the persona is expert; supply grounding on the axis where they are a novice. "Engineers → go down to code" is wrong when the gap is domain knowledge. Don't fight the curse of knowledge with vigilance — vigilance is exactly what expertise defeats; fight it with the audit (move 6) and the fresh reader (move 7).
6. **Run the knowledge-gap audit** — after outlining or drafting, before finalizing.
   1. List every domain concept and term the document invokes.
   2. Cluster the terms into the knowledge domains they belong to, and name each domain. Classify only — do not judge familiarity yet; judging while listing is how the author's blind spot deletes entries.
   3. Mark each cluster inside or outside the persona's two-axis profile.
   4. For each outside concept, choose a placement: a 1–3-sentence purpose statement before the mechanism it grounds · a one-line gloss at first use · a collapsible details block · a link to a concept doc · omit it. (Decision guide: "Audience adaptation" below.)
   Keep the audit as a small table and pass it to `clear-writing` with the draft, so the polish pass knows which sentences are load-bearing. Never skip the audit because "the readers are engineers" — that assumption is the failure this step exists to catch.
7. **Verify with a fresh-context reader** — for load-bearing docs (PR descriptions, specs, anything external). Give a fresh agent only the finished draft and the two-axis persona — never the diff, the sources, or the writing conversation — and ask it to (a) summarize in its own words what the document does and why, (b) list every term it cannot define, (c) list every decision whose motivation it cannot reconstruct. Fix what it stumbles on. The delegation earns its cost through *information isolation*, not a second opinion: the author's context reproduces the author's blind spot, so this is one of the few passes a fresh agent can run and you cannot. For the same reason, never merge it with a correctness review — correctness needs the sources; audience-fit requires not having them. Where no agent dispatch is available, ship without this pass and say so.
8. **Defer polish.** Once the structure holds, hand off to `clear-writing` for word-level tightening — along with the audit table from move 6. Tuning sentences before the shape is right wastes the work.

## Pick the framework by genre

| Genre | Use | Reference |
|---|---|---|
| Software architecture | **C4** (diagrams) + **arc42** (sections) | technical.md |
| Architecture decisions | **ADR** — Context / Decision / Consequences | technical.md |
| Test architecture | Test Pyramid / Testing Trophy + an ADR | technical.md |
| Design patterns | **Pattern Format** — Context / Problem / Solution / Consequences | technical.md |
| Conventions | living doc + a "why" per rule | technical.md |
| Feature spec (product) | **PRD** with explicit Non-goals | technical.md |
| Feature spec (technical) | **RFC / Design Doc** — the alternatives section is the soul | technical.md |
| Behavior spec | **Specification by Example** (Given-When-Then) | technical.md |
| Domain / background | **Explanation** mode + ubiquitous language + glossary + Feynman test | technical.md |
| PR / MR description | context-first skeleton + reviewer-empathy rules | prs-tickets.md |
| Issue / Jira ticket | ticket as the durable context container | prs-tickets.md |
| Engineering blog | **Inverted Pyramid** — conclusion first; show, don't tell | blog.md |
| Tech-talk slides | **Assertion-Evidence** + Duarte story arc | slides.md |
| Any other genre | core moves + foundations | foundations.md |

## Audience adaptation (the primary axis)

- Set one concrete persona and write for it; "everyone" is no one — and "engineer" is not a persona. Rate the persona on both axes per core move 1.
- **Single reader with a known gap** (the common case: reviewer expert in the stack, novice in the domain): calibrate ONE document — don't layer. Place per concept, escalating with the depth of the gap:
  1. **Purpose statement** — 1–3 plain sentences on what the thing is *for*, before any mechanism or configuration. Highest leverage; use for the 1–2 pivotal domain concepts everything else hangs on.
  2. **First-use gloss** — one clause or sentence defining a term where it first appears. For isolated vocabulary gaps only; when several concepts depend on each other, the reader lacks a schema, not words — escalate to 1 or 4.
  3. **Collapsible details block** — a few paragraphs of this-doc-specific optional depth. Never content required for the reader's decision.
  4. **Linked concept doc** — sustained background reused across documents. Always leave a one-sentence bridge inline; a bare link stalls the reader.
- **Length is conserved**: add on the weak axis, cut on the strong axis — the mechanics the code or diff already shows, the restated narration. Net growth means you're cutting too little, not explaining too much.
- **Genuinely mixed audiences** (several reader groups at once — engineers and PMs): serve by **layering, not dumbing down** — accessible main text, technical detail in an appendix or collapsible block (progressive disclosure). Layering solves many-readers; it does not solve one-reader-with-a-gap. (Depth: `reference/foundations.md`.)
- De-jargon: gloss each term on first use, or replace it with the domain word.

## Pitfalls

- Reading "engineer" as "no background needed" — stack expertise does not confer domain knowledge; audit per axis (move 6).
- A background section written without the audit — the cursed author fills it with background that still assumes the domain.
- Running the audience-fit check inside the writing context — the author's context reproduces the author's blind spot; only a fresh reader (move 7) escapes it.
- Mixing Diátaxis modes in one section.
- Burying the conclusion under background — or its inverse, a conclusion with zero Situation beat that lands on nothing.
- A spec without Non-goals (invites scope creep); an RFC without alternatives (looks unconsidered).
- A pattern or convention doc that lists only the solution, never the "when not to."
- Slides used as a teleprompter (bullet walls) instead of assertion + visual evidence.
- For mixed audiences: flattening everything to the lowest level instead of layering it.

## Producing the actual file

This skill shapes content. To generate the artifact itself, compose with the file-producing skills: slides → `pptx`, Word → `docx`, PDF → `pdf`, spreadsheets → `xlsx`. Shape the structure here first, then hand it to those.

## Notes on this user's defaults

Writes in Traditional Chinese (Taiwan) and values terse prose — cut filler. **Filler does not include weak-axis scaffolding**: purpose statements and first-use glosses from the move-6 audit are load-bearing content; what gets cut instead is restated mechanics the diff already shows. Keep framework/methodology names in their English originals with Traditional-Chinese explanation. Adapts register per axis (move 5); the two-axis audience split above is the primary axis of this skill.
