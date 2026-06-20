---
name: structuring-decisions
description: Drives any consequential decision or operational-analysis question through a structured decision-science process — frame the right problem, diagnose, widen options, gather the evidence that actually changes the answer, debias, decide with explicit confidence, and record it with review tripwires — pulling specific methods from a 200+ method catalog (Minerva thinking methods, mental models, problem framing, debiasing, experimentation, ops analytics, strategy) only as each step needs them. Use this whenever someone needs to decide something that is hard to reverse or high-stakes, is weighing options, asks "should we do X / which option / how do we decide", wants a product-ops or metrics analysis turned into a recommendation, needs to prioritize, run a root-cause analysis, or asks you to "think this through properly". Prefer this over answering a weighty decision off the cuff — but skip it for trivial, easily reversible choices.
---

# Structure a Decision

## Overview

Take a consequential decision or an analysis question and drive it to a documented, defensible conclusion using a structured decision-science process. The body of this skill is the **process**; the 200+ specific thinking methods live in `references/` and are pulled in only when a step needs them (progressive disclosure — the catalog is large and loading it wholesale would drown the actual reasoning).

Two principles shape everything here:

- **Match rigor to stakes.** Over-structuring a cheap, reversible decision is itself a bad decision — it burns time and signals false precision. The first job is to decide *how much to decide*. A two-way-door call gets a fast heuristic; a one-way-door, high-stakes, or contested call gets the full structure.
- **Judge the decision, not just the outcome.** A good process can still draw a bad card (and a reckless call can get lucky). Aim for a decision that was *right given what was knowable*, with its uncertainty made explicit — not a guarantee of the result. This is why the output records confidence, assumptions, and what would change the answer.

This works for product-ops analysis, engineering/architecture calls, prioritization, strategy, and everyday judgment alike. The process is domain-neutral; the `references/` carry the domain flavor. **Outside software/SaaS**, run the same process but draw first from the domain-neutral categories — the Minerva thinking methods and `a-discipline-and-process`, `b-mental-models`, `c-decision-process-and-governance`, `d-problem-framing`, `e-biases-and-debiasing` (these transfer to any domain; only their examples are SaaS-flavored) — and translate the four-axis examples into the decision's own domain. The `fit` score in each reference file is a *SaaS-relevance* heuristic, not a measure of a method's general quality.

## Input

The decision or question to work through, plus any context (data, prior analysis, constraints, who the decision-makers are, the deadline). Pass it inline, or as a path/handle this skill should read. If the request is an analysis ("why did X drop?") rather than a choice, that is fine — see the **Analysis-only** fast path.

## Output

One of:

- **Quick call**: for trivial/reversible decisions — a one-line recommendation plus the single reason, and stop. No ceremony.
- **Decision Record**: for decisions that earned the full process — use `templates/decision-record.md`. Captures the framed problem, options, evidence and assumptions, the decision with explicit confidence, the trade-off accepted, disconfirming evidence sought, and the tripwires that would reverse it.
- **Analysis conclusion**: for analysis-only requests — the diagnosed answer (issue tree, evidence, correlation-vs-causation verdict) and the decision it should inform.
- **Open questions**: when a blocking unknown can't be resolved without the user — list them, ask, and stop.

The caller decides whether to persist the artifact and where.

## Workflow

### 0. Triage — decide how much to decide

Before structuring anything, classify the decision. This gates how much of the rest of the workflow you run.

- **Reversibility**: is this a *two-way door* (cheap to undo) or a *one-way door* (hard/expensive to reverse)? (`references/c-decision-process-and-governance.md`)
- **Stakes & blast radius**: who/what is affected if it's wrong?
- **Uncertainty**: do we roughly know the odds, or is this genuine (unmeasurable) uncertainty?
- **Time pressure**: is there a real deadline, or is the urgency manufactured?

Route on the result:

- **Trivial / reversible / low-stakes** → take the **Quick call** fast path. Apply one sensible heuristic, state the single reason, move on. Do not open the catalog.
- **Analysis request, no decision yet** → take the **Analysis-only** fast path (steps 1 → 2 → 4 → conclude).
- **One-way door, high-stakes, contested, or genuinely uncertain** → run the full workflow below.

If unsure, lean toward the lighter path first; you can always escalate once framing reveals the stakes.

### 1. Frame the right problem

The most expensive decision error is solving the wrong problem precisely. Before generating any option:

a. **Separate symptom from problem.** Restate the request as a one-line problem statement and a one-line "what a good outcome looks like". If a solution is baked into the request ("we should add caching"), restate the underlying problem separately ("page p99 is too slow") and confirm.

