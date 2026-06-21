# Method Catalog — Index & Routing

This directory holds a catalog of ~230 decision-science methods, grouped into 12 categories plus the Minerva thinking-method set. Each category file lists methods with the same structure: **What it is / Use in the process / Questions to ask / four-axis application (engineering · product · ops · strategy) / 2026 note / sources**. Content is in English; method names carry the acronym in parentheses where one exists.

The catalog is **reference material, not a checklist**. For any one decision you pull 2–4 methods that fit — never all of them. Use the routing table below to open only the files a given step needs.

**Domain note**: the four-axis examples and the `fit` score in every reference file are SaaS/software-flavored — `fit` is a *SaaS-relevance* heuristic, not a measure of a method's general quality. For a decision outside software/SaaS, the process and the domain-neutral categories (Minerva, A, B, C, D, E) transfer directly; translate the four-axis examples into the decision's own domain.

## Routing — situation → file

| If the decision/step is about… | Open |
| --- | --- |
| The problem feels fuzzy; not sure you're solving the right thing | `d-problem-framing.md` (+ `minerva-hcs.md` → #rightproblem, #breakitdown) |
| Who decides, how, and recording it (one-way vs two-way door, RAPID/RACI, decision records, premortems) | `c-decision-process-and-governance.md` |
| Risk of bias, ego, or a contested/political call | `e-biases-and-debiasing.md` |
| General-purpose reasoning lenses (mental models) | `b-mental-models.md` |
| Foundations of decision science / process discipline | `a-discipline-and-process.md` |
| A technical, architecture, or build-vs-buy decision | `f-software-engineering-decisions.md` |
| What to build / roadmap / prioritization | `g-product-prioritization.md` |
| Proving causality or designing a test/experiment | `h-experimentation-and-causal.md` |
| Diagnosing a metric movement / ops analytics | `i-ops-analytics-and-metrics.md` |
| Strategy, competition, market, long-horizon bets | `j-strategy-frameworks.md` |
| A competitive, negotiation, or game-theoretic / pricing-war call | `j-strategy-frameworks.md` (game theory, signaling, credible threats, zero/positive-sum) + `minerva-hcs.md` → #batna |
| AI-augmented decisioning, 2026 practices | `k-ai-augmented-2026.md` |
| A broad toolkit of thinking skills (the Minerva "thinking methods"; "76" is a loose, non-canonical figure) | `minerva-hcs.md` |

## Category summary

| File | Category | Methods | Representative methods |
| --- | --- | --- | --- |
| `minerva-hcs.md` | Minerva HCs (41 ported; no fixed canonical count — "76" is an unverified, widely-circulated figure) | 41 | #rightproblem, #breakitdown, #utility, #estimation, #confirmationbias, #tradeoffs, #broadframing |
| `a-discipline-and-process.md` | A. Decision science discipline & process | 13 | Decision Intelligence, normative/descriptive/prescriptive, Value of Information, decision quality vs outcome, Decision Quality six-link chain (Spetzler) |
| `b-mental-models.md` | B. Mental-model latticework | 26 | First principles, second-order thinking, inversion, margin of safety, opportunity cost, leverage points (Meadows), stocks & flows, feedback loops, Kelly criterion, Chesterton's fence, normalization of deviance / drift into failure |
| `c-decision-process-and-governance.md` | C. Decision process & governance | 18 | Type-1/Type-2 doors, RAPID/RACI, premortem, decision records (ADR), WRAP, OODA, AHP, Kepner-Tregoe, kill criteria & quit review, Toyota Kata |
| `d-problem-framing.md` | D. Asking the right question / framing | 14 | First principles, MECE/issue trees, hypothesis-driven, reframing, 5 Whys, abstraction laddering |
| `e-biases-and-debiasing.md` | E. Cognitive biases & debiasing | 19 | Confirmation bias, anchoring, sunk cost, framing effect, status quo bias, red team, reference-class forecasting |
| `f-software-engineering-decisions.md` | F. Software-engineering decisions | 18 | ADRs, reversible/irreversible, build-vs-buy, Wardley-driven tech choice, RFC, YAGNI, Monte Carlo / #NoEstimates forecasting, error budget & SLO gate, CBA/TCO/EVPI, ISO/IEC 25010:2023 |
| `g-product-prioritization.md` | G. Product development & prioritization | 18 | RICE, ICE, Kano, opportunity scoring, MoSCoW, cost of delay / WSJF, JTBD |
| `h-experimentation-and-causal.md` | H. Experimentation & causal inference | 16 | A/B testing, guardrail metrics, DiD, holdouts, CUPED, sample-size/MDE, causal diagrams |
| `i-ops-analytics-and-metrics.md` | I. Product ops analytics & metrics | 18 | North Star + inputs, funnel/cohort, segmentation, Goodhart's law, regression to the mean, theory of constraints, leading vs lagging, root-cause |
| `j-strategy-frameworks.md` | J. Product / business strategy | 20 | Wardley Mapping, Playing to Win, Rumelt kernel, 7 Powers, OKR, scenario planning, real options, game theory, zero/positive-sum, signaling, credible threats, first-mover vs fast-follower, SWOT→TOWS |
| `k-ai-augmented-2026.md` | K. AI-augmented decisioning (2026) | 9 | LLM as hypothesis generator/red-teamer, human-in-the-loop gates, sycophancy guards, decision agents |

## Cross-cutting threads

A few methods recur across categories because they anchor the whole process — expect to use them on most non-trivial decisions:

- **Frame before solve** — #rightproblem (Minerva), reframing (D), Rumelt diagnosis (J).
- **Reversibility sets the rigor** — Type-1/Type-2 doors (C, F).
- **Decide under uncertainty** — probabilistic thinking & base rates (B), Value of Information (A), real options (J), outside view / reference-class forecasting (E).
- **Defend against yourself** — premortem/inversion (B, C), disconfirming evidence & bias checks (E).
- **Close the loop** — decision records + tripwires + pre-committed kill criteria (C, F), guardrail metrics + Goodhart guard (H, I), confidence calibration at the review (A, E).

> **Pocket check** — the daily-use compression of the workflow; run it in order on any decision or review: **right problem?** → **odds & base rate?** → **reversible?** → **real cost** (opportunity + who's affected)? → **how would it fail?** → **fooled by a metric / old code / a correlation?**
