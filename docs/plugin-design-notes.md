# Plugin design notes

Rationale behind decisions in `plugin/skills/`. This file is maintainer documentation —
it lives outside `plugin/` deliberately, so it never ships with the plugin and never
costs runtime tokens. Skills state *what to do*; this file records *why it was built
that way*.

## Why `driving-tdd` ships no red-gate hook (2026-08-01)

The TDD loop's anti-gaming defence — a model must not weaken its own acceptance test to
reach Green — is enforced by three prompt-level mitigations: the contract guardrail, the
recorded Red evidence (command + verbatim failure), and the Green-phase test freeze.

A `PreToolUse` hook could enforce the test freeze mechanically. Praxis ships none by
design: plugin hooks act **session-wide**, so a hook installed to protect the TDD loop
would also fire on every unrelated edit in the user's session. The cost of that blast
radius outweighs the marginal enforcement gain over recorded evidence.

**Escape hatch if this ever proves insufficient.** If live autopilot runs show real
test-gaming, fork the Red phase per-AC into a context that sees only the spec and the
sketch — implemented *inside* `driving-tdd`, not as a separate test-authoring skill
(a separate skill would break the one-commit-per-AC contract and the feedback log).

## Why artifact anti-bloat is a hard rule (2026-08-01)

`craft/references/contracts.md` → *Artifact anti-bloat* forbids each artifact from
restating the one that feeds it. This guards against the documented failure mode where
spec-driven-development pipelines bury the reader in redundant Markdown — see
Böckeler, *Exploring Gen AI: SDD tools*.

## Rightsizing pass for Claude 5 models (2026-08-01)

The skills were audited against three Anthropic sources — the Opus 5 prompting guide,
"The new rules of context engineering for Claude 5 generation models", and the general
prompting best-practices page — and edited on seven fronts:

1. `code-reviewing` conservatism instructions removed. The Opus 5 guide names review
   prompts specifically: "be conservative" / "only report high-severity issues" get
   followed literally and suppress real findings. The pipeline already filters downstream
   (severity grades + `code-improving` acting only on critical/high/medium), so the
   review now reports everything and grades honestly.
2. Four intra-skill "self-check before presenting" blocks deleted. Opus 5 self-verifies
   without prompting; explicit re-check instructions compound into over-verification.
   Requirements that were unique to those blocks moved into the step that produces the
   artifact, where they read as construction criteria rather than a second pass.
   **Not** removed: `verifying-and-adapting` as a stage, and craft's ship gate — those
   execute acceptance criteria and gate a human, which is a different act.
3. Rules repeated 4–7× within a single file collapsed to one authoritative statement
   plus pointers. Cross-file one-line summaries were kept: stage skills must hold up
   standalone.
4. Maintainer rationale moved here.
5. Descriptions slimmed (trigger-phrase lists were an anti-undertriggering pattern that
   now causes overtriggering); prohibition density and ALL-CAPS reduced.
6. Verbosity and deliverable-length calibration added, since a published plugin cannot
   rely on the user having it in their own `CLAUDE.md`.
7. `clear-writing` substitution tables moved behind progressive disclosure.
