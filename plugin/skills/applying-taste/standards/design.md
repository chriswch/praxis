# Design

These rules hold in any language and framework.

## Structure

- Prefer the plain construct over the clever one: of two versions that do the same, choose the one the next reader follows without a comment.
- Start from the data: settle the shapes that cross the system's edge (API payloads, command arguments) and the data model first, and build the rest around them.
- A stored field is nullable only when "no value" is a real state, and null then has one meaning: never let null and an empty string both mean "none". A field every record has from the start is non-null with a default. Types state the true nullability; never coerce a nullable value into a non-null one to quiet a type checker.
- In a payload, a missing key and a null value are different things. In a partial update, a missing key leaves the field unchanged and null clears it; a create or a full replacement says what a missing key means. Keep the two apart in code (for example the set of fields the caller sent) instead of defaulting a missing input to null. When reading an external system, a missing key means what its documentation says, never "none" by assumption.
- An id that can point to more than one kind of thing is stored with a field that names the kind. A boolean is only for a true on/off; two named categories are an enum.
- Make an invalid state impossible to build instead of checking for it in each caller: use a constraint, a type, or a single constructor. When data arrives incomplete, check it once where it enters, turn it into a type that is complete, and let code after that point rely on it without checking again. Authorize the same way: once, at the start of each entry point (HTTP handler, job), with no second check stacked behind it; scoping each read and write to its tenant still applies.
- A layer, an interface, or a generalization needs a present trigger. Extract an abstraction on the third similar occurrence, not the first; until then keep the concrete code, and say in the PR description what would justify extracting it.
- A test double justifies an interface only when the dependency has no real stand-in in tests. A test database or an HTTP stub tool is one.
- Entry points (HTTP handlers, CLI commands, jobs, message consumers) stay thin: they read the input, call one business operation, and shape the output.
- Each business operation lives in one place. Its business rules never read transport details such as request objects, params, or headers.
- The business operation owns its transaction: it decides what must succeed or fail together. The request lifecycle, middleware, and dependency wiring never decide it.
- A business rule that both a backend and a frontend need is computed once, by the backend, and returned as one field named for exactly what it checks. A value only the display needs is derived by the frontend from the raw data. The backend never returns a list of conclusions prepared for a screen.
- A class or method that only a one-off script calls does not stay in the application: its logic goes in the script, even when scripts then repeat a little.

## Naming

- One name has one meaning across the codebase.
- Verbs that mean create, read, update, or delete name only those operations.
- A name states its unit or format (`_days`, `_twd`, `ratio` for 0 to 1) and covers everything the thing does, not only its most common use.
- A concept that belongs to an external system keeps that system's official name.

## Errors

- Handle only failures known to happen: one seen in an incident or in the logs, a known bug, or behavior the vendor's documentation states. A speculative failure gets no handling; the PR description notes it as "when X happens, add Y".
- Three rules always hold, because their failures are known:
  - data never crosses tenants: in a multi-tenant system, every read and write is scoped to its tenant;
  - credentials never reach a log;
  - no transaction stays open across a call to an external system.
- No silent fallback, and no defensive patch around data an upstream caller should have provided.
- Reading data from an external system maps unknown values to an explicit unknown. Writing stays strict.
- Required settings and credentials are checked when the process starts, by building the same object a request or job will use, so a misconfigured deploy fails at boot instead of in the middle of a user's action.

## Dependencies and tooling

- Use the framework's own mechanism before adding a library or a layer. Keep dependencies few and mainstream.
- A setting that is not secret lives in the code, even when it differs between environments, as long as the environments are a small fixed set: the code holds one value per environment and picks it by one environment name read at startup, which must be set and known or the process does not start. Only secrets, and values that must change without a deploy, come from the environment.
- Work with the framework, not around it: never patch its internals, or widen a type to its catch-all (such as `Any`), to make code or tests pass.
- What a standard tool can check, such as lint rules and types, is left to the tool and CI. What it cannot, such as architecture, naming, and file layout, is followed from the docs: add no custom checker or meta-test for it.
- Lint and type-check exemptions are listed file by file and only shrink: no glob or blanket exemption that makes a run look clean, and no new exemption for new code.
- Add no git hooks: lint and format run through documented commands and CI. Leave a repository's existing hooks as they are.

## Decisions

- A decision that binds later code beyond this change goes in an ADR only when the repository already keeps ADRs, in their folder and format; the code holds at most a one-line pointer to it. Otherwise the decision and its reason go in the PR description.
