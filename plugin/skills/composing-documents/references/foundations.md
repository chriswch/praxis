# Foundations (cross-cutting)

Frameworks every genre draws on. Read for the "why" behind a core move or a framework's trade-off. Names kept in English by design.

## Contents
- Diátaxis — the four documentation modes
- Pyramid Principle / BLUF — conclusion-first structure
- Progressive disclosure
- Minimalism
- Style layer
- Audience adaptation (depth) — the two-axis reader model
- AI-era practices (2026)

## Diátaxis — four modes
Four mutually exclusive needs map to four forms: *tutorial* (learn by doing), *how-to* (solve a task), *reference* (look up facts), *explanation* (understand why). Decide what a section **is** before writing it; never blend modes in one section. The dominant docs framework (Canonical, Ubuntu, Cloudflare). Most of this user's work is *reference* (specs, conventions) and *explanation* (architecture rationale, domain background). Diátaxis also names the classic failure of jumping into reference/config detail with no explanation anywhere: reference content presupposes context that only explanation supplies.

## Pyramid Principle / BLUF (Minto)
Conclusion first, then 2–4 supporting points, then evidence. Best for busy and non-engineer readers — they get the answer in the first lines. Military variant: BLUF (Bottom Line Up Front). Trade-off: it feels backwards to engineers trained to derive then conclude. Do it anyway. Note Minto's own opening is SCQA — Situation, Complication, Question, Answer: one short paragraph of shared background *precedes* the answer. "Conclusion-first" means minimal-shared-context-first, never zero-context; if the Situation grows past a paragraph it becomes upside-down BLUF.

## Progressive disclosure
Minimum necessary up front; detail behind layers (appendix, links, collapsible sections). Serves the 80% who want the gist and the 20% who dig — and lets one document serve mixed audiences at once. Cap at 2–3 tiers; deeper nesting loses readers, and the split fails if the first layer doesn't contain what most readers actually need.

## Minimalism (John Carroll)
Write only what prevents expensive misunderstanding. A methodology, not just a style preference: every extra sentence competes for attention with the ones that matter. The corollary cuts both ways: weak-axis grounding (a purpose statement, a first-use gloss) *prevents* expensive misunderstanding and therefore belongs in the minimum; restated mechanics the code already shows do not.

## Style layer
Plain language — short sentences, active voice, concrete nouns, few terms. For house conventions, adopt or trim the Google or Microsoft Writing Style Guide rather than inventing one. Sentence-level execution belongs to `clear-writing`.

## Audience adaptation (depth) — the two-axis reader model
- **Two axes, not one ladder** — rate every reader separately on (a) craft/stack expertise and (b) domain proximity, per knowledge domain the doc touches. Google's technical writing course: role alone "is insufficient for defining an audience" — add the reader's *proximity to the knowledge*. Program-comprehension research splits a *technical dimension* from a *domain dimension* and calls any single expert/novice scale "compromised"; the DITA standard encodes audience as two independent attributes (`@job`, `@experiencelevel`). The single-axis model is what makes curse-of-knowledge failures invisible: label the reader "engineer", go down to code, and miss that the gap was the domain.
- **Curse of knowledge / expert blind spot** — once you understand, you can't imagine not understanding. Worse: expertise *distorts what you perceive as a prerequisite* (Nathan & Petrosino's expert-blind-spot studies), so self-listed assumptions silently leak. This is why the core-move-6 audit clusters terms first and judges familiarity second, and why the check is mechanical rather than "be careful."
- **Expertise reversal effect (cognitive load theory)** — scaffolding that helps a novice burdens an already-knowledgeable reader with redundant processing; that is why calibration is per-axis, never a uniform "explain more" or "explain less." The effect is asymmetric (2025 meta-analysis, 60 studies): adding support for novices helps more than trimming redundancy for experts hurts — when unsure, gloss.
- **Abstraction ladder** — the same thing described at many altitudes. Applied per axis: descend to code and data where the reader is expert; rise to purpose and impact where they are a novice. "Code for RDs, plain words for non-RDs" is the degenerate single-axis case, valid only when both axes happen to align.
- **De-jargon** — gloss each term on first use, or swap in the domain word.
- **Analogy first, definition second** — bridge from something the reader already knows, then add precision (given-new contract: new information must attach to an antecedent the reader can already find).
- **Made to Stick (Heath) — SUCCESs** — Simple, Unexpected, Concrete, Credible, Emotional, Stories. A checklist for making background/explainer content memorable.

## AI-era practices (2026)
- **Docs-as-Code** is the baseline: Markdown/MDX in Git, PR-reviewed, CI-checked.
- **AI-assisted authoring/governance** — use AI to flag style violations, inconsistent terminology, low readability, accessibility gaps. A consistency gatekeeper, not a ghostwriter.
- **LLMs are cursed too** — models measurably exhibit the curse of knowledge, and the bias grows with the richness of the context they hold; a drafting session holding the full diff and sources is maximally cursed. Same-context self-critique is unreliable (models fix errors in others' output that they miss in their own; asked to "read as a novice" they leak what's in their window). Fresh-context review — a separate reader given only the finished artifact and the persona — outperforms both same-session re-reading and a second agent that still holds the sources: the context *separation* is the active ingredient. Hence core move 7, and hence two separate passes: the correctness verifier needs the sources; the audience-fit reader must not have them.
- **Documentation decay** accelerates as AI speeds shipping — keep docs in the same repo/PR as the code; auto-generate from code/API/config where possible.
- **llms.txt** — a community convention (no standards-body backing as of 2026 Q1); strongest real use is dev tooling (Cursor, Copilot, Claude) fetching the right pages. Worth it for internal docs read by AI assistants; not yet a public-search lever.
