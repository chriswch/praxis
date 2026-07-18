# Default Design Philosophy

The plugin's default **taste profile** — input 2 of the implementation-decision flow (`contracts.md` → *Implementation-decision flow*). Stages read this file only when the user has no `~/.praxis/taste.md`; a user file **replaces** this one entirely (no merging). It is written in two layers: cross-language principles first (they transfer to any stack), then one worked instantiation showing what the principles look like in a concrete stack.

A taste profile settles the forks that research and project conventions leave open — it is a standing philosophy, not a per-story judgment. It never silences the decision flow's divergence duty: a taste-driven choice that departs from a project convention or from researched practice is still flagged and explained.

## Layer 1 — Principles (any language)

1. **Legibility and change-safety over cleverness.** Optimize for the next reader and the next change, not for elegance points. If a construct needs explaining, prefer the version that doesn't.
2. **Abstraction must be earned.** No abstraction without an explicit, present trigger — never speculative. Three similar lines of concrete code beat a premature generalization; extract on the third occurrence, not the first. Record the graduation trigger ("introduce X when Y happens") instead of building X now.
3. **Strict layering, dependencies pointing inward.** Thin entry points (routes, handlers, CLIs) delegate to application logic; domain logic stays independent of frameworks and infrastructure; infrastructure implements interfaces the inner layers define. A change in one layer should not cascade outward.
4. **Business operations own their consistency boundaries.** Transaction/commit scope belongs to the application operation (use case), not to framework plumbing or the DI layer — the operation knows what must succeed or fail together.
5. **Precise, reserved naming vocabularies.** A small set of verbs with fixed meanings (e.g. CRUD verbs reserved for CRUD); role-based names for external-system adapters, with each role name meaning exactly one thing across the codebase. One name, one meaning — naming drift is design drift.
6. **Honest tooling ratchets.** Strictness debt (type-checking, lint exemptions) is enumerated explicitly, visible, and shrinking — never hidden behind a glob or a blanket exemption that produces a false-clean. The tooling config is itself a design document.
7. **Errors loud at boundaries, never silently swallowed.** Domain-meaningful error types per resource; handle where an error crosses a boundary, let it propagate inside; no defensive patching around data an upstream caller should have provided correctly. Narrow, deliberate exception: read-side tolerance for external data (degrade unknown values gracefully), write-side strictness.
8. **Sociable tests, behavioral names.** Tests exercise real collaborators and mock only true external boundaries (network, third-party APIs); test names describe behavior, not implementation. A test that breaks when the implementation is swapped but behavior kept is a wrong test.
9. **Boring dependencies.** Mainstream, few, well-maintained; prefer the framework's native mechanism over an added machinery layer (e.g. built-in DI over a container). Every dependency is a maintenance commitment.
10. **Decisions leave a trace.** Consequential choices are recorded with the alternatives that were rejected and why, plus the trigger that would revisit them. Rules earn their place by real incidents, not hypotheticals.

## Layer 2 — Instantiation example (Python / FastAPI)

How the principles read in one concrete stack — an illustration, not a requirement; re-derive the equivalents for the stack at hand.

- Layering (P3): Presentation (routers) → Application (use cases) → Domain → Infrastructure, dependencies inward only; routers are thin dispatchers into use-case modules; domain repositories are ABCs implemented by infrastructure adapters.
- Consistency boundaries (P4): the use case wraps its work in an `atomic(session)` context manager — commit-as-you-go owned by the operation, not by the dependency wiring.
- Naming (P5): `get_`/`create_`/`update_`/`delete_` reserved for CRUD (`get_<plural>`, not `list_`); external systems named by role — `Client`/`Gateway`/`Port` — with `Repository` reserved strictly for the database; private wire types prefixed (`_MetaCampaign`, `_UpdateCampaignResponse`), mappers `_to_<entity>`.
- Ratchet (P6): the type-checker config enumerates each still-unchecked legacy module by name, with a comment forbidding glob-negation shortcuts that would fake a clean run.
- Errors (P7): per-resource hierarchies (`APIError → CampaignError → CreateCampaignError`); routers catch specific tuples per endpoint; a last-resort middleware catches the rest; vendor enums degrade to `UNKNOWN` on read via `_missing_`, stay strict on write.
- Tests (P8): use-case tests run real repositories/services and mock the wire only (e.g. `respx`); gateway tests are characterization tests asserting exact wire shape and unknown-enum tolerance.
- Dependencies (P9): FastAPI's own `Depends` as the DI mechanism; dataclasses for domain purity, Pydantic confined to the boundary.