b. **Challenge the frame.** Ask whether this is the right question at all. A reframe often dissolves the decision. Pull reframing moves from `references/d-problem-framing.md` (and `minerva-hcs.md` → #rightproblem).

c. **For analysis requests**, state the metric movement and the decision the analysis is meant to inform — analysis with no decision attached tends to sprawl.

Confirm the frame with the user before proceeding (manual mode) — a wrong frame invalidates everything downstream.

### 2. Diagnose

Understand what is actually going on before choosing what to do — Rumelt's point that a weak diagnosis is the root of most bad strategy.

a. **Decompose** the problem with an issue tree / MECE breakdown so the parts are non-overlapping and collectively exhaustive (`references/d-problem-framing.md`).

b. **Form hypotheses** about the cause or the best answer, each stated so it could be *disproven*. Be hypothesis-driven: identify which branch, if resolved, would most move the decision.

c. **Identify the decision's domain** — this tells you which catalog categories you'll draw on next. Consult the routing table in `references/00-index.md`.

### 3. Generate options

A decision framed as "do X or not" is usually under-developed. Widen it:

- Produce **at least three genuinely different options**, including a "third path" beyond the obvious binary (`minerva-hcs.md` → #broadframing; `references/d-problem-framing.md`).
- Name the **opportunity cost** of each — what you give up, not just what you spend.
- For product/strategy choices, pull the fitting frameworks (`references/g-product-prioritization.md`, `references/j-strategy-frameworks.md`).

(Skip this step on the Analysis-only path.)

### 4. Gather evidence & reduce uncertainty

Spend evidence-gathering effort where it changes the answer, not where it's easy.

a. **Decide how to decide — before you look.** Commit a *default action* (which option wins if no new data arrives) and the *explicit bar* that would overturn it — direction, magnitude, confidence. Then gather evidence and judge against that pre-set bar. Setting the threshold *after* seeing the numbers licenses post-hoc rationalization; pre-registering it is the single strongest debias (`references/a-discipline-and-process.md` → Decide How to Decide; pre-registration in `references/h-experimentation-and-causal.md`).

b. **Value of Information**: ask "what is the cheapest evidence that would most change which option I pick?" Get that first. If no evidence would change the decision, stop gathering and decide.

c. **Be hypothesis-driven**: go after the data that could *disprove* your leading hypothesis, not the data that confirms it.

d. **For causal claims**, distinguish correlation from causation — don't act on "X correlates with Y" as if X causes Y (`references/h-experimentation-and-causal.md`, `references/i-ops-analytics-and-metrics.md`). When a claim is load-bearing and testable, design an experiment or a holdout rather than guessing.

e. **For high-uncertainty bets**, prefer staging the bet (real options — a cheap probe that buys the right to decide later) over an all-in commitment (`references/j-strategy-frameworks.md`).

### 5. Debias, weigh, and decide

a. **Make the trade-off explicit.** Every real decision sacrifices something; name what this one gives up. A decision with no visible trade-off usually means the analysis isn't done.

b. **Run a debiasing pass** before committing — this is where good processes save you from yourself:
   - **Premortem / inversion**: assume it failed badly in a year; what caused it? (`references/b-mental-models.md`, `references/c-decision-process-and-governance.md`)
   - **Seek disconfirming evidence**: actively look for what would prove you wrong; appoint a red team or devil's advocate on contested calls (`references/e-biases-and-debiasing.md`).
   - **Check the usual suspects**: sunk cost, anchoring, confirmation bias, groupthink, overconfidence.

c. **State the decision as a claim with explicit confidence** ("we choose B; ~70% confident; this rests on assumptions A1–A3"). Confidence and assumptions are first-class, not hedging.

### 6. Record & set tripwires

A decision isn't finished when it's made — it's finished when it's reviewable.

- Produce the **Decision Record** (`templates/decision-record.md`).
- Define the **tripwire**: the specific observable signal that would mean the decision was wrong and should be revisited (e.g., "if 30-day retention for this cohort is still below X by date D"). For ops decisions, name the metric and threshold to watch.
- Set a **review date** for one-way-door bets.

This closes the loop: it turns a one-shot call into something you can learn from, and it's what lets a future reader (or you) tell a decision that aged badly from one that was simply unlucky.

## Method routing

`references/00-index.md` holds the full situation → file routing table and a per-category method summary. The short version:

| Step / situation | Primary reference |
| --- | --- |
| Framing, "is this the right question" | `d-problem-framing.md`, `minerva-hcs.md` |
| Decision process / governance / reversibility | `c-decision-process-and-governance.md` |
| Bias risk, contested calls | `e-biases-and-debiasing.md` |
| General reasoning lenses | `b-mental-models.md` |
| Decision-science foundations | `a-discipline-and-process.md` |
| Technical / architecture / build-vs-buy | `f-software-engineering-decisions.md` |
| What to build / prioritization | `g-product-prioritization.md` |
| Causality / experiment design | `h-experimentation-and-causal.md` |
| Metric movement / ops analytics | `i-ops-analytics-and-metrics.md` |
| Strategy / competition / long-horizon | `j-strategy-frameworks.md` |
| AI-augmented decisioning (2026) | `k-ai-augmented-2026.md` |

Pull 2–4 methods that fit the decision in front of you. The catalog is a toolbox, not a syllabus.

## Mode Gates

Mirrors the rest of the Praxis family:

- **Manual mode (default)**: checkpoint with the user at two gates — after **step 1 (frame)** and after **step 5 (decision)**. Present the artifact and the choices; use `AskUserQuestion` when available. The frame gate matters most: confirming the wrong problem early is cheap, discovering it after a full analysis is not.
- **Autopilot mode** (`--autopilot` prefix): run straight through, auto-confirming gates with the obvious forward choice. Only stop on a blocking **Open question** (step 0–1) or when evidence (step 4) contradicts the framed problem and forces a re-frame.

## Fast Paths

Not every decision earns the full pipeline. Match the input to the shortest honest path:

- **Quick call** (trivial, reversible, low-stakes): one heuristic, one-line rationale, done. Forcing structure here is the anti-pattern.
- **Analysis-only** (no decision yet — "why did signups drop?"): frame (1) → diagnose with an issue tree (2) → evidence, correlation-vs-causation (4) → conclusion, naming the decision it should feed. Skip options and the decision record unless asked.
- **Framing-only** ("help me ask the right question"): step 1 plus `d-problem-framing.md`, output the reframed problem and the questions worth answering. This is the natural seam where a separate `framing-problems` skill would take over if one exists.

## Guardrails

- **Match rigor to stakes.** The triage step is not optional throat-clearing — it's the decision that prevents both reckless snap calls and analysis paralysis.
- **Frame before solve.** Don't generate options until the problem statement is confirmed. Jumping to solutions is the most common and most expensive failure mode.
- **Make uncertainty explicit.** State decisions as probabilistic claims with confidence and named assumptions. "It depends" is not an answer; "70% on B, contingent on A1" is.
- **Don't bury the trade-off or the counter-evidence.** Surface what the decision sacrifices and the strongest case against it. If you can't state the best argument for the option you rejected, you haven't earned the decision.
- **The catalog is a toolbox, not a checklist.** Pull the few methods that fit; never march through all 225. Cite the method you used so the reasoning is traceable.
- **Decision quality ≠ outcome.** Record the process and the tripwires so the decision can be judged on what was knowable, and revisited when a tripwire trips.
- **A metric that becomes a target gets gamed (Goodhart).** Whenever a number drives a decision, incentive, or success criterion, pair it with the inputs that produce it and a guardrail/counter-metric that catches the damage — never steer on a single number (`references/i-ops-analytics-and-metrics.md`).
- **Find the constraint before you optimize.** Ask "is this the bottleneck?" first — improving a non-constraint yields no throughput and can pile work up in front of the real limit (Theory of Constraints, `references/i-ops-analytics-and-metrics.md`).
- **Don't let rigor become theater — or a blame shield.** A framework that changes no concrete action is process theater; cut it. A human (or a human-in-the-loop) who can't realistically intervene is a moral crumple zone, not a safeguard. Rigor has to change the decision, not just document it.
- **You are an AI running this process — apply the AI guards to yourself.** Your own fluent output is not evidence. Actively seek disconfirming evidence instead of confirming the user's framing (sycophancy); verify load-bearing facts you assert (a hallucinated fact is a decision risk); state your recommendation as a calibrated bet, not an authority; and keep a human veto on one-way-door, high-stakes, or value-laden calls (`references/k-ai-augmented-2026.md`).

## References

The method catalog lives in `references/`. Start from the index; open category files only as a step calls for them.

- `references/00-index.md` — routing table (situation → file) and per-category method summary. **Read this first** to navigate.
- `references/minerva-hcs.md` and `references/a-…k-….md` — the 12 category files, each with full per-method detail (what it is, use in the process, questions to ask, four-axis application, 2026 note, sources).
- `templates/decision-record.md` — the output template for a full decision.
