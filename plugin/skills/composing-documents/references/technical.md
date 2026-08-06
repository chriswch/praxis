# Technical documents

Frameworks for software architecture, testing, design patterns, conventions, feature specs, and domain/background explainers — what each is, when to use it, its key trade-off.

## Contents
- Architecture & conventions
- Feature specs
- Domain / background explainers

## Architecture & conventions
Modern default stack: **C4 + arc42 + ADR + docs-as-code**. Complementary, not alternatives.

- **C4 Model (Simon Brown)** — four zoom levels: Context → Container → Component → Code. A consistent diagram language; the Context level is legible to non-engineers. Trade-off: diagrams only — pair with prose and ADRs.
- **arc42** — 12 fixed chapters for architecture docs. Tells you what sections to write; C4 tells you what to draw. Don't fill every chapter — write the minimum that prevents costly misunderstanding.
- **ADR (Michael Nygard)** — one small file per decision: Context / Decision / Consequences, with status (proposed/accepted/superseded), versioned with the code. Freezes "why we chose this" so it survives turnover and isn't re-litigated. Record only consequential decisions.
- **Test architecture** — Test Pyramid (Cohn): many unit, some integration, few E2E. Testing Trophy (Kent C. Dodds): integration-weighted, best confidence/cost. Honeycomb (Spotify): integration-heavy for microservices. Don't just paste a diagram — state which model you chose and why (that is itself an ADR), plus each layer's "tests what / not what."
- **Pattern Format (GoF / Alexander)** — Context / Problem / Solution / Consequences. The common mistake is writing only Solution; readers need Context and Consequences — "when *not* to use it" is often the most valuable part.
- **Conventions** — a living doc beside the code, enforced by linters, every rule carrying its rationale. Rules without a "why" get treated as dogma and bypassed; with a "why," people follow them and know when to break them.

## Feature specs
Separate the product question from the technical answer — they have different readers.

- **PRD** — product side: what/why, for whom. No implementation. Replace vague adjectives with measurable targets ("P95 < 200ms", not "fast"); always include **Non-goals** (the most-skipped section, and the one that most prevents scope creep); treat as a living doc.
- **RFC / Design Doc** — technical side: how. Skeleton: problem → goals/non-goals → proposed design → alternatives considered (and why rejected) → risks → impact. The **alternatives** section is the soul: it shows you thought, and lets reviewers critique the choice rather than the detail. Practiced at Amazon, Airbnb, Google, Stripe.
- **Specification by Example / BDD (Gojko Adzic)** — define behavior with concrete examples in **Given-When-Then**. Removes ambiguity and doubles as automated acceptance tests. Readable by engineers and non-engineers alike — a rare shared spec language.
- **User Story + INVEST** — "As a <role> I want <goal> so that <value>" + acceptance criteria. Good stories are Independent, Negotiable, Valuable, Estimable, Small, Testable.
- **Amazon Working Backwards / PRFAQ** — write the launch press release + FAQ first, then build. Forces customer-value reasoning over technical feasibility. Good for larger new features.

## Domain / background explainers
This genre is pure Diátaxis **Explanation** — here you *should* discuss why and context (e.g. recording Meta Ads domain knowledge for a team).

- **Ubiquitous Language (DDD)** — one term per concept, shared across engineering / PM / business. Pin terms once (campaign / ad set / ad), reuse everywhere.
- **Bounded Context (DDD)** — mark where a term's meaning changes between subdomains ("conversion" in ad delivery vs in billing).
- **Glossary** — the standard for domain docs; terminology is the main barrier for newcomers, and a table erases it.
- **Feynman Technique** — write it for a total outsider; where you get stuck is where your own understanding is thin. Directly serves non-engineer readers.
- A **C4 Context diagram** (boxes and arrows, no internals) often explains "how our system connects to X" to non-engineers faster than paragraphs.
