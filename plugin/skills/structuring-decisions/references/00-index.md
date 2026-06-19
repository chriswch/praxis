# Method Catalog — Index & Routing

This directory holds a catalog of ~206 decision-science methods, grouped into 12 categories plus the Minerva thinking-method set. Each category file lists methods with the same structure: **是什麼 (what it is) / 用在決策流程 (use in the decision process) / 問對問題 (questions to ask) / four-axis application (engineering · product · ops · strategy) / 2026 note / sources**. Content is in Traditional Chinese; method names carry the English term in parentheses.

The catalog is **reference material, not a checklist**. For any one decision you pull 2–4 methods that fit — never all of them. Use the routing table below to open only the files a given step needs.

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
| AI-augmented decisioning, 2026 practices | `k-ai-augmented-2026.md` |
| A broad toolkit of thinking skills ("76 thinking methods") | `minerva-hcs.md` |

## Category summary

| File | Category | Methods | Representative methods |
| --- | --- | --- | --- |
| `minerva-hcs.md` | Minerva HCs (76 thinking methods) | 41 | #rightproblem, #breakitdown, #utility, #estimation, #confirmationbias, #tradeoffs, #broadframing |
| `a-discipline-and-process.md` | A. Decision science discipline & process | 12 | Decision Intelligence, normative/descriptive/prescriptive, Value of Information, decision quality vs outcome |
| `b-mental-models.md` | B. Mental-model latticework | 20 | First principles, second-order thinking, inversion, margin of safety, opportunity cost, base rates |
| `c-decision-process-and-governance.md` | C. Decision process & governance | 14 | Type-1/Type-2 doors, RAPID/RACI, premortem, decision records (ADR), WRAP, OODA |
| `d-problem-framing.md` | D. Asking the right question / framing | 14 | First principles, MECE/issue trees, hypothesis-driven, reframing, 5 Whys, abstraction laddering |
| `e-biases-and-debiasing.md` | E. Cognitive biases & debiasing | 17 | Confirmation bias, anchoring, sunk cost, groupthink, red team, reference-class forecasting |
| `f-software-engineering-decisions.md` | F. Software-engineering decisions | 14 | ADRs, reversible/irreversible, build-vs-buy, Wardley-driven tech choice, RFC, YAGNI |
| `g-product-prioritization.md` | G. Product development & prioritization | 18 | RICE, ICE, Kano, opportunity scoring, MoSCoW, cost of delay / WSJF, JTBD |
| `h-experimentation-and-causal.md` | H. Experimentation & causal inference | 16 | A/B testing, guardrail metrics, DiD, holdouts, CUPED, sample-size/MDE, causal diagrams |
| `i-ops-analytics-and-metrics.md` | I. Product ops analytics & metrics | 15 | North Star + inputs, funnel/cohort, segmentation, Goodhart, leading vs lagging, root-cause |
| `j-strategy-frameworks.md` | J. Product / business strategy | 14 | Wardley Mapping, Playing to Win, Rumelt kernel, 7 Powers, OKR, JTBD, scenario planning, real options |
| `k-ai-augmented-2026.md` | K. AI-augmented decisioning (2026) | 9 | LLM as hypothesis generator/red-teamer, human-in-the-loop gates, sycophancy guards, decision agents |

## Cross-cutting threads

A few methods recur across categories because they anchor the whole process — expect to use them on most non-trivial decisions:

- **Frame before solve** — #rightproblem (Minerva), reframing (D), Rumelt diagnosis (J).
- **Reversibility sets the rigor** — Type-1/Type-2 doors (C, F).
- **Decide under uncertainty** — probabilistic thinking & base rates (B), Value of Information (A), real options (J).
- **Defend against yourself** — premortem/inversion (B, C), disconfirming evidence & bias checks (E).
- **Close the loop** — decision records + tripwires (C, F), guardrail metrics (H, I).
