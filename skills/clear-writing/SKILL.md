---
name: clear-writing
description: "Write and revise all prose with clarity, precision, and concision. Use this skill whenever producing written content longer than a few sentences: documentation, specifications, design sketches, explanations, briefs, READMEs, PR descriptions, commit messages, technical writing, or any content a reader will consume. Also trigger when the user asks to improve, tighten, edit, rewrite, or revise existing prose — even if they don't say 'clear writing' explicitly."
---

# Clear Writing

Good writing respects the reader's time. Every needless word, vague abstraction, and indirect construction betrays the reader who came in good faith.

> A sentence should contain no unnecessary words, a paragraph no unnecessary sentences, for the same reason that a drawing should have no unnecessary lines and a machine no unnecessary parts. This requires not that the writer make all his sentences short, or that he avoid all detail and treat his subjects only in outline, but that every word tell.
> — William Strunk Jr., *The Elements of Style* (1918)

These principles apply to everything you write: documentation, specifications, design sketches, explanations, briefs, READMEs.

## Principles

### 1. Make every word earn its place

Concision is not brevity. A long sentence where every word tells is concise. A short sentence with one wasted word is not.

| Wordy | Direct |
|-------|--------|
| the question as to whether | whether |
| there is no doubt but that | doubtless |
| owing to the fact that | since, because |
| in spite of the fact that | although |
| call your attention to the fact that | remind you |
| the fact that he had not succeeded | his failure |
| in a hasty manner | hastily |
| he is a man who | he |
| this is a subject that | this subject |
| at this point in time | now |
| in order to | to |
| has the ability to | can |
| a sufficient number of | enough |
| for the purposes of | for, to |

"The fact that" should be revised out of every sentence in which it occurs.

### 2. Use the active voice

The active voice is direct and vigorous. The passive voice wraps action in bureaucratic insulation.

| Passive | Active |
|---------|--------|
| The configuration is loaded by the server | The server loads the configuration |
| It can be seen that the test fails | The test fails |
| The function is called when a request arrives | The function runs on each request |
| There were a great number of dead leaves lying on the ground | Dead leaves covered the ground |
| The reason he left college was that his health became impaired | Failing health compelled him to leave college |

The passive voice is correct when the acted-upon is the true subject: "The server was decommissioned in March" — because you're discussing the server's history. But stacked passives ("The data is expected to be processed by the service") always need rewriting.

### 3. State things positively

The reader wants to know what IS, not what ISN'T. Negative statement evades; positive statement commits.

| Negative | Positive |
|----------|----------|
| He was not very often on time | He usually came late |
| did not remember | forgot |
| did not pay attention to | ignored |
| not important | trifling |
| not honest | dishonest |
| does not support | lacks |
| is not able to | cannot |

Exception: antithesis gives negation force. "Not charity, but simple justice."

### 4. Use specific, concrete language

Abstract language forces the reader to translate. Concrete language deposits images directly into the mind.

| Abstract | Concrete |
|----------|----------|
| A period of unfavorable weather set in | It rained every day for a week |
| He showed satisfaction as he took possession of his well-earned reward | He grinned as he pocketed the coin |
| The application will utilize the data store | The app reads from PostgreSQL |
| There was an issue with the authentication functionality | Login failed: the token had expired |

Do not call something "interesting" — make it interesting. Do not call something "important" — show why it matters.

### 5. Put the strong word at the end

The end of a sentence carries the most emphasis. The beginning is secondary. The middle buries things.

| Weak ending | Strong ending |
|-------------|---------------|
| This steel is principally used for making razors, because of its hardness | Because of its hardness, this steel is principally used for making razors |
| The configuration is stored in `config.yaml`, which is loaded at startup | At startup, the server loads `config.yaml` |

This applies at every scale: sentences, paragraphs, sections. End on what matters most.

### 6. Keep related words together

In English, proximity is grammar. Subject near verb. Modifier near what it modifies.

| Separated | Together |
|-----------|----------|
| He only found two mistakes | He found only two mistakes |
| The function, after checking all edge cases and logging the result, returns true | After checking edge cases and logging the result, the function returns true |

### 7. Express parallel ideas in parallel form

When ideas are equivalent in meaning, make them equivalent in structure. Broken parallelism signals a writer unable to choose a form and hold to it.

| Broken | Parallel |
|--------|----------|
| The system validates input, transforms it, and then there is a step where it stores the result | The system validates input, transforms it, and stores the result |
| You can configure the app via CLI flags, or by setting environment variables, or a config file works too | Configure the app via CLI flags, environment variables, or a config file |

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

State it once, well. Do not say the same thing multiple ways.

Before (51 words):
> Macbeth was very ambitious. This led him to wish to become king of Scotland. The witches told him that this wish of his would come true. The king of Scotland at this time was Duncan. Encouraged by his wife, Macbeth murdered Duncan. He was thus enabled to succeed Duncan as king.

After (26 words):
> Encouraged by his wife, Macbeth achieved his ambition and realized the prediction of the witches by murdering Duncan and becoming king of Scotland in his place.

### Fancy words

Prefer the plain word. The reader processes it faster and trusts it more.

| Fancy | Plain |
|-------|-------|
| utilize | use |
| leverage | use |
| facilitate | help, enable |
| functionality | feature, or describe what it does |
| demonstrate | show |
| terminate | end, stop |
| initiate | start, begin |
| subsequent | next, later |

### Filler constructions

| Filler | Direct |
|--------|--------|
| It is important to note that X | X |
| It should be mentioned that X | X |
| As previously mentioned | *(cut — if the reader needs it, they remember)* |
| In the context of | in, for, during |
| With respect to | about, for |
| In terms of | *(recast the sentence)* |

## Structure

Each paragraph handles one topic. Begin with a sentence that states the topic. End on the strongest point.

A single-sentence paragraph is acceptable for emphasis. A paragraph longer than 6–8 sentences likely contains two topics. Split it.

## Process

1. **Draft for completeness.** Get all the content down. Do not self-edit mid-draft.
2. **Revise for clarity.** Apply the principles above. Cut the machine habits. Tighten wordy phrases. Read each sentence and ask: does every word earn its place?
3. **Check structure.** Does every paragraph earn its place? Does every sentence advance the paragraph? Does every word advance the sentence?

The first draft is raw material. The revision is the craft.

## Content-Type Guidance

**Documentation:** Lead with what the reader needs to do. Cut "This document describes..." — just describe. Concrete examples over abstract explanations.

**Specifications:** Acceptance criteria should be observable behaviors, not restatements of the requirement. Each criterion testable by observation. Cut criteria that verify the same behavior from different angles.

**Design documents:** State the decision and its rationale. Cut preamble about methodology. A sketch shows the structure, not describes it.

**Explanations:** Start with the conclusion, then support it. Do not build suspense — the reader wants understanding, not surprise. Concrete examples before abstractions.

**Commit messages and PR descriptions:** First line: what changed and why, imperative mood. Body: what the reviewer needs to know. Cut implementation narration — the diff shows what you did.
