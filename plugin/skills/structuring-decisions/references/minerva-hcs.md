> Decision-Science Method Catalog · Minerva HCs · 41 ported (no fixed canonical count — "76" is an unverified, widely-circulated figure kept here as a discoverability hook). Legend: engineering / product / ops / strategy = four-axis application; fit = fit with software/SaaS (3–5).

### #rightproblem — Characterize the Problem · fit 5
*aka / source:* #rightProblem; echoes Polya's "Understand the problem" and Charles Kettering's "a problem well stated is a problem half solved"
- **What it is**: Before solving, characterize the essence of the problem — what the real goal is, what is known and unknown, and what class of problem it belongs to — so you don't solve the wrong problem.
- **Use in the process**: The first move of any decision: translate a "symptom" into a "problem statement." Before any solution meeting, write one sentence — "the problem we are actually solving is X, and success looks like Y" — so everyone aligns on the problem before debating solutions.
- **Questions to ask**: Ask "Is this the real problem, or a symptom of a deeper one?" "If we solve this, will the underlying pain go away?" "Who says this is a problem, and a problem for whom?"
- **Engineering**: For a checkout-timeout ticket, don't rush to raise the timeout; first characterize whether the problem is a slow DB query, payment-gateway retries, or overly aggressive front-end polling. Open every RFC with a fixed Problem Statement section.
- **Product**: When a merchant asks for a "report export feature," first characterize the real problem — often it is "reconciliation is hard," which a webhook or an existing API may solve, rather than building yet another export.
- **Ops**: Seeing "refund rate is up," first characterize it: is it a specific plan, a specific payment provider, a release, or seasonality? Get the problem definition wrong and every downstream analysis is wrong.
- **Strategy**: When a multi-tenant platform's "growth is slowing," characterize whether it is an acquisition, activation, retention, or monetization problem — this decides the quarter's roadmap investment.
- **2026**: In the LLM era, "asking the right problem" is scarcer than "producing answers"; write the problem clearly with #rightproblem first, then let AI generate solutions — the quality gap is enormous.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html, https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf
- **Beyond software**: A clinic flags "ER wait times are too long" and is asked to add beds. Characterizing first reveals the real problem is discharge bottlenecks — admitted patients can't leave because no inpatient bed is free — so the fix is faster ward turnover and discharge planning, not ER capacity.

### #breakitdown — Break It Down · fit 5
*aka / source:* #breakItDown; divide-and-conquer (decomposition), MECE
- **What it is**: Break a large problem into tractable, as-independent-as-possible sub-parts and tackle them one by one.
- **Use in the process**: For a complex decision, build a problem tree / issue tree — split "should we do X" into sub-questions that can be judged independently, gather evidence for each, then recombine.
- **Questions to ask**: Ask "Into which non-overlapping sub-problems does this decompose?" "Which sub-part is most uncertain and most worth validating first?"
- **Engineering**: Decompose "refactor the checkout service" into modules — payment abstraction, tax calculation, inventory locking, order state machine — each independently testable and shippable.
- **Product**: Split a large epic (e.g. multi-currency support) into vertical slices — FX source, display format, settlement currency, refund currency — and ship the smallest usable slice first.
- **Ops**: Analyze a GMV change with a multiplicative decomposition: GMV = traffic × conversion rate × average order value; locate which factor is driving it, then decompose further.
- **Strategy**: Break a new-market-entry decision into regulation, payment localization, logistics, support languages, and pricing, assessing feasibility and cost for each.
- **2026**: Strongly isomorphic to LLM chain-of-thought / task decomposition; designing an agent workflow is doing #breakitdown.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #utility — Costs & Benefits for Stakeholders · fit 5
*aka / source:* #utility; cost-benefit analysis, utility theory
- **What it is**: When deciding, weigh the various types of future costs and benefits from the perspective of all stakeholders — not only your own, and not only the present.
- **Use in the process**: Build a stakeholder × cost/benefit table, filling each cell with the future gains and losses for each party; watch for cases that are "best for the whole but severely harmful to a subgroup" and pre-emptively mitigate them.
- **Questions to ask**: Ask "For each stakeholder (merchant, buyer, support, engineering, finance), is this decision a net gain or loss?" "Have we counted the future, indirect costs?"
- **Engineering**: Frame a technology choice (build vs. buy SaaS) as a cost-benefit table — development cost, maintenance burden, lock-in risk, team learning curve — not just license fees.
- **Product**: Before sunsetting a low-usage feature, assess the impact on the few heavy-using merchants and their migration cost, to avoid "best for the whole but driving away a key customer."
- **Ops**: Support-automation ROI: labor saved vs. the complaint cost and merchant churn caused by misclassification; quantify the indirect costs.
- **Strategy**: For a take-rate change, assess the costs and benefits for large merchants, small merchants, the platform, and ecosystem app developers one by one, anticipating backlash.
- **2026**: The official Minerva intro PDF presents this as the representative HC for "Weighing Decisions" — a core tool of the decision process.
- Sources: https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf, https://eshmanager.blogspot.com/2024/12/blog-post.html
- **Beyond software**: Before a city closes a downtown street to cars for a pedestrian plaza, build a stakeholder × cost/benefit table — residents (quieter, safer), shop owners (fear lost delivery access and parking), disabled drivers (harder access), bus riders (rerouted lines) — surfacing that a blanket closure is a net win overall but severely harms delivery-dependent shops, so you pre-design loading windows and accessible drop-offs.

### #estimation — Estimation · fit 5
*aka / source:* #estimation; Fermi estimation, plausibility check
- **What it is**: Use approximation, round numbers, and upper/lower bounds to quickly check whether a quantitative claim is plausible. Minerva's official example: use an age distribution to quickly show that a politician's crime-rate claim is implausible.
- **Use in the process**: Before deciding, do a back-of-the-envelope estimate of the key numbers to establish a plausible range; treat any figure outside that range with suspicion before adopting it.
- **Questions to ask**: Ask "Is the order of magnitude right?" "What is the largest/smallest plausible value?" "Who supplied it, and do they have an incentive to inflate?"
- **Engineering**: Capacity planning: estimate QPS, storage growth, and bandwidth, working out the magnitude before architecting ("1M orders/day ≈ how many IOPS?") to avoid over- or under-design.
- **Product**: Estimate a feature's potential impact: "affected merchants × usage frequency × average order value" sizes the opportunity before committing investment.
- **Ops**: Sanity-check dashboard figures; outliers are usually instrumentation or definition issues rather than truth.
- **Strategy**: Cross-check third-party market-size reports (TAM/SAM/SOM) with a Fermi estimate to avoid being misled by inflated numbers.
- **2026**: LLMs readily produce numbers that look precise but are off by orders of magnitude; #estimation is especially important as a sanity gate on AI output.
- Sources: https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf, https://eshmanager.blogspot.com/2024/12/blog-post.html
- **Beyond software**: A nonprofit is pitched a "reach 2 million people" flyer campaign. A Fermi check — print run 50,000 × ~3 readers seen per flyer × maybe 10% who actually read it ≈ 15,000 real impressions — shows the claimed reach is off by two orders of magnitude, so you renegotiate the price before signing.

