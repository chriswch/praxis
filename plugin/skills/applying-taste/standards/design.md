# Design

These rules hold in any language and framework.

## Structure

- Prefer the plain construct over the clever one: of two versions that do the same, choose the one the next reader follows without a comment.
- Start from the data: settle the shapes that cross the system's edge (API payloads, command arguments) and the data model first, and build the rest around them.
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

## Errors

- Handle only failures known to happen: one seen in an incident or in the logs, a known bug, or behavior the vendor's documentation states. A speculative failure gets no handling; the PR description notes it as "when X happens, add Y".
- Three rules always hold, because their failures are known:
  - data never crosses tenants: in a multi-tenant system, every read and write is scoped to its tenant;
  - credentials never reach a log;
  - no transaction stays open across a call to an external system.
- No silent fallback, and no defensive patch around data an upstream caller should have provided.
- Reading data from an external system maps unknown values to an explicit unknown. Writing stays strict.

## Dependencies and tooling

- Use the framework's own mechanism before adding a library or a layer. Keep dependencies few and mainstream.
- Work with the framework, not around it: never patch its internals, or widen a type to its catch-all (such as `Any`), to make code or tests pass.
- What a standard tool can check, such as lint rules and types, is left to the tool and CI. What it cannot, such as architecture, naming, and file layout, is followed from the docs: add no custom checker or meta-test for it.
- Lint and type-check exemptions are listed file by file and only shrink: no glob or blanket exemption that makes a run look clean, and no new exemption for new code.
- Add no git hooks: lint and format run through documented commands and CI. Leave a repository's existing hooks as they are.

## Decisions

- A decision that binds later code beyond this change goes in an ADR only when the repository already keeps ADRs, in their folder and format; the code holds at most a one-line pointer to it. Otherwise the decision and its reason go in the PR description.
