# Comments

- Write no comment by default. Write one only when the approach itself needs explaining or the logic is too complex to read. The bar is stricter than it sounds: even a comment that explains why the approach was chosen usually goes. When in doubt, leave it out.
- Tests are the behavior spec. Specs, factories, and fixtures carry no explanatory comments; the example names are the spec.
- A stub or fixture file holds at most one line of necessary warning, such as "all IDs and tokens here are fake".
- A comment may state business intent or scope that the code cannot express and that stays true. For example: "Only the partner API is an external entry point today, but every external entry point will come through here, so CDN caching is always off."
- Never write:
  - a summary that restates a class or method name;
  - step-by-step narration ("1) … 2) … 3) …");
  - usage guidance for callers ("for batches, use X instead");
  - history, regressions, or ticket numbers ("before ABC-1234 this returned nil"): they go in the commit message or the test name;
  - why another approach was not used, or why the code follows a convention: it goes in an inline comment on that line in the PR;
  - a reason the code already shows ("the flow is long, so the TTL is longer");
  - a fact that goes stale when the code changes ("failures are only logged, so later…");
  - a class-level comment that lists the API endpoint each step calls;
  - decision records, dates, or experiment notes ("decided on 2026-09-03", "verified to build");
  - a claim about an external API's behavior without an official source: look it up in the official documentation, and delete the claim if you find none.
- When a comment is needed: use plain words, the exact name of the entity ("Stripe", not "the payment provider"), and no coined in-house terms.
- A database column comment states what the column means, and for a nullable column what null means; never how to use it.