### #confirmationbias — Confirmation Bias · fit 5
*aka / source:* #confirmationBias; related to #biashunt (hunting for bias)
- **What it is**: Identify and reduce the bias of "seeking or interpreting only information that supports your prior belief." Minerva presents this as the representative HC for bias-hunting.
- **Use in the process**: Before deciding, deliberately seek disconfirming evidence and "data that would overturn my hypothesis"; appoint a devil's advocate; write down in advance "what evidence would change my mind."
- **Questions to ask**: Ask "Am I only looking at data that supports me?" "What evidence would prove me wrong — have I gone looking for it?" "What is the strongest opposing argument?"
- **Engineering**: When debugging, don't only hunt for logs that support your hypothesis; pre-register the metric and stopping rule before an A/B test, so you can't cherry-pick an outcome afterward and build the story around it (HARKing) and can't peek-and-stop to manufacture significance (p-hacking).
- **Product**: In user interviews, avoid leading questions (collecting only feedback that supports the feature you want to build); actively interview people who don't use the feature.
- **Ops**: Avoid starting from a conclusion and hunting for data; pre-set the metric and success threshold and face the result honestly even when it disappoints.
- **Strategy**: In strategy retrospectives, avoid recalling only the cases that validate your judgment; systematically review failed predictions.
- **2026**: Of a piece with pre-registration and HARKing prevention in data analysis; LLMs tend to flatter the user's existing stance, making proactive disconfirmation even more necessary.
- Sources: https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf, https://eshmanager.blogspot.com/2024/12/blog-post.html, https://mattclancy.medium.com/how-minerva-university-teaches-habits-of-mind-1627499afb32
- **Beyond software**: A hiring panel that loved a candidate in the interview asks references only "what are her strengths?" To counter confirmation bias, pre-commit to asking every reference "in what situations did she struggle, and would you hire her again?" and weigh the disconfirming answers as heavily as the praise.

### #correlation — Correlation vs. Causation · fit 5
*aka / source:* #correlation; distinguish correlation and causation
- **What it is**: Distinguish correlation from causation and identify potential confounders and reverse causation. It is a foundational-concept example named in *Building the Intentional University*.
- **Use in the process**: When two variables move together, first list possible third-variable confounders and reverse causation; don't make a major commitment on the basis of correlation before establishing causation.
- **Questions to ask**: Ask "Does X cause Y, or is there a common cause Z?" "Could Y be causing X?" "Is there an experiment that could establish causation?"
- **Engineering**: Observing "error rate rose after deploy," don't immediately attribute it to that deploy; check for confounders such as a simultaneous traffic spike or a third-party outage.
- **Product**: "Users of feature A retain better" may be because already-active users self-select into A (selection bias); validate with an experiment or propensity scoring.
- **Ops**: The core issue in marketing attribution: a channel correlating with conversions does not mean it drove incremental conversions; validate true causation with an incrementality test / holdout.
- **Strategy**: "Successful platforms all have X" is correlation; rushing to copy it may step into survivorship bias — interrogate the causal mechanism.
- **2026**: The most common trap in e-commerce data analysis; recent practice emphasizes causal inference (DiD, synthetic control, geo holdout) to isolate true incrementality.
- Sources: https://academic.oup.com/mit-press-scholarship-online/book/17355/chapter-abstract/174828729, https://eshmanager.blogspot.com/2024/12/blog-post.html
- **Beyond software**: A school district sees that students in its after-school tutoring program score higher and moves to expand it. But tutoring is opt-in — more motivated families self-select in (selection bias / common cause). Before committing budget, run a randomized lottery among applicants and compare enrolled vs. waitlisted to isolate the true effect.

### #tradeoffs — Trade-offs · fit 5
*aka / source:* #tradeoffs (often paired with #utility and #optimization)
- **What it is**: Identify and make explicit the trade-offs between options — every decision gives up some things to gain others.
- **Use in the process**: When deciding, write down explicitly "what we give up by choosing A," making implicit trade-offs explicit; an "option" with no trade-offs usually signals insufficient analysis.
- **Questions to ask**: Ask "What does choosing this cost?" "How much Y are we willing to sacrifice for X?" "Are we pretending there is no trade-off?"
- **Engineering**: Make trade-offs explicit in the design doc — CAP, consistency vs. availability, performance vs. maintainability; technical debt is a trade-off of speed against quality.
- **Product**: Make the iron-triangle trade-off of scope vs. time-to-market vs. quality, and have stakeholders choose explicitly.
- **Ops**: Make metric trade-offs explicit (growth vs. margin, conversion vs. order value) to avoid one-sided optimization.
- **Strategy**: Strategy is essentially trade-offs (Porter: strategy is choosing what not to do); making them explicit enables focus.
- **2026**: Esther Wenger's essay lists #tradeoffs as a core HC applied repeatedly throughout her student years.
- Sources: https://medium.com/@wenger.esther/habits-of-mind-and-foundational-concepts-hcs-complexity-and-selflearning-ce762a70be38, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #gapanalysis — Gap Analysis · fit 4
*aka / source:* #gapAnalysis; current-state vs. target-state gap analysis
- **What it is**: Identify the gap between the "current state" and the "ideal target" — the gap itself reveals where an innovative solution is needed.
- **Use in the process**: Before planning, quantify the current state and the desired state, list the gaps, and prioritize them; invest first in gaps that are large and high-value.
- **Questions to ask**: Ask "Where are we now and where do we want to be?" "Where is the largest gap?" "What capabilities/resources are needed to close it?"
- **Engineering**: System availability is currently 99.5% with a target of 99.95%; gap analysis locates whether the cause is deploy-window downtime, DB failover, or third-party dependencies, and directs investment at the largest gap.
- **Product**: Map a competitor feature matrix against your own product to find must-have gaps (e.g. missing LINE notifications) and slot them into the roadmap.
- **Ops**: Support SLA target of 30-minute first response vs. an actual 50 minutes; decompose the gap by peak hours / issue type and target headcount or automation accordingly.
- **Strategy**: Gap analysis against a target market share judges whether to invest in product, channel, or brand.
- **2026**: Minerva's 2024 Insights explicitly uses #gapanalysis as a foundational-concept example, underscoring its central role in the problem-definition phase.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html, https://learn.minervaproject.com/hubfs/MinervaProject_A-New-Look-at-General-Education_Insights2024.pdf

