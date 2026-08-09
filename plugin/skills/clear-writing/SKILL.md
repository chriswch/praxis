---
name: clear-writing
description: "Sentence-level revision for clarity, precision, and concision. Use when drafting or revising a durable written artifact — documentation, a specification, a design sketch, a README, a PR description, a commit message — or when asked to tighten, edit, rewrite, or improve existing prose. For document-level shaping (which genre, which structure, which altitude for the audience), use composing-documents first and hand the draft here for polish."
---

# Clear Writing

Good writing respects the reader's time. Every needless word, vague abstraction, and indirect construction betrays the reader who came in good faith.

> A sentence should contain no unnecessary words, a paragraph no unnecessary sentences, for the same reason that a drawing should have no unnecessary lines and a machine no unnecessary parts. This requires not that the writer make all his sentences short, or that he avoid all detail and treat his subjects only in outline, but that every word tell.
> — William Strunk Jr., *The Elements of Style* (1918)

These principles apply to everything you write: documentation, specifications, design sketches, explanations, briefs, READMEs.

## Principles

Each principle below carries a pair or two as calibration. The full substitution tables —
every wordy/direct, passive/active, abstract/concrete pair — live in
`references/substitutions.md`; open it when revising a draft against one principle, or
when a construction resists tightening.

### 1. Make every word earn its place

Concision is not brevity. A long sentence where every word tells is concise. A short sentence with one wasted word is not.

*owing to the fact that* → **since** · *at this point in time* → **now** · *has the ability to* → **can**

"The fact that" should be revised out of every sentence in which it occurs.

### 2. Use the active voice

The active voice is direct and vigorous. The passive voice wraps action in bureaucratic insulation.

*The configuration is loaded by the server* → **The server loads the configuration**
*There were a great number of dead leaves lying on the ground* → **Dead leaves covered the ground**

The passive is correct when the acted-upon is the true subject: "The server was decommissioned in March" — you're discussing the server's history. Stacked passives ("The data is expected to be processed by the service") always need rewriting.

### 3. State things positively

The reader wants to know what is, not what isn't. Negative statement evades; positive statement commits.

*did not remember* → **forgot** · *does not support* → **lacks** · *is not able to* → **cannot**

Exception: antithesis gives negation force. "Not charity, but simple justice."

### 4. Use specific, concrete language

Abstract language forces the reader to translate. Concrete language deposits images directly into the mind.

*A period of unfavorable weather set in* → **It rained every day for a week**
*There was an issue with the authentication functionality* → **Login failed: the token had expired**

Do not call something "interesting" — make it interesting. Do not call something "important" — show why it matters.

### 5. Put the strong word at the end

The end of a sentence carries the most emphasis. The beginning is secondary. The middle buries things.

*The configuration is stored in `config.yaml`, which is loaded at startup* → **At startup, the server loads `config.yaml`**

This applies at every scale: sentences, paragraphs, sections. End on what matters most.

### 6. Keep related words together

In English, proximity is grammar. Subject near verb. Modifier near what it modifies.

*He only found two mistakes* → **He found only two mistakes**

### 7. Express parallel ideas in parallel form

When ideas are equivalent in meaning, make them equivalent in structure. Broken parallelism signals a writer unable to choose a form and hold to it.

*The system validates input, transforms it, and then there is a step where it stores the result* → **The system validates input, transforms it, and stores the result**

## Cut the Machine Habits

These patterns fingerprint machine-generated prose. Readers sense them even when they can't name them. Cut them.

### Throat-clearing

Start with the substance. Never with preamble.

Cut: "Let me explain...", "It's worth noting that...", "In order to understand X, we first need to...", "This is an important concept because...", "Here's what you need to know...", "Before we dive in..."

### Hedge words

Remove unless the hedge is genuinely necessary — you are uncertain about a fact, or the claim is truly approximate.

Cut: *essentially, basically, generally, typically, arguably, seemingly, relatively, fairly, quite, rather, somewhat, in some ways, kind of, sort of, it could be said that*

### Qualifiers

Where emphasis is necessary, use words strong in themselves.

Cut: *very, really, truly, extremely, incredibly, highly, absolutely, literally (when not literal), actually, just*

### Padding and repetition

State it once, well. Do not say the same thing multiple ways. (Worked 51-word → 26-word example: `references/substitutions.md`.)

### Fancy words

Prefer the plain word. The reader processes it faster and trusts it more.

*utilize, leverage* → **use** · *facilitate* → **help, enable** · *terminate* → **end, stop** · *subsequent* → **next, later**

### Filler constructions

*It is important to note that X* → **X** · *In the context of* → **in, for, during** · *With respect to* → **about, for** · *As previously mentioned* → *(cut — if the reader needs it, they remember)*

## Structure

Each paragraph handles one topic. Begin with a sentence that states the topic. End on the strongest point.

A single-sentence paragraph is acceptable for emphasis. A paragraph longer than 6–8 sentences likely contains two topics. Split it.

## Process

1. **Draft for completeness.** Get all the content down. Do not self-edit mid-draft.
2. **Revise for clarity.** Apply the principles above. Cut the machine habits. Tighten wordy phrases. Read each sentence and ask: does every word earn its place? If a knowledge-gap audit table accompanies the draft (from `composing-documents`), the sentences it marks — purpose statements, first-use glosses — are load-bearing for a reader who lacks the domain: tighten them, never cut them as filler.
3. **Check structure.** Does every paragraph earn its place? Does every sentence advance the paragraph? Does every word advance the sentence?

The first draft is raw material. The revision is the craft.

## Content-Type Guidance

**Documentation:** Lead with what the reader needs to do. Cut "This document describes..." — just describe. Concrete examples over abstract explanations.

**Specifications:** Acceptance criteria should be observable behaviors, not restatements of the requirement. Each criterion testable by observation. Cut criteria that verify the same behavior from different angles.

**Design documents:** State the decision and its rationale. Cut preamble about methodology. A sketch shows the structure, not describes it.

**Explanations:** Start with the conclusion, then support it. Do not build suspense — the reader wants understanding, not surprise. Concrete examples before abstractions.

**Commit messages and PR descriptions:** First line: what changed and why, imperative mood. Body: what the reviewer needs to know. Cut implementation narration — the diff shows what you did.

## Voice

Read `~/.praxis/voice.md` if it exists — the caller's standing prose conventions (language, register, terminology). Absent it, match the reader's language and the register of the surrounding documents.

Where the repo states its own documentation conventions (`.praxis/constitution.md`, `CLAUDE.md`/`AGENTS.md`), those outrank the personal voice: a document serves the project's readers, not its author.

End your output with one line naming the voice you applied, where it came from, and any point where the repo's conventions overrode it — so the reader can see what governed the result, and switch it by editing `~/.praxis/voice.md`.

## References

- `references/substitutions.md` — the full substitution tables for all seven principles, plus fancy words, filler constructions, and the worked padding example.
