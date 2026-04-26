# Features

What currently ships and is verified to work. Add an entry here only after the behavior is implemented and exercised end-to-end.

> **Status: nothing implemented yet.** The CLI is at the spec stage. The product.md document is the design source of truth. Track planned work in [backlog.md](backlog.md).

## Format

When entries are added, use this shape:

```
### <feature-or-stage-id>

**Shipped:** <YYYY-MM-DD>
**Spec reference:** product.md §<section>

<one-paragraph behavior summary>

- Inputs: …
- Outputs: …
- Notable bounds / edge cases: …
- Verified by: <test path or manual repro>
```

Keep entries grounded in observed behavior, not intent. If a feature is partially implemented, file the missing pieces in `backlog.md` and describe only the shipped slice here.
