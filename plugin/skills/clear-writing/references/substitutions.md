# Substitution tables

Full lookup tables for the principles in `SKILL.md`. Open this when revising a draft
against a specific principle, or when a construction resists tightening and you want the
worked pair. The principles themselves live in `SKILL.md` — this file is the reference,
not the rule.

## 1. Make every word earn its place

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

## 2. Use the active voice

| Passive | Active |
|---------|--------|
| The configuration is loaded by the server | The server loads the configuration |
| It can be seen that the test fails | The test fails |
| The function is called when a request arrives | The function runs on each request |
| There were a great number of dead leaves lying on the ground | Dead leaves covered the ground |
| The reason he left college was that his health became impaired | Failing health compelled him to leave college |

The passive voice is correct when the acted-upon is the true subject: "The server was
decommissioned in March" — because you're discussing the server's history. But stacked
passives ("The data is expected to be processed by the service") always need rewriting.

## 3. State things positively

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

## 4. Use specific, concrete language

| Abstract | Concrete |
|----------|----------|
| A period of unfavorable weather set in | It rained every day for a week |
| He showed satisfaction as he took possession of his well-earned reward | He grinned as he pocketed the coin |
| The application will utilize the data store | The app reads from PostgreSQL |
| There was an issue with the authentication functionality | Login failed: the token had expired |

## 5. Put the strong word at the end

| Weak ending | Strong ending |
|-------------|---------------|
| This steel is principally used for making razors, because of its hardness | Because of its hardness, this steel is principally used for making razors |
| The configuration is stored in `config.yaml`, which is loaded at startup | At startup, the server loads `config.yaml` |

## 6. Keep related words together

| Separated | Together |
|-----------|----------|
| He only found two mistakes | He found only two mistakes |
| The function, after checking all edge cases and logging the result, returns true | After checking edge cases and logging the result, the function returns true |

## 7. Express parallel ideas in parallel form

| Broken | Parallel |
|--------|----------|
| The system validates input, transforms it, and then there is a step where it stores the result | The system validates input, transforms it, and stores the result |
| You can configure the app via CLI flags, or by setting environment variables, or a config file works too | Configure the app via CLI flags, environment variables, or a config file |

## Fancy words

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

## Filler constructions

| Filler | Direct |
|--------|--------|
| It is important to note that X | X |
| It should be mentioned that X | X |
| As previously mentioned | *(cut — if the reader needs it, they remember)* |
| In the context of | in, for, during |
| With respect to | about, for |
| In terms of | *(recast the sentence)* |

## Padding and repetition — worked example

Before (51 words):

> Macbeth was very ambitious. This led him to wish to become king of Scotland. The witches told him that this wish of his would come true. The king of Scotland at this time was Duncan. Encouraged by his wife, Macbeth murdered Duncan. He was thus enabled to succeed Duncan as king.

After (26 words):

> Encouraged by his wife, Macbeth achieved his ambition and realized the prediction of the witches by murdering Duncan and becoming king of Scotland in his place.
