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

## Why critical-path is the default and nothing else prunes tests (2026-08-10)

Live runs produced test suites the user judged bloated — one slice's spec carried eight
ACs (one of them "suite green, lint clean, app boots"), and one commit added 201 test
lines against 31 source lines. The cause was structural, not a model failure:

- `clarifying-intent` **mandated** coverage ("at minimum one happy path and one
  error/edge case, plus boundary cases…"), so AC count grew by rule rather than judgment.
- `driving-tdd` writes ≥1 test per AC.
- `code-reviewing` held tests out of scope; `code-improving` may not touch test files;
  `verifying-and-adapting` writes none and only detects *missing* coverage.

So test count was monotonically non-decreasing across the whole pipeline — no stage was
permitted to say a test wasn't worth its maintenance cost. Two fixes landed together:
the mandate became a consequence-based judgment rule (contracts → *Test posture*), and
`critical-path` became the **plugin default** rather than a per-repo opt-in. The default
is safe only because deferral is reversible at a known moment: every case the posture
skips is recorded (spec *Not Covered*, TDD feedback log) and the ship gate makes the user
choose. Without that register the lean default would be silent under-testing.

`verifying-and-adapting` had to learn to read *Not Covered* in the same change —
otherwise it re-reports a deliberate omission as a Gap and routes to Rework, and the two
halves of the design fight each other.

Deferred test candidates and out-of-scope findings share one file (`deferred.md`) rather
than two: their producers differ but their audience and moment are identical — the human
triaging at the ship gate.

Not done here, deliberately: letting review/improve *delete* an over-built test. That is
the destructive half and wants live evidence first. The rename carve-out shipped because
a rename preserves the assertion entirely.

## Why the codebase carries no process identifiers (2026-08-10)

The pipeline mints `S-001`, numbers ACs, and reasons in that vocabulary for a whole run,
so the model carried the identifiers into source and test names — where no reader can
resolve them. The plugin had no comment rule at all; the nearest thing governed commit
messages only. Meanwhile `default-philosophy.md` P10 ("Decisions leave a trace") named no
home for the trace, and a comment is the cheapest place to discharge it.

The fix is a routing table, not a prohibition (contracts → *Code annotation &
traceability*): convention → steering artifact, change-wide decision → PR description,
local why → comment, process bookkeeping → `.praxis/`. Stated positively, per the Opus 5
guide's note that positive examples outperform instructions about what not to do.

Enforcement rides on `code-reviewing`'s existing anti-pattern list rather than a sixth
layer, and it required narrowing that skill's "tests are out of scope" guardrail: a
process identifier in a *test name* is annotation hygiene, not test quality.

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
