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

## Why the final review is starved of context on purpose (2026-08-10)

Users kept finding real issues by opening a fresh session and running a plain code
review on the PR *after* a full craft run. Three causes, all structural:

- The in-pipeline review is **anchored** — it receives the spec, the sketch, and the TDD
  summary, so it reads the diff as the implementer intended it. A fresh reviewer has no
  such frame and sees what the frame hid.
- The diffs never matched a PR. Step 5 reviews one slice; the re-review loop reviews the
  fix commits. Nothing looked at branch-vs-main, so cross-slice interactions — a helper
  added in S-001 and misused in S-004, a branch left unreachable by S-005 — were
  invisible to every pass.
- Review sat at step 5, before improve and verify. Anything those two stages committed
  was reviewed only if the bounded re-review happened to fire.

So the final pass gets the cumulative diff and **only the PR description**. Withholding
the artifacts is the mechanism; `composing-documents` already argued the same point for
documents ("information isolation, not a second opinion") and the pipeline simply had
not applied it to code. The cost is that intent-fit cannot run and an unannounced
contract change defaults to Critical — which is why the PR description is drafted first
and required to name deliberate contract changes. That ordering also matches reality:
the description is what a human reviewer reads before the diff.

## Why the data shape moved into the sketch, and why TDD may now re-route on it (2026-08-10)

Design churn showed up as users re-litigating domain types in conversation *after* a
run — in one case arguing an entity's fields should not be Optional and an extra wrapper
type should not exist. The pipeline made that predictable: the sketch is deliberately
thin ("compass, not blueprint", "shorter than the spec") and named no data shape, TDD's
refactor is explicitly local, and the first stage that examines data structures is
`code-reviewing` Layer 1 — after the tests encode the shape. A Layer-1 finding at that
point requires editing tests, which `code-improving` may not do, so it exits as
`## Feedback` and the human redesigns by hand. The expensive path was the only path.

Two changes close it. The sketch now states field-level optionality and invariants when
a type is introduced or changed, plus a two-sentence **Reversal Cost** that the design
gate leads with — the point being to spend the human's one ruling on the decision that
is expensive to undo, not on the whole sketch. And a wrong data shape discovered during
refactor now returns `needs-design` rather than an advisory Design divergence, because
at that moment only the current slice's tests depend on it.

That required loosening the `needs-design` loop guard: it now trips on the same *reason*
twice rather than on a second occurrence. A mid-loop data-shape re-route after an
up-front placement one is new information from the code, not a failed design pass.

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
