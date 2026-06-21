# Decision Record — [short title]

> Adapt depth to stakes. A two-way-door call can fill this in a few lines; a one-way-door bet deserves every field. Keep it to one page where you can.

> **Recommendation (BLUF):** state the chosen option + confidence in one line here, in the reader's terms, before the detail below.

- **Date**: [YYYY-MM-DD]
- **Decider (single Approver)** · **Driver** (runs the process, if different) · **Veto / Agree** (if any — assign sparingly) · **Consulted** — for a reversible call these can collapse to one name (DACI / RAPID, `references/c-decision-process-and-governance.md`).
- **Type**: [two-way door (reversible) | one-way door (hard to reverse)] · stakes: [low / med / high]

## Problem (framed)

One or two lines. The *problem*, not the proposed solution. What does a good outcome look like?

> If the request arrived as a solution, state the underlying problem here and note the solution as one option below.

## Options considered

List ≥3 genuinely different options (including the one chosen). For each: the gist + its main trade-off / opportunity cost.

| Option | Upside | Main trade-off / what you give up |
| --- | --- | --- |
| A. … | … | … |
| B. … (chosen) | … | … |
| C. … | … | … |

## Evidence & key assumptions

- **Pre-registered rule** (write *before* gathering evidence): default action if no new data = [lesser-evil option]; the bar that would overturn it = [direction + magnitude + confidence]. Judge the evidence against this pre-set bar, not a threshold chosen after seeing the numbers.
- What evidence actually moved the decision (and what was the cheapest decisive piece — Value of Information).
- Load-bearing assumptions, each with rough confidence. Mark any that are unverified.
- Causal claims: note whether they're correlational or established (test/holdout), so a reader knows how much weight they carry.

## Decision

**We will [chosen option].** Confidence: ~[X]%.

This rests on: [assumption A1, A2, …]. The main trade-off accepted: [what we are knowingly giving up].

## Disconfirming evidence sought

- The strongest case *against* this decision: …
- Premortem — if this fails badly in a year, the most likely cause is: …
- Bias check: [sunk cost / anchoring / confirmation / groupthink / overconfidence — which were live, and how addressed].

## Tripwires & review

- **Reverse / revisit if**: [specific observable signal + threshold — e.g., "30-day retention for this cohort < X by [date]"].
- **Kill criteria (state + date)**: [the pre-committed benchmark that, if unmet by a date, means stop / roll back — e.g., "if <metric> < X by <date>, we quit"]. Name a *quit owner* with no stake in the sunk cost (`references/c-decision-process-and-governance.md` → Kill Criteria & Quit Review).
- **Review date**: [date — for one-way-door bets].
- **Metric(s) to watch**: [for ops decisions, the leading indicator + guardrail].
- **Calibration check (at review)**: compare the realized outcome to the confidence stated above — was the probability well-calibrated? Judge process quality separately from this single outcome.

## Methods used

[The 2–4 catalog methods actually applied — e.g., issue tree (D), premortem (C), Value of Information (A), RICE (G). Keeps the reasoning traceable.]