### #constraints — Constraint Satisfaction · fit 4
*aka / source:* #constraints; constraint satisfaction problem (CSP)
- **What it is**: First identify the problem's constraints (the boundaries of feasible solutions); for many problems the solution is nearly determined once all constraints are satisfied simultaneously. Minerva's official example: arranging furniture is nearly fully determined by wall and backing constraints.
- **Use in the process**: Before deciding, list hard constraints (regulation, budget, SLA, dependencies) and soft constraints, narrowing the solution space to the feasible region; often the choice then becomes clear.
- **Questions to ask**: Ask "Which are inviolable hard constraints?" "Which are actually false constraints we can challenge?" "Once all constraints are satisfied, how many options remain?"
- **Engineering**: Database schema design is bounded by foreign keys, unique keys, multi-tenant isolation, and performance constraints; write the constraints down first and the feasible design tends to converge. Scheduling / inventory allocation is itself a CSP.
- **Product**: Feature design is bounded by constraints such as "cannot break existing API compatibility" and "mobile width 380px"; list constraints before designing to avoid solutions that can't ship.
- **Ops**: Promotion design is bounded by inventory caps, a margin floor, and fulfillment capacity; treat these as constraints to solve for the optimal discount mix.
- **Strategy**: Pricing strategy is bounded by three constraints — a cost floor, a competitor ceiling, and merchant acceptability — so the feasible price band is in fact narrow.
- Sources: https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #optimization — Optimization · fit 4
*aka / source:* #optimization; trade-off optimization
- **What it is**: Evaluate and apply optimization techniques under constraints to find the best (or good-enough) solution to an objective function, recognizing the trade-offs among multiple objectives.
- **Use in the process**: First define explicitly what you are optimizing (a single metric) and the constraints; avoid simultaneously optimizing mutually exclusive objectives; use weighting or Pareto-front thinking where necessary.
- **Questions to ask**: Ask "What exactly are we optimizing?" "Does a local optimum sacrifice the global one?" "Will over-optimizing one metric harm another?"
- **Engineering**: Query-performance tuning optimizes among index size, write cost, and read latency rather than blindly adding indexes; the CDN/cache hit-rate vs. consistency trade-off is similar.
- **Product**: Conversion-funnel optimization must beware: over-simplifying checkout steps may sacrifice fraud protection or required tax-information collection.
- **Ops**: Optimize ROAS by allocating marketing budget across channels, recognizing diminishing marginal returns — don't pour everything into the single best channel.
- **Strategy**: A platform must optimize between "merchant count" and "merchant quality/GMV"; chasing sign-up counts alone can lower overall health.
- **2026**: Directly relevant to SaaS "North Star metric" design; recent practice stresses avoiding the Goodhart effect (a metric ceases to be good once it becomes a target).
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #variables — Identify Variables · fit 4
*aka / source:* #variables; variables & parameters
- **What it is**: Identify and analyze the variables and parameters in a problem: which can vary, which are fixed, and how they depend on one another.
- **Use in the process**: Before deciding, map the "input variables → outcome" relationship, distinguishing controllable variables (we can adjust) from exogenous variables (we can only respond to), and focus effort on the controllable ones.
- **Questions to ask**: Ask "Which variables truly affect the outcome?" "Which can we control and which can't we?" "Are there overlooked hidden variables?"
- **Engineering**: Model a performance problem by decomposing latency into variables — QPS, payload size, connection count, GC frequency — and change only one at a time when experimenting.
- **Product**: Before an A/B test, define the independent variable (button copy) and the dependent variable (conversion rate) explicitly, holding other variables constant to avoid contaminating the conclusion.
- **Ops**: When building a retention model, identify the key variables — time to first order, SKU count, number of support interactions — and find the ones you can intervene on.
- **Strategy**: In a market model, separate controllable variables (pricing, marketing) from uncontrollable ones (macro, FX); bet strategy only on the controllable.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #payoffs — Incentives & Payoffs · fit 4
*aka / source:* #payoffs; payoff matrix, incentive design
- **What it is**: Identify how incentives shape each party's decisions — people act toward what is rewarded.
- **Use in the process**: Before designing any mechanism, draw a payoff matrix and reason through each party's rational response under the incentives, to avoid creating counterproductive incentives.
- **Questions to ask**: Ask "What behavior is this scheme actually rewarding?" "What is each party's best response?" "Will it induce gaming the loophole?"
- **Engineering**: An on-call / SLA scheme that only penalizes incident count may induce engineers to hide small incidents; design the metric to align with the behavior you actually want.
- **Product**: When designing referral rewards or revenue-share mechanisms, first reason through how merchants/buyers will maximize their own payoff (fake orders, self-referral).
- **Ops**: Promotion analysis must watch for incentive distortion: does a spend-threshold discount merely consolidate orders rather than drive incremental GMV?
- **Strategy**: How the ecosystem app-developer revenue-share rate affects their investment; how channel bonuses shape sales behavior.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #sunkcost — Sunk Cost · fit 4
*aka / source:* #sunkcost; sunk-cost fallacy
- **What it is**: Analyze the (improper) influence of sunk costs on decisions: already-spent, unrecoverable costs should not affect future decisions, yet people often persist because of them.
- **Use in the process**: When evaluating "continue or not," look only at the marginal cost and benefit "from here forward," deliberately marking already-invested time/money as unrecoverable and excluding it.
- **Questions to ask**: Ask "If I were starting from zero today, would I still choose this path?" "Am I deciding on future value, or on reluctance to waste what I've put in?"
- **Engineering**: An internal framework written over half a year works poorly — should we switch to an open-source one? Use #sunkcost to strip out the "we've already written so much" emotion and compare only future maintenance cost.
- **Product**: A feature that consumed many engineer-hours has near-zero usage after launch — should we remove it? Don't be held hostage by existing investment.
- **Ops**: When deciding whether to stop a continuously loss-making marketing channel, exclude historical spend.
- **Strategy**: The biggest resistance to a strategic pivot is often sunk cost; naming it explicitly aids rational cutting of losses.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html
- **Beyond software**: A household has already spent $6,000 repairing an aging car and now faces a $3,000 transmission job. Strip out the $6,000 (unrecoverable) and compare only the path forward — $3,000 plus likely future repairs versus the cost of a more reliable replacement — deciding on future value, not on reluctance to "waste" what's already been put in.

