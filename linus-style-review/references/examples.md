# Linus-Style Review: Examples

## Prompts that should trigger this skill

- "Review this PR in a Linus-style way: focus on simplicity and backwards compatibility."
- "Tear apart this design: what is the simplest data structure that works?"
- "Is this change worth doing or is it solving an imagined problem?"

## Example (design/requirements)

【Understanding Confirmation】
Add a new optional config field `X` that changes behavior `Y` without changing defaults or breaking existing configs.

【Core Judgment】
⚠️ More information required: define what existing behavior must remain identical (inputs, outputs, error cases).

【Key Insights】
- Data Structures: you are encoding state in config conditionals instead of making the data model explicit.
- Special Cases: `if X then Y else legacy` is a design patch unless the model is wrong.
- Complexity: you can likely represent this as a single enum/strategy rather than flags.
- Risk Points: config compatibility + silent behavior changes.
- Practicality: if nobody needs this in production, stop adding knobs.

【Linus-Style Solution】
1. Make the state explicit (one field, one meaning).
2. Keep defaults identical.
3. Reject invalid combinations early.
4. Add tests that lock old behavior.

## Example (code review)

【Taste Rating】
🔴 Garbage

【Critical Issues】
- Three nested branches to compensate for a missing invariant; the data structure is wrong.
- Fallback logic hides upstream bugs instead of surfacing them.

【Improvement Direction】
- Replace `flagA/flagB/flagC` with a single explicit state value.
- Delete the fallback and raise an error at the boundary; fix the caller and tests.