### #risk — Risk vs. Uncertainty · fit 4
*aka / source:* #risk; Knightian uncertainty
- **What it is**: Analyze how "risk" (probabilities estimable) and "uncertainty" (probabilities unknown) affect decisions differently, and choose responses accordingly.
- **Use in the process**: First judge whether you face quantifiable risk (use expected value / an insurance mindset) or genuine uncertainty (use an options mindset — small bets, preserved flexibility).
- **Questions to ask**: Ask "Is this risk with estimable probabilities, or uncertainty with no computable probability at all?" "Can I survive the worst case?" "Is there a low-cost way to probe?"
- **Engineering**: Ship a high-risk change incrementally (feature flag, gradual rollout, canary) — converting uncertainty into observable, rollbackable small risk.
- **Product**: Enter an entirely new feature domain (uncertainty) via a small beta with a few merchants rather than a full rollout at once.
- **Ops**: Under demand uncertainty, handle inventory and stocking with safety stock and scenario analysis rather than a single point forecast.
- **Strategy**: Bet on an emerging market (high uncertainty) with options-style investment: a small outlay buys the right to scale up later.
- **2026**: Connects to the modern reversible-vs-irreversible decision framework (Type 2 / two-way door vs. Type 1 / one-way door): irreversible and highly uncertain decisions warrant more caution.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #broadframing — Broad Framing · fit 4
*aka / source:* #broadFraming; avoid narrow framing (echoes the WRAP framework in Chip & Dan Heath's *Decisive*)
- **What it is**: Replace a binary "do/don't" decision with multiple options — widen the option space to avoid narrow framing. (Homonym caution: "broad framing" also names the Kahneman/Tversky/Thaler "broad bracketing" idea — evaluate this choice as one of a portfolio of repeated bets to counter narrow-bracketing loss aversion; this HC is the WRAP "widen the options" sense, so reach for broad bracketing instead when the decision recurs.)
- **Use in the process**: Whenever a decision is framed as "do X or not," force yourself to generate at least two further options and consider opportunity cost ("what else could the same resources do?").
- **Questions to ask**: Ask "Besides yes/no, what other options are there?" "If neither of these two were available, what would I do?" "Is there an 'and' design that gets both?"
- **Engineering**: "Build it or use vendor A" → add options like "use B," "hybrid," "adopt now and switch later," to avoid being trapped in a vendor's binary.
- **Product**: "Build feature A or B" → widen to combinations like "ship a minimal A while collecting demand evidence for B."
- **Ops**: A promotion of "20% off or 10% off" → widen to spend thresholds, gift-with-purchase, member-exclusive structures, then compare with data.
- **Strategy**: "Enter Japan or Southeast Asia" → widen to "small-scale pilots in both" or "partner with a local player."
- **2026**: Directly maps to the first step of Chip & Dan Heath's WRAP, "Widen your options," now standard in modern decision processes.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #fallacies — Logical Fallacies · fit 4
*aka / source:* #fallacies
- **What it is**: Identify and correct logical fallacies in arguments (e.g. straw man, appeal to authority, slippery slope, false dilemma).
- **Use in the process**: When reviewing a decision's argument chain, check each inference for fallacies; being able to call out "that's a false dilemma / a hasty generalization" in real time raises decision quality.
- **Questions to ask**: Ask "Does this conclusion actually follow from the premises?" "Is it appealing to authority/the person/the crowd rather than to evidence?" "Is there an equivocation?"
- **Engineering**: In technical debates, spot fallacies like "the big players all use it so it's right" (appeal to authority) and "if we don't rewrite it will collapse" (slippery slope), and demand evidence.
- **Product**: In requirements discussions, "all users want it" (hasty generalization) and "if we don't, we'll lose to competitors" (false dilemma) need to be tested against data.
- **Ops**: When reading reports, avoid fallacies like "correlation implies causation" and survivorship bias that lead to wrong conclusions.
- **Strategy**: Strategy proposals often feature "successful companies all do X, so we must do X" (ignoring base rates / survivorship bias) — call it out.
- **2026**: AI-generated content often wraps fallacies in fluent prose; the ability to critically check the validity of inferences rises in value.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #significance — Statistical Significance · fit 4
*aka / source:* #significance; interpreting p-values and significance
- **What it is**: Interpret statistical significance correctly: significant does not mean important, and non-significant does not mean no effect; watch sample size and multiple comparisons.
- **Use in the process**: Don't decide on "significant or not" alone; consider effect size (#effectsize) and the confidence interval too; treat "significance" from a small sample with suspicion.
- **Questions to ask**: Ask "Is the sample large enough?" "Does the effect size have practical meaning?" "How many comparisons were made — is there a multiple-comparisons problem?" "Is non-significance a true null effect or insufficient power?"
- **Engineering**: Add a statistical test and confidence interval to performance-benchmark comparisons to avoid being misled by single-run jitter; have the A/B platform handle multiple metrics correctly.
- **Product**: Before an A/B test reaches "significance," compute the required sample size and the MDE (minimum detectable effect) to avoid peeking and concluding early.
- **Ops**: A "3% rise this week" in a report needs judging against normal fluctuation — don't mistake noise for a trend.
- **Strategy**: A small pilot's "positive signal" needs confirming as non-random before scaling investment.
- **2026**: The industry has broadly shifted toward confidence intervals / Bayesian A/B testing in place of bare p-values; use alongside #effectsize and #confidenceintervals.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #bayes / #conditionalprob — Bayesian & Conditional Probability · fit 4
*aka / source:* #bayes; #conditionalProb; base-rate neglect
- **What it is**: Use Bayesian methods to update beliefs in light of new evidence, handling conditional probability and base rates correctly.
- **Use in the process**: When deciding, write down the prior (base rate) explicitly, then update rationally on new evidence rather than letting a vivid anecdote override the base rate.
- **Questions to ask**: Ask "What is the prior (base rate)?" "Which way and by how much does this evidence move the probability?" "Am I neglecting the base rate?"
- **Engineering**: An alerting system's true-positive rate is shaped by the base rate: for rare events, even an accurate test yields mostly false alarms (Bayes) — design alert thresholds accordingly. Fraud-detection models are analogous.
- **Product**: Update your belief about a feature's success/failure with a small amount of early feedback rather than pivoting hard on one or two voices.
- **Ops**: Diagnosing conversion / fraud rates must account for base rates; a "high hit-rate rule" can have very low precision at a low base rate.
- **Strategy**: Continuously update confidence in a bet on new market signals rather than clinging to the initial judgment or over-reacting to a single news item.
- **2026**: Bayesian updating is the mathematical basis of the modern "strong opinions, loosely held" decision culture.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #purpose — Identify Goals and Values · fit 4
*aka / source:* #purpose; identify and evaluate underlying goals and values
- **What it is**: Identify and evaluate the underlying goals and values behind an action, argument, or system.
- **Use in the process**: Before each decision, clarify "what real goals and value priorities we are pursuing," so options align with goals and you avoid doing a pile of work unrelated to them.
- **Questions to ask**: Ask "What are we actually trying to achieve?" "What value trade-offs are implied here?" "Are the parties' goals aligned or in conflict?"
- **Engineering**: Align architecture decisions with the real goal: is it for development speed, reliability, or cost? Unclear goals yield directionally wrong "beautiful designs."
- **Product**: When writing a PRD, first state "what merchant goal and platform goal this feature serves," to avoid stacking features without knowing why.
- **Ops**: Before defining a metric, confirm the goal the metric serves, to avoid measuring a pile of vanity metrics.
- **Strategy**: Ground strategy in the mission and value priorities (growth vs. profit vs. ecosystem health) to guide trade-offs.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #firstprinciples — First Principles · fit 4
*aka / source:* #firstPrinciples; reasoning from fundamental commitments
- **What it is**: Identify and return to a problem's most fundamental, irreducible premises and reason up from the basics, rather than reasoning by analogy to existing practice.
- **Use in the process**: When stuck or questioning convention, decompose the problem to basic facts of physics/economics/logic and re-derive a solution from the ground up, challenging "everyone does it this way."
- **Questions to ask**: Ask "Which things do we actually know to be true?" "Does the underlying reason for this convention still hold?" "If we designed it from scratch, what would we do?"
- **Engineering**: Question "we must use framework X" and re-derive the technology choice from basic requirements (latency, consistency, team capability); start cost optimization from "why is this computation necessary at all."
- **Product**: When redesigning checkout, return to the essence of "the minimum information and trust a transaction requires" rather than copying competitors' steps.
- **Ops**: Question an existing metric definition and return to "what business truth this number actually measures" to redefine it.
- **Strategy**: Derive pricing from the first principles of the cost structure (unit economics) rather than following the prevailing market rate.
- **2026**: Popularized by Musk into an industry buzzword; in 2026, as AI/automation reshapes cost structures, first-principles re-evaluation matters even more.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #testability — Testability · fit 4
*aka / source:* #testability; evaluate whether hypotheses yield testable predictions
- **What it is**: Evaluate whether a hypothesis yields testable predictions — an unfalsifiable claim has limited value in science and in decision-making.
- **Use in the process**: Turn any hypothesis/bet into a form that "specific data can prove right or wrong," and define the success/failure criteria in advance.
- **Questions to ask**: Ask "What result would prove this hypothesis false?" "In what time frame and with what metric can we validate it?"
- **Engineering**: Turn a product hypothesis into an instrumented, measurable metric; "improve the experience" must land as "checkout-completion rate +X%" to be testable. TDD likewise turns a spec into verifiable tests.
- **Product**: Attach to every feature bet a "success hypothesis + validation metric + time window," compare against it after launch, and build a learning loop.
- **Ops**: Insights raised in analysis should be testable against subsequent data, not unverifiable stories.
- **Strategy**: Design strategic hypotheses ("the down-market will pay") as propositions testable via a small pilot.
- **2026**: Identical in origin to Lean Startup "hypothesis validation" and the PM practice of "hypothesis-driven development."
- Sources: https://mattclancy.medium.com/how-minerva-university-teaches-habits-of-mind-1627499afb32, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #experimentaldesign — Experimental Design · fit 4
*aka / source:* #experimentalDesign; apply and evaluate principles of experimental design
- **What it is**: Apply and evaluate the principles of experimental design — control groups, randomization, variable isolation — to reach credible causal conclusions.
- **Use in the process**: Before a major change, design a controlled experiment (A/B, holdout) to ensure attribution; where experimentation isn't possible, fall back to a quasi-experiment.
- **Questions to ask**: Ask "Is there a control group?" "Was assignment randomized?" "Are there uncontrolled confounders?" "Are the sample and duration sufficient?"
- **Engineering**: Feature-flag-driven A/B infrastructure; ensure randomized assignment, clean metrics, and no SRM (sample-ratio mismatch).
- **Product**: Test a feature change via A/B rather than guessing the effect after a full rollout; when designing the experiment, define the primary metric and guardrail metrics.
- **Ops**: Measure marketing-campaign incrementality with a geo holdout / randomized holdout; design the experiment to avoid contamination and spillover.
- **Strategy**: Validate a new business model with a controlled pilot (some markets / some merchants) before scaling.
- **2026**: #control; maps directly to modern experimentation platforms and causal-inference practice.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #levelsofanalysis — Levels of Analysis · fit 4
*aka / source:* #levelsOfAnalysis
- **What it is**: Describe how a system interacts across different levels of analysis (individual, group, organization, ecosystem), avoiding level confusion.
- **Use in the process**: When analyzing a problem, mark explicitly which level you are at and check for cross-level spillovers; a decision optimal at the individual level may harm the system (and vice versa).
- **Questions to ask**: Ask "Is this at the individual, team, organization, or market level?" "Good for one level — what about another?" "Are there cross-level unintended consequences?"
- **Engineering**: Distinguish the single-machine, service, cluster, and system levels in performance optimization; optimizing one service can drag down the whole (local optimum). Microservice boundaries are level partitions.
- **Product**: A feature good for a single merchant (individual level) — does it have negative spillover on the whole platform / buyer ecosystem (system level)?
- **Ops**: Distinguish user-level, merchant-level, and platform-level metrics; a good result at the aggregate level can mask a bad one for a subgroup (Simpson's paradox).
- **Strategy**: Platform strategy must balance the multiple levels of merchants, buyers, and ecosystem partners, not optimize one side.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #multiplecauses — Multiple Causes · fit 4
*aka / source:* #multipleCauses; multi-causality
- **What it is**: Identify how multiple causes interact to produce an outcome, avoiding single-cause attribution.
- **Use in the process**: In root-cause analysis, resist the urge to "find one culprit"; systematically list the multiple joint/interacting causes and assess each one's contribution.
- **Questions to ask**: Ask "Is there really only one cause?" "Which factors stacked up to cause it?" "Is fixing one enough?"
- **Engineering**: Conduct incident root-cause analysis (RCA) with a multiple-causes lens — usually several small problems stacked together (the Swiss-cheese model) rather than a single point; in the postmortem, avoid a single scapegoat.
- **Product**: A feature's failure is usually multiple factors stacked — requirements, design, timing, promotion; the retrospective should be comprehensive rather than blaming one spot.
- **Ops**: A conversion-rate decline is usually multi-causal (release + season + competitor + traffic mix); attribution should decompose each contribution.
- **Strategy**: Market success or failure is multi-causal; attributing it to a single decision easily yields the wrong lesson.
- **2026**: Highly consistent with the modern SRE "blameless postmortem" and systems thinking.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #audience — Tailor to Audience · fit 4
*aka / source:* #audience; tailor oral and written work for context and audience
- **What it is**: Adapt oral and written communication to the context and audience. It is a representative HC cited in several Minerva sources.
- **Use in the process**: Before recommending a decision, analyze who the decision-maker is, what they care about, and what language they use; frame the same decision differently for engineering, finance, and merchants to build consensus.
- **Questions to ask**: Ask "Who is my audience and what do they care about most?" "What is their background knowledge?" "What language/metrics will land with them?"
- **Engineering**: Pitch a technical proposal to an engineering lead in terms of reliability and cost, to a PM in terms of time-to-market; tune the depth of an RFC/PR description to the reader.
- **Product**: Frame the same feature to merchants as "earn more," internally as "metric lift," and to support as "fewer tickets."
- **Ops**: Present the same analysis to executives (conclusion + recommendation) and to analysts (method + data) at different levels of detail.
- **Strategy**: Frame the strategy narrative differently for the board, employees, and investors while keeping the core consistent.
- **2026**: As AI-assisted writing becomes ubiquitous, "judging the audience and calibrating the message" becomes a key point of human stewardship.
- Sources: https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf, https://mattclancy.medium.com/how-minerva-university-teaches-habits-of-mind-1627499afb32, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #selflearning — Self-learning · fit 4
*aka / source:* #selfLearning; #selfteaching; apply effective strategies to teach yourself
- **What it is**: Apply effective strategies to teach yourself material in a new domain — an HC that Minerva alumni regard as "the most powerful."
- **Use in the process**: Facing a decision in an unfamiliar domain, use structured self-teaching (find authoritative sources, active recall, spaced practice) to build a sufficient mental model quickly before deciding.
- **Questions to ask**: Ask "What do I need to understand to make this decision?" "What is the fastest path to reliable understanding?" "Where are my remaining knowledge blind spots (#metaknowledge)?"
- **Engineering**: Get up to speed on a new tech stack/framework quickly; this is the core meta-skill behind an engineer's career compounding.
- **Product**: Before entering a new vertical (e.g. cross-border, B2B), quickly self-teach that domain's knowledge and regulations.
- **Ops**: Self-teach new analytical methods (causal inference, Bayesian) to improve decision quality.
- **Strategy**: Leaders quickly master new trends (AI, regulatory change) to make forward-looking strategic judgments.
- **2026**: AI tools greatly accelerate self-teaching, but "judging what to learn and verifying whether the AI taught it correctly" relies even more on this meta-skill.
- Sources: https://medium.com/@wenger.esther/habits-of-mind-and-foundational-concepts-hcs-complexity-and-selflearning-ce762a70be38, https://mattclancy.medium.com/how-minerva-university-teaches-habits-of-mind-1627499afb32, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #sourcequality / #infoneeded — Source Quality & Info Needed · fit 4
*aka / source:* #sourceQuality; #infoNeeded; information literacy
- **What it is**: Identify the information gaps needed to support an argument (#infoneeded), and judge a source's credibility by its type (#sourcequality).
- **Use in the process**: Before deciding, ask "to decide responsibly, what key information am I still missing, and are the sources reliable enough?"; list the info gaps and fill the high-value ones first.
- **Questions to ask**: Ask "What data is still missing to support this conclusion?" "What is this source's credibility and conflict of interest?" "Is it primary or secondary, and is it reproducible?"
- **Engineering**: Before a technology choice, identify the benchmark/compatibility information gaps the decision needs; judge the authority of a doc/answer source (official docs > a random blog > an LLM hallucination).
- **Product**: Before a requirements decision, identify which user evidence is missing and fill the key research before deciding.
- **Ops**: Before analysis, list data gaps and ambiguous definitions; judge the reliability of data sources (instrumented vs. estimated).
- **Strategy**: Due diligence ahead of a decision: identify information gaps and assess the credibility and bias of market reports / intelligence sources.
- **2026**: In the LLM era, judging source quality (spotting hallucinations, verifying citations) becomes a basic skill, isomorphic to the process of verifying the "76" figure in this very catalog.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html, https://academic.oup.com/mit-press-scholarship-online/book/17355/chapter-abstract/174828729

### #decisiontrees — Decision Trees · fit 3
*aka / source:* #decisionTrees; expected-value tree
- **What it is**: Use a decision tree to lay out each option's consequences and probabilities and compute expected values for comparison.
- **Use in the process**: For high-stakes, multi-stage decisions, draw decision nodes, chance nodes, and outcomes, label probabilities and values, and roll back the expected value to choose a branch.
- **Questions to ask**: Ask "What follows each option, with what probability and what value?" "Which branch has the highest expected value?" Plain expected-value rollback is risk-neutral — it ignores variance; if you are risk-averse, fold the tree back on a concave utility function and compare certainty equivalents (or apply an explicit risk criterion such as CVaR), then ask "which branch has the highest certainty equivalent?"
- **Engineering**: An incident-handling runbook is essentially a decision tree; use a decision tree to evaluate architecture choices' cost across different load-growth scenarios.
- **Product**: A feature-investment decision tree: do/don't × market accepts/doesn't, labeled with probabilities to estimate expected return.
- **Ops**: Define each conditional branch of a returns-handling process as a decision tree and evaluate the expected benefit of automating each node.
- **Strategy**: A multi-stage decision tree across acquire/build/partner options, including failure probabilities and exit values.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html, https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf

### #efficientheuristics — Efficient Heuristics · fit 3
*aka / source:* #efficientHeuristics; fast-and-frugal heuristics (Gigerenzer)
- **What it is**: When information or time is limited, apply rules of thumb to make good-enough decisions, recognizing when heuristics work and when they are dangerous.
- **Use in the process**: Distinguish "high-frequency, low-stakes, reversible" decisions (decide fast with a heuristic, don't over-analyze) from "low-frequency, high-stakes, irreversible" ones (worth deep analysis).
- **Questions to ask**: Ask "How much analysis is this decision worth?" "Is there a good-enough rule of thumb?" "Under what conditions does this heuristic fail?"
- **Engineering**: Use established team heuristics for code review and small technical decisions (e.g. "a new dependency needs two approvals") to avoid restarting the debate each time.
- **Product**: Prioritize requirements quickly with heuristics like RICE/ICE rather than running a full business case on each.
- **Ops**: Filter anomaly alerts first with a simple threshold rule (a cheap heuristic), then do deep analysis on what passes.
- **Strategy**: With limited resources, use the 80/20 rule to focus quickly rather than pursuing perfect, comprehensive analysis.
- **2026**: Echoes Bezos's "Type 2 reversible decisions should be made quickly by small teams" — institutionalize efficient heuristics to raise decision speed.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #emotionalbias — Emotional Bias in Decisions · fit 3
*aka / source:* #emotionalBias
- **What it is**: Identify how your current emotional state distorts decisions, and find ways to reduce its influence.
- **Use in the process**: Avoid finalizing major decisions under strong emotion (anger, excitement, panic); set a "cooling-off period" and distancing prompts like "how will I view this in 10 minutes / 10 months / 10 years?"
- **Questions to ask**: Ask "Is my current emotion affecting my judgment?" "Would I decide this way in a different mood?" "Is fear or evidence driving this?"
- **Engineering**: "Emotional decisions" in the heat of a major incident (panic-editing prod) are high-risk; the incident process mandates an incident commander and a calm checklist.
- **Product**: Pivoting the roadmap on a single big customer's heated complaint may be an emotion hijacked by an anecdote; return to the overall data before deciding.
- **Ops**: For a panic to match a competitor's new feature, cool off and look at the data first, avoiding FOMO-driven resource misallocation.
- **Strategy**: Strategic decisions made in market panic or media hype go wrong most easily; institutionalize "sleep on it before signing."
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #contrarian — Contrarian Thinking · fit 3
*aka / source:* #contrarian
- **What it is**: Deliberately take a stance opposite to the mainstream to surface new strategies and challenge consensus assumptions.
- **Use in the process**: When consensus is forming fast, designate someone to pose the contrarian hypothesis "what if everyone is wrong," testing the consensus's fragility.
- **Questions to ask**: Ask "Where might the mainstream consensus be wrong?" "What would happen if we did the opposite?" "Is there opportunity in what no one is doing?"
- **Engineering**: When the whole team wants to add things, proposing the opposite — "can we delete it / not do it" — often finds a simpler solution.
- **Product**: When competitors are all stacking features, contrarian thinking asks whether "radical minimalism" is itself the differentiation opportunity.
- **Ops**: Challenge "the metric everyone watches" and contrarily find the overlooked but more predictive leading indicator.
- **Strategy**: In a red ocean, use contrarian positioning (others compete on discounts, you on service/localization) to find blue ocean.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #algorithms — Algorithmic Strategies · fit 3
*aka / source:* #algorithms; apply algorithmic strategies to real-world problems
- **What it is**: Apply algorithmic thinking (explicit steps, inputs/outputs, complexity) to real-world problems. It is a foundational-concept example named in the book.
- **Use in the process**: Standardize repetitive decisions into an executable step-by-step procedure (decision algorithm/checklist), reducing on-the-spot subjectivity and omissions.
- **Questions to ask**: Ask "Can this decision be written as explicit steps others can execute?" "What is the worst-case cost (complexity)?"
- **Engineering**: A core skill; extend it to make operational processes (refund review, risk control) algorithmic and automatable.
- **Product**: Abstract a manual-judgment process (e.g. product review) into a rule engine / decision table to improve consistency and scalability.
- **Ops**: Design a repeatable analysis pipeline and alerting rules rather than doing it by hand each time.
- **Strategy**: Standardize the expansion process (a new-market entry playbook) so it is replicable like an algorithm.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html, https://academic.oup.com/mit-press-scholarship-online/book/17355/chapter-abstract/174828729

### #simulation — Simulation Modeling · fit 3
*aka / source:* #simulation
- **What it is**: Build and interpret simulation models to observe a system's behavior under different inputs/constraints when direct experimentation isn't possible.
- **Use in the process**: Before a high-stakes decision, use simulation / scenario play-through (Monte Carlo, what-if) to explore the distribution of outcomes rather than a single point forecast.
- **Questions to ask**: Ask "What does the distribution of outcomes look like under different assumptions?" "Which input is the outcome most sensitive to?" "How likely is the worst-case scenario?"
- **Engineering**: Simulate failures with load testing / chaos engineering; do capacity planning with traffic simulation rather than linear extrapolation.
- **Product**: Before launch, simulate peak (Double 11) traffic and behavior paths to validate the system and the funnel.
- **Ops**: Use Monte Carlo to simulate the distribution of inventory, cash flow, and LTV under uncertain parameters.
- **Strategy**: Use scenario simulation (optimistic/base/pessimistic) to assess a strategy's resilience under different market conditions.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #modeltypes — Types of Models · fit 3
*aka / source:* #modelTypes; recognize how models explain & predict
- **What it is**: Recognize how different kinds of model (conceptual, physical, mathematical, simulation) explain data and generate new predictions, and a model's limits of applicability.
- **Use in the process**: When a model aids a decision, be explicit about its assumptions and scope; don't treat a simplified model as truth — "all models are wrong, but some are useful."
- **Questions to ask**: Ask "What does this model assume?" "Beyond what range does it break down?" "Can its predictions be validated?"
- **Engineering**: When estimating system behavior with a simplified model (queueing theory for latency), be clear about its assumptions; watch ML models break down after distribution drift.
- **Product**: Use growth/retention models as decision aids, recalibrating them with real data periodically to avoid over-trusting them.
- **Ops**: After a predictive model goes live, monitor its deviation from reality and recognize when the model no longer applies.
- **Strategy**: A business model (unit economics, funnel model) is a simplified map — use it to communicate and decide, but don't let it replace a reality check.
- **2026**: An LLM is itself a kind of model; understanding its assumptions and failure boundaries is essential to using AI responsibly in decisions.
- Sources: https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #dataviz — Data Visualization · fit 3
*aka / source:* #dataViz; interpret, analyze, and create data visualizations
- **What it is**: Interpret, analyze, and create data visualizations so that data supports (rather than misleads) decisions.
- **Use in the process**: Present the key trade-offs in a decision meeting with the right chart, while also being able to see through misleading charts (truncated axes, dual axes, cherry-picking).
- **Questions to ask**: Ask "What is this chart trying to make me believe — are the axes honest?" "Is there a presentation that reveals the truth better?" "What has been omitted?"
- **Engineering**: Design monitoring dashboards on perceptual principles (#communicationdesign) so anomalies are visible at a glance; avoid misleading y-axes.
- **Product**: Present feature performance to stakeholders in clear visualizations to speed alignment and decisions.
- **Ops**: Design operational reports to avoid misleading; proactively label definitions and the baseline period; use the appropriate chart type to reveal the distribution rather than only the average.
- **Strategy**: Make the data in board/investor presentations honest and focused on the key narrative.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #emergentproperties — Emergent Properties · fit 3
*aka / source:* #emergentProperties
- **What it is**: Identify the emergent properties of complex systems — the whole exhibits behavior that none of its individual parts have.
- **Use in the process**: Anticipate system-level nonlinear, unintended consequences; don't assume "sum of parts' behaviors = whole's behavior"; intervene in complex systems in small steps and observe.
- **Questions to ask**: Ask "What new behavior emerges when the parts combine?" "Is there positive feedback that amplifies?" "What global pattern do local rules produce?"
- **Engineering**: Distributed systems' emergent behaviors (retry storms, cascading failure, thundering herd) cannot be inferred from a single service; design system-level protections (circuit breakers, backoff).
- **Product**: The network effects and crowd behavior of community/marketplace features (review-spamming, arbitrage) are emergent — anticipate them in design.
- **Ops**: Collective user behavior (flash buying, deal-hunters) emerges into patterns invisible at the individual level; monitor at the system level.
- **Strategy**: A platform ecosystem's emergent dynamics (two-sided network effects, winner-take-all) dominate the long-run landscape.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #networks — Networks · fit 3
*aka / source:* #networks; primary/secondary effects in networks
- **What it is**: Identify the primary and secondary effects in a network and understand how nodes and links propagate influence.
- **Use in the process**: When assessing any intervention, trace beyond the direct (primary) effect to the secondary and tertiary effects and feedback loops that propagate through the network.
- **Questions to ask**: Ask "Who is directly affected, and who is affected next?" "Is there amplifying or canceling feedback?" "Where are the key nodes/bottlenecks?"
- **Engineering**: The cascading impact of one service's change across a service dependency graph; find the key nodes (single points of failure) and harden them; the secondary effects of a dependency upgrade.
- **Product**: The downstream secondary effects of changing a shared component/API; in multi-tenant, how a change to one setting propagates across the tenant network.
- **Ops**: Analyze the network propagation of referral/sharing behavior; find the high-influence merchant/user nodes.
- **Strategy**: A two-sided market's network effects: how adding supply attracts demand through the network (and vice versa).
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #thesis / #organization — Thesis & Organization · fit 3
*aka / source:* #thesis; #organization
- **What it is**: State a clear, defensible thesis and organize the communication structure effectively to support it.
- **Use in the process**: Lead any decision document with a one-sentence clear claim ("I recommend X, because Y"), then support it with structured argument (BLUF, the Pyramid Principle) so the decision-maker grasps the point fast.
- **Questions to ask**: Ask "What is my core claim in one sentence?" "The three strongest reasons supporting it?" "Can the reader grasp the conclusion in thirty seconds?"
- **Engineering**: Open an RFC/design doc BLUF-style with the conclusion and recommendation, then expand the argument; lead a PR description with "why."
- **Product**: Use a clear thesis and pyramid structure in a PRD/proposal so the decision-maker isn't left, after reading, unsure what you want approved.
- **Ops**: Lead an analysis report answer-first, giving the insight and recommendation up front with details appended.
- **Strategy**: Govern a strategy memo with a single clear claim (Amazon 6-pager style).
- **2026**: Echoes Amazon's "narrative memo" culture and BLUF writing; this structured-writing skill aligns with the clear-writing principles.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html

### #negotiate / #batna — Negotiation & BATNA · fit 3
*aka / source:* #negotiate; #batna; Best Alternative To a Negotiated Agreement
- **What it is**: Negotiate methodically: clarify interests and the agenda, and prepare a multi-dimensional BATNA (the best alternative if the negotiation fails). Minerva presents #negotiate as a representative HC.
- **Use in the process**: Before any negotiation/procurement/partnership, work out your own BATNA and the other side's, set your reservation point and target accordingly, and prepare tradeable concessions in priority order.
- **Questions to ask**: Ask "What is my best alternative if we don't reach agreement — and theirs?" "Which goals are negotiable and which aren't?" "Where do our interests overlap?"
- **Engineering**: When contracting with a third-party vendor / API provider, establish an alternative (a backup provider) as your BATNA to avoid lock-in.
- **Product**: Cross-team resource coordination is essentially negotiation; advance the roadmap with prepared alternatives and a staged concession strategy.
- **Ops**: Quantify each party's BATNA and concession cost with data to support procurement/contract negotiation decisions.
- **Strategy**: Channel, payment, and logistics partner negotiations all require establishing a BATNA first; platform take-rate negotiations likewise.
- **2026**: BATNA comes from Fisher & Ury's *Getting to Yes*, a classic negotiation decision framework.
- Sources: https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #ethicalframing — Ethical Framing · fit 3
*aka / source:* #ethicalFraming; identify ethical problems and frame for resolution
- **What it is**: Identify ethical problems and frame them with relevant ethical principles to enable systematic resolution. Minerva uses an employee-referral-bonus bias as an example.
- **Use in the process**: Build an ethics check into major decisions: identify potential ethical conflicts, compare across multiple ethical frameworks (consequentialism, deontology), and design a mechanism that aligns with ethics.
- **Questions to ask**: Ask "Whom might this decision treat unfairly or harm?" "Is there a design that induces improper behavior?" "Would it hold up if made public?"
- **Engineering**: Ethical stewardship of data privacy, dark patterns, and algorithmic fairness; the ethical and compliance responsibility of multi-tenant data isolation.
- **Product**: Design promotion/notification/subscription-cancellation flows to avoid dark patterns; respect the ethical limits of A/B testing (don't experiment on safety features).
- **Ops**: Informed consent and de-identification in data use; avoid using analytics to manipulate rather than serve users.
- **Strategy**: The fairness of platform policy (to merchants large and small) and take-rate transparency are ethical considerations that shape long-run trust.
- **2026**: In 2025–2026, AI ethics, algorithmic fairness, and data governance become required reading in product decisions; this HC provides a structured check.
- Sources: https://www.minerva.edu/public/media/enrollment-center/Minerva-HCs-Intro.pdf, https://eshmanager.blogspot.com/2024/12/blog-post.html

### #metaknowledge / #selfawareness — Metacognition & Self-awareness · fit 3
*aka / source:* #metaKnowledge; #selfAwareness; know what you don't know
- **What it is**: Monitor yourself to identify knowledge gaps (#metaknowledge), and recognize your own strengths and weaknesses while staying humble (#selfawareness).
- **Use in the process**: Before deciding, state explicitly your confidence level and knowledge blind spots; for low-confidence areas, proactively seek help/experts to avoid the Dunning-Kruger effect.
- **Questions to ask**: Ask "How confident am I in this judgment, and on what basis?" "Where are my blind spots / weaknesses?" "Who knows more than I do and should be asked?"
- **Engineering**: Honestly flag "I'm not familiar with this area" and find a reviewer; add an uncertainty buffer to estimates; admitting you don't know is cheaper than bluffing through.
- **Product**: PMs identify their own blind spots on technology/market and proactively pull the right people into the decision.
- **Ops**: Analysts label the confidence interval and assumption limits of an analysis, avoiding over-claiming.
- **Strategy**: A leader's self-awareness (knowing the team understands something better) is the foundation of a good decision culture.
- **2026**: AI tends to give answers over-confidently; human metacognition (knowing when not to trust the AI) is a key safety valve.
- Sources: https://eshmanager.blogspot.com/2024/12/blog-post.html
