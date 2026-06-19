> Decision-Science Method Catalog · B. Mental-model latticework (general thinking) · 20 methods. Legend: engineering / product / ops / strategy = four-axis application; fit = fit with software/SaaS (3–5).

### Latticework of Mental Models · fit 5
*aka / source:* Munger's Latticework / Worldly Wisdom / failure mode: man-with-a-hammer syndrome
- **What it is**: Munger argues against relying on a single discipline. Instead, build a stock of reusable models drawn from many fields (psychology, mathematics, engineering, physics, biology, economics) that interlock in your mind like a lattice; when you hit a problem, cross-check it through several models so no single viewpoint blinds you.
- **Use in the process**: Treat it as a meta-process. Before any consequential decision, deliberately run the situation through at least 3–4 models from different disciplines (e.g. incentives, second-order effects, inversion, probabilistic thinking) before concluding, rather than reaching for the one you know best. Maintain your own model list as a checklist.
- **Questions to ask**: "Am I using only one model right now (the man with a hammer seeing only nails)?" "How would an engineer / a psychologist / an economist see this?" "Which models would contradict each other in this situation?"
- **Engineering**: When triaging a production incident, don't reach only for the "code bug" hammer: simultaneously run incentives (whose KPI forced this to be rushed), second-order (what will this hotfix trigger next), and margin of safety (how much capacity buffer remains). Cross-checking keeps you from misdiagnosing root cause.
- **Product**: When evaluating a new feature, apply opportunity cost (the value of what you won't build), network effects (will it compound), and circle of competence (does the team actually understand this domain) together, rather than acting on "a customer asked for it" alone.
- **Ops**: When a metric looks anomalous, combine probabilistic thinking (noise or signal), base rate (how common is a swing this size historically), and Hanlon's razor (broken instrumentation rather than a real conversion collapse), to avoid single-cause attribution.
- **Strategy**: When setting plan/pricing strategy for a multi-tenant SaaS, lay out psychology (commitment, social proof), economics (opportunity cost, leverage), and game theory (competitor response) side by side, reducing the strategic miscalls a single framework would produce.
- **2026**: Especially valuable in the AI era — an LLM can quickly produce a single-viewpoint answer but readily falls into the one-hammer trap; the human's differentiating value is deliberately switching between multiple models to stress-test the AI's output.
- Sources: https://fs.blog/mental-models/, https://www.modelthinkers.com/mental-model/mungers-latticework, https://fs.blog/great-talks/psychology-human-misjudgment/

### The Psychology of Human Misjudgment · fit 5
*aka / source:* Munger's 25 Standard Causes of Human Misjudgment / lollapalooza effect (stacked biases)
- **What it is**: In his 1995 Harvard talk Munger catalogued roughly 25 predictable human psychological tendencies (incentive-caused bias, commitment and consistency, social proof, availability bias, envy, overconfidence, and more); when several tendencies push the same direction they compound into a "lollapalooza" effect — the result is multiplicative, not additive.
- **Use in the process**: Use the 25 tendencies as a checklist for debugging your own and your team's judgment. Before deciding, ask "which biases are pushing me right now?" — paying special attention to incentive-caused bias and commitment-and-consistency, the two most common.
- **Questions to ask**: "Is my judgment distorted by the incentives of a bonus / KPI (incentive-caused bias)?" "Am I defending this architecture because it's genuinely good, or because I publicly committed to it (commitment and consistency)?" "Everyone does it this way — is that actually right, or just social proof?"
- **Engineering**: Sunk cost plus commitment bias makes people cling to a refactor that took three months but went off the rails; this model helps you admit sooner that it should be cut and restarted. In code review, social proof (a senior engineer approved it, so I LGTM) lets real problems through.
- **Product**: Incentive-caused bias: if sales bonuses only reward signed deals, reps push custom promises that wreck the product; design incentives and roadmap processes with this in mind. Availability bias: the feature the latest large customer shouted about isn't necessarily the one most worth building.
- **Ops**: Confirmation bias makes you seek only data that supports your existing hypothesis; before analyzing an A/B test, write down "what result would falsify me." Over-optimism leads people to overestimate a new feature's retention lift.
- **Strategy**: Envy and the tendency to compare drive blind feature parity with competitors ("they have it, so we need it"); use this model to block the feature arms race and return to your own north star.
- **2026**: Munger died in late 2023 (aged 99), and this talk is regarded as his most original intellectual contribution; it continued to be widely cited across tech and investing through 2024–2026. It is especially practical for PMs and engineering leads, because most bad decisions come from people, not technology.
- Sources: https://fs.blog/great-talks/psychology-human-misjudgment/, https://www.sloww.co/psychology-human-misjudgment-charlie-munger/, https://jamesclear.com/great-speeches/psychology-of-human-misjudgment-by-charlie-munger

### Circle of Competence · fit 5
*aka / source:* Circle of Competence / used often by Munger & Buffett; The Great Mental Models Vol 1
- **What it is**: Everyone has a domain of knowledge they can reliably command. The size of the circle isn't the point; knowing its boundary is. When ego rather than competence drives action, blind spots appear. Inside your circle you have an edge; outside it you are fragile.
- **Use in the process**: Before deciding, honestly mark "is this inside or outside my circle." For decisions outside it, deliberately bring in experts, lower the stakes, or explicitly label it high-uncertainty — rather than pretending to know.
- **Questions to ask**: "Do I genuinely understand this domain, or do I just appear to?" "Where is the boundary of my circle — have I stepped outside it?" "Whose circle covers this, and should I bring them in?"
- **Engineering**: Don't force your way through unfamiliar domains (e.g. payment settlement, cryptography, tax calculation); for these out-of-circle areas, get expert review or use mature libraries rather than reinventing the wheel. Know exactly which parts of the codebase you truly understand.
- **Product**: The team's circle of competence decides whether to build, buy, or integrate an API. If e-commerce logistics, invoicing, or payments fall outside the team's circle, prefer integrating existing services (matching the complexity of the payment/shipping configuration noted earlier).
- **Ops**: Acknowledge the boundary of your competence on statistical significance and causal inference; complex attribution analysis should pull in a data-science colleague rather than being read by intuition.
- **Strategy**: The company's circle of competence sets the credible strategic bets; don't cross into a domain you don't understand just because the market is hot (e.g. rashly entering a cross-border / overseas market you don't know) — widen the circle first, then bet.
- **2026**: An extended application — build a "circle of competence about AI": know precisely which tasks an LLM is reliable for and which it hallucinates on, which is the same as applying circle of competence to your tools.
- Sources: https://fs.blog/mental-models/, https://www.sloww.co/great-mental-models-volume-1/

### First Principles Thinking · fit 5
*aka / source:* First Principles / from Aristotle, popularized by Elon Musk; The Great Mental Models Vol 1
- **What it is**: Decompose a complex problem to its most basic, no-longer-questionable truths (the fundamental facts), strip away analogy and inherited assumptions, then rebuild your understanding from the ground up. This is the innovator's method, because most people only do incremental improvement.
- **Use in the process**: When "everyone does it this way" or "we've always done it this way" is the only justification, stop and ask: with convention stripped away, what is the real physical / economic / technical constraint? Rebuild the solution from there.
- **Questions to ask**: "Is this constraint a real physical/legal limit, or just historical baggage / how others do it?" "If I started from scratch today, how would I design this?" "Which assumptions have actually never been validated?"
- **Engineering**: For performance work, don't just copy the "add a cache" analogy; decompose to first principles — is this query slow because of N+1, a missing index, or the wrong data model? (Matching the project rule: N+1 is a critical issue.) Redesign rather than patch.
- **Product**: Don't merely copy a competitor's checkout flow; return to first principles — what is the minimal set of steps genuinely required for a user to complete a purchase? Redesign checkout from that, rather than piling on more fields.
- **Ops**: Don't blindly apply an industry benchmark (analogy); first ask what the fundamental drivers of this product's retention/conversion are, and build your own metric model.
- **Strategy**: Don't price by simply matching competitor discounts (analogy); decompose to first principles — the marginal cost of each plan and the value the customer actually receives — and rebuild the pricing structure from there.
- **2026**: More critical with AI-assisted development: an LLM excels at producing "analogy-based solutions from existing patterns," and the engineer's differentiating value is using first principles to judge whether to adopt them and to reframe the problem itself.
- Sources: https://fs.blog/mental-models/, https://www.sloww.co/great-mental-models-volume-1/, https://readingraphics.com/book-summary-the-great-mental-models-general-thinking-concepts/

### Second-Order Thinking · fit 5
*aka / source:* Second-Order Thinking / 'And then what?' / used often by Howard Marks; The Great Mental Models Vol 1
- **What it is**: Look beyond a decision's immediate (first-order) results and keep asking "and then what?" to trace the downstream chain reactions and long-term effects, like a chess player thinking several moves ahead.
- **Use in the process**: For each option, project at least two or three orders of consequence, paying special attention to choices that "look good short-term, harmful long-term"; write the chain reactions down before deciding.
- **Questions to ask**: "What happens at the next step, and the step after that?" "Will the short-term benefit create long-term debt?" "Who will change their behavior because of this, and what does that in turn affect?"
- **Engineering**: Adding a convenient global switch or feature flag (first order: ship fast); second order: the flag lingers permanently and becomes technical debt, the combinatorial explosion makes it hard to test; third order: nobody dares remove it. Every coupling decision deserves second-order projection. The rollback of devolving an EC feature is destructive — think the reverse consequences through before shipping.
- **Product**: Heavily customizing to retain one large merchant (first order: keep the customer); second order: other merchants want it too, it becomes a maintenance nightmare, and it slows down general features. Customization decisions in multi-tenant SaaS demand second-order thinking.
- **Ops**: Changing the UI to push one metric (first order: that metric rises); second order: it squeezes another key metric (e.g. driving clicks but hurting retention). Always pair the metric you move with guardrail metrics.
- **Strategy**: Cutting prices to grab market share (first order: more users); second order: competitors follow, margins collapse, the brand anchors on low prices, and raising prices later becomes hard. Long-term chain reactions in strategic decisions are where this model matters most.
- **2026**: Highly related to systems thinking and feedback loops; under the rapid-ship cadence of AI development through 2025–2026, second-order thinking is needed even more to offset the long-term cost of "piling on features fast."
- Sources: https://fs.blog/mental-models/, https://www.sloww.co/great-mental-models-volume-1/

### Probabilistic Thinking · fit 5
*aka / source:* Probabilistic Thinking (incl. Bayesian thinking, fat-tailed curves, asymmetries); The Great Mental Models Vol 1
- **What it is**: Use mathematics and logic to estimate the likelihood of various outcomes, producing realistic probability estimates under incomplete information. Farnam Street breaks it into three parts: Bayesian thinking (update with new information), fat-tailed curves (distributions where extreme events have no upper bound), and asymmetries (estimation itself carries systematic bias, usually toward optimism).
- **Use in the process**: State judgments as probabilities rather than binaries ("I think there's a 70% chance…") and flag uncertainty; for fat-tailed risks (rare but catastrophic), hold extra margin.
- **Questions to ask**: "About how likely is this, and on what basis?" "Is this a normal distribution or fat-tailed (rare but fatal)?" "Is my estimate skewed optimistic again (asymmetry)?"
- **Engineering**: Estimate effort and plan capacity with probability ranges rather than single points; system failures are fat-tailed — fine 99% of the time, but the 1% cascade can take down all tenants, so design degradation and isolation (bulkheads) for fat-tail events.
- **Product**: Apply probabilistic thinking to feature impact: not "will it succeed," but rank the roadmap by expected value (probability of success × impact); acknowledge that lift estimates for most new features run optimistic.
- **Ops**: An A/B test is fundamentally probabilistic inference; a win on a small sample may be pure noise. Report conversion rates with confidence intervals, not a single number masquerading as certainty.
- **Strategy**: Evaluate market entry and big bets with expected value and probability distributions, not "we'll definitely win"; fat-tail thinking is a reminder that black swans (a security incident, a platform-policy change) are rare but can be life-or-death.
- **2026**: Complements Annie Duke's *Thinking in Bets* and Taleb's fat-tail ideas; in AI prediction and risk assessment through 2025–2026, understanding that LLM output is fundamentally a probability distribution (not a deterministic answer) is a key mental model.
- Sources: https://fs.blog/probabilistic-thinking/, https://www.sloww.co/great-mental-models-volume-1/

### Inversion · fit 5
*aka / source:* Inversion / 'Invert, always invert' (Carl Jacobi: man muss immer umkehren); The Great Mental Models Vol 1; Super Thinking #1 Inverse Thinking
- **What it is**: Rather than asking "how do I succeed," flip it and ask "what would guarantee failure," then avoid it. Rooted in the mathematician Jacobi; Munger's line: a long-term edge comes more from "consistently not being stupid" than from trying to be brilliant. Avoiding bad outcomes is often easier than engineering good ones.
- **Use in the process**: Run a "pre-mortem" on any goal: assume the project has already failed utterly, work backward to the causes, then eliminate each failure factor one by one — not merely list the success steps forward.
- **Questions to ask**: "What would make this project / system fail completely?" "What would I have to do to wreck it? — then avoid that." "What is the dumbest mistake I most need to avoid?"
- **Engineering**: When designing a new service, do failure-mode analysis first (ask "how could this go down"): DB down, third-party API timeout, tenant data leakage — list these failure modes before designing safeguards. When writing tests, prioritize covering "inputs that would crash the system."
- **Product**: When designing onboarding, ask in reverse "what would make a new merchant give up" (too many required fields, waiting for approval, can't find the next step), and remove that friction — more effective than directly imagining "how to make them fall in love with it."
- **Ops**: In retention analysis, work backward to find "common behaviors before churn" (what they did in the 7 days before churning) and remove those triggers, rather than only watching highly retained users.
- **Strategy**: Use inversion in strategic planning: "what would put us out of business / get us replaced in three years?" (collapse of security trust, platform dependence, concentration on a single large customer), and prioritize accordingly, rather than only listing growth plans.
- **2026**: The pre-mortem is the engineered practice of inversion; in SRE/reliability engineering (chaos engineering, fault injection) it is a mainstream methodology through 2025–2026.
- Sources: https://fs.blog/inversion/, https://www.sloww.co/great-mental-models-volume-1/, https://www.sloww.co/super-thinking-book/

### Margin of Safety · fit 5
*aka / source:* Margin of Safety; from engineering and quality control, used by Benjamin Graham for investing; The Great Mental Models Vol 2; related Redundancy model
- **What it is**: A deliberately reserved buffer, slack, and redundancy in a system to absorb error or bad luck. Engineering example: a jet engine part rated for 10,000 hours is replaced at 7,500 hours; the difference is the margin of safety. Graham: leave a gap between value and price. Dodd's analogy: build a bridge to carry a 30,000-pound truck but only let 10,000-pound trucks cross.
- **Use in the process**: When deciding, ask "what if I'm wrong?" and reserve buffer; raise the margin of safety where uncertainty is high and consequences are severe, paying a little more upfront cost in exchange for survivability.
- **Questions to ask**: "If my assumptions are wrong, will the system still hold?" "Is the worst-case buffer enough?" "Am I pushing the system to its limit with no slack left?"
- **Engineering**: Don't size capacity to exactly meet peak; leave headroom (e.g. 30–50% buffer on CPU / connection pools / rate limits); setting timeouts, retries, circuit breakers, and multi-tenant resource isolation are all margins of safety. Matches the buffer concept in incident triage above.
- **Product**: Reserve buffer in scheduling (don't pack a sprint to 100%); ship major features via gradual rollout / feature flags as a margin of safety so you can roll back fast if something breaks.
- **Ops**: Set alert thresholds with a margin of safety (firing before an actual collapse) rather than learning only when a metric hits zero; forecast capacity with conservative (slack-reserving) rather than optimistic estimates.
- **Strategy**: Keep cash/headcount buffers in financial and resource planning to weather demand swings; have backups for dependence on a single large customer or a single payment provider, avoiding concentration risk with no margin of safety.
- **2026**: Interoperates with reliability engineering (an SLO error budget is essentially a quantified margin of safety) and the antifragile concept; highly recommended for engineers to internalize.
- Sources: https://fs.blog/mental-model-redundancy/, https://bestmentalmodels.com/2018/09/24/margin-of-safety/, https://www.redeyecapital.se/margin-of-safety

### Leverage · fit 5
*aka / source:* Leverage / High-Leverage Activities; Archimedes' law of the lever; Super Thinking; Naval Ravikant's four forms of leverage (capital, labor, code, media)
- **What it is**: Amplify output from the same input. Naval divides business leverage into capital and labor (both permissioned), and code and media (permissionless, with zero marginal cost to replicate). Code is the most powerful permissionless leverage — with just a computer, it works for you while you sleep.
- **Use in the process**: When deciding where to spend time, prefer high-leverage activities (invest once, return long-term / at scale) over linear labor; continually look for opportunities to add leverage at every step.
- **Questions to ask**: "Is this a one-off output, or can it be replicated / automated and amplified?" "Can I leverage this manual work with code / tooling?" "Where is the highest-leverage 20% of effort (per Pareto)?"
- **Engineering**: Writing a shared component/SDK reused by many teams, turning repetitive manual operations into automated scripts/platforms, and investing in CI and good tests are all high-leverage; code itself is the highest leverage — the same program serves every tenant. Prioritize platform work that amplifies the whole team's output.
- **Product**: Building general features shared by all merchants beats one-off customization (matching second-order thinking); self-serve onboarding is high-leverage (build it once, serve countless merchants) and far higher-leverage than manual onboarding.
- **Ops**: Building reusable dashboards / a metrics platform that the whole company can self-serve is higher-leverage than pulling reports by hand each time; one good analysis framework can be applied repeatedly.
- **Strategy**: Choose growth engines with leverage: the product itself (zero marginal cost), the ecosystem / app store, content / SEO — rather than relying purely on burning cash to buy traffic; code leverage is the core advantage of multi-tenant SaaS.
- **2026**: AI is a new form of leverage through 2025–2026: it amplifies individual output and is also permissionless; the productivity gap will widen for engineers who know how to use AI to automate low-leverage work.
- Sources: https://www.navalmanack.com/almanack-of-naval-ravikant/find-a-position-of-leverage, https://paulminors.com/blog/super-thinking-by-gabriel-weinberg-lauren-mccann-book-summary-pdf/, https://aydoo.services/en/articles/naval-ravikant-leverage/

### Opportunity Cost · fit 5
*aka / source:* Opportunity Cost; Super Thinking; foundational economics model
- **What it is**: Every choice has a hidden cost — the value of the best alternative you forgo. Doing A means giving up B; the true cost isn't the money spent but the best other thing you couldn't do.
- **Use in the process**: When evaluating an option, don't just weigh its own cost/benefit; explicitly ask "by doing this, what is the best alternative I'm giving up?" and rank with that, rather than evaluating in isolation.
- **Questions to ask**: "By doing this, what is the most valuable other thing I'm giving up?" "Is this the best use of the time/resources I can invest right now?"
- **Engineering**: When deciding whether to spend two weeks refactoring a module, the real cost is "the features those two weeks could have delivered"; the technical-debt trade-off is fundamentally an opportunity-cost judgment, not an absolute good/bad one.
- **Product**: The core of roadmap prioritization is opportunity cost: the cost of doing feature A is delaying B and C; each sprint's capacity is fixed, so adding one squeezes out another.
- **Ops**: Analysis resources have opportunity cost too: the time spent deep-diving a minor metric could have built monitoring for a higher-impact core metric; rank analysis work by ROI.
- **Strategy**: The true cost of entering a new market / launching a new product line is "the return those same resources would earn invested in the core product"; multi-tenant SaaS must be careful not to let edge bets dilute the core.
- **2026**: Use it together with leverage and north star: strong opportunity-cost awareness keeps the team focused on the highest-leverage work closest to the north star.
- Sources: https://paulminors.com/blog/super-thinking-by-gabriel-weinberg-lauren-mccann-book-summary-pdf/, https://www.lucapallotta.com/super-thinking-the-big/

### North Star · fit 5
*aka / source:* North Star / North Star Metric (popularized by Sean Ellis); Super Thinking
- **What it is**: A guiding vision for a company or individual; in *Super Thinking* it's the highest goal that all subsequent decisions align to. In product practice it evolved into the North Star Metric: the single metric that best captures the core value the product delivers to customers, focusing the team.
- **Use in the process**: Use the north star as a decision filter: for each proposal, ask "does this advance our north star?" Deprioritize or cut what doesn't align, to avoid being pulled apart by scattered requests.
- **Questions to ask**: "Does this move us closer to the north star?" "Does our north star metric truly represent the value customers receive?" "Is everyone's individual work aligned to the same north star?"
- **Engineering**: Align technical decisions to the product north star: if the north star is "merchants successfully complete fulfillment," engineering should prioritize reliability and performance of the fulfillment flow over self-indulgent rewrites. Use it to rank technical investment.
- **Product**: Define one North Star Metric for the product (e.g. an e-commerce SaaS might use "merchant monthly GMV" or "number of successfully shipped orders"), and tie every feature hypothesis back to it, to avoid building features that don't move core value.
- **Ops**: Build a framework of the north star metric + a set of input metrics (leading indicators features can directly influence) + guardrail metrics; analysis revolves around decomposing the north star.
- **Strategy**: The north star keeps the whole company (engineering, product, sales) moving in the same direction; multi-tenant platforms especially need it, to stop each plan / feature team from going their own way.
- **2026**: Still a core product topic through 2024–2026; Sean Ellis stresses the north star must use revenue correlation as a guardrail. Lenny Rachitsky and others continue to discuss the "single north star vs. multiple metrics" trade-off, warning against blindly chasing one number.
- Sources: https://www.lennysnewsletter.com/p/choosing-your-north-star-metric, https://www.productcompass.pm/p/the-north-star-framework-101, https://paulminors.com/blog/super-thinking-by-gabriel-weinberg-lauren-mccann-book-summary-pdf/

### Network Effects · fit 5
*aka / source:* Network Effects / Metcalfe's Law (a network's value is proportional to the square of its nodes, n²); Super Thinking #107
- **What it is**: A network's value grows with each new member added; Metcalfe's Law states value grows nonlinearly (roughly n²) with the number of connected nodes. Classic example: the fax machine — a single one is useless, and each additional one makes every existing one more valuable. It can create "the biggest gets bigger" positive feedback and a moat.
- **Use in the process**: When evaluating a product/feature, ask whether it has network-effect potential (more value as more people use it); if so, prioritize investment and accelerate expansion to build a hard-to-replicate moat.
- **Questions to ask**: "Does this product become more valuable to each person as more people use it?" "Is the network effect same-side or cross-side?" "Have we crossed critical mass and entered positive feedback?"
- **Engineering**: When designing an API/SDK/integration ecosystem, think about developer network effects: the more apps that integrate, the more valuable the platform is to merchants; architect for high connectivity and data consistency.
- **Product**: An e-commerce SaaS's app store, merchant community, and shared review/logistics networks may all carry network effects; when designing features, consider whether you can make "more merchants using it benefit each merchant more" (e.g. shared payment-rate negotiation, cross-store membership).
- **Ops**: Measure network-effect health: is the marginal value each new user brings rising; analyze cross-side conversion (how supply-side growth drives the demand side).
- **Strategy**: Network effects are one of SaaS's strongest moats; strategically prioritize building features with network effects, because they make it hard for later entrants to catch up (past critical mass, the biggest gets bigger).
- **2026**: a16z and others note Metcalfe's Law (n²) often overstates value, and real network effects depend more on connection quality and saturation; when evaluating through 2025–2026, don't look only at user counts — look at interaction density and retention.
- Sources: https://www.sloww.co/super-thinking-book/, https://a16z.com/beyond-metcalfes-law-for-network-effects/, https://productfolio.com/network-effects/

### Flywheel · fit 5
*aka / source:* Flywheel / Virtuous Cycle / Bezos's Amazon flywheel; Jim Collins *Good to Great*; Super Thinking #26
- **What it is**: A flywheel is a wheel that stores kinetic energy; the metaphor is that once it's spinning, little force is needed to keep it going. Bezos's Amazon flywheel (the 2001 napkin sketch): better customer experience → more traffic → more third-party sellers → more selection → economies of scale lower costs → lower prices → back to better experience, self-reinforcing.
- **Use in the process**: Identify and invest in the loops that form self-reinforcing cycles, not isolated one-off pushes; respect momentum — ride a healthy flywheel rather than forcing it from a standstill each time.
- **Questions to ask**: "What is our growth flywheel? Which loops drive each other?" "Will this investment feed the flywheel, or is it just a one-off push?" "Is a reverse (vicious) flywheel already turning?"
- **Engineering**: Build an engineering flywheel: good tests → confidence to deploy often → faster feedback → higher quality → more confidence to refactor; invest in infrastructure that self-reinforces development speed (CI, observability). Also watch for the vicious flywheel (technical debt → slower → more rushed → more debt).
- **Product**: Design a product flywheel: more merchants → more transaction data → better recommendations/curation → merchants more successful → attracts more merchants; for each new feature, assess which loop of the flywheel it accelerates.
- **Ops**: Break growth into metrics for each loop of the flywheel and monitor which loop is the current bottleneck (the slowest-turning one), concentrating resources to lubricate it.
- **Strategy**: The core of strategy is finding and turning your own flywheel rather than chasing scattered tactics; for e-commerce SaaS, customer success (merchants earning more) is often the flywheel's starting point. Network effects and critical mass are frequently the flywheel's engine.
- **2026**: The flywheel remains a mainstream growth narrative through 2025–2026 (replacing linear funnel thinking); combined with PLG (product-led growth), it stresses the self-reinforcing loop driven by the product itself.
- Sources: https://sketchplanations.com/virtuous-cycle, https://fourweekmba.com/amazon-flywheel/, https://www.sloww.co/super-thinking-book/

### The Map Is Not the Territory · fit 4
*aka / source:* Map ≠ Territory / from Alfred Korzybski; The Great Mental Models Vol 1
- **What it is**: Our models of the world are simplified representations, not the world itself. A map that perfectly matched the territory would be as large as the territory and lose its usefulness; and a map is a snapshot at a point in time — reality may already have changed.
- **Use in the process**: When deciding, remember the dashboards, docs, and ERDs in front of you are simplified models; periodically return to the "real territory" (actual users, production data, the production environment) to verify the model still holds.
- **Questions to ask**: "From what point in time is this metric / document a snapshot? Is it still accurate?" "What detail did this model abstract away, and do those details matter now?"
- **Engineering**: Architecture diagrams, ER diagrams, and docs often drift from the real system; when debugging a multi-tenant problem, don't trust the schema docs alone — actually run queries to see the production data distribution. A clean staging environment isn't the production territory.
- **Product**: User personas and user stories are the map; don't treat them as the real users. E-commerce merchants' actual workflows often differ from what the PM imagines, so do user research / session replay to return to the territory.
- **Ops**: A funnel chart is a model; real user paths are usually messier; there's a gap between the tracking definition (the map) and what users actually did (the territory) — validate instrumentation before analyzing.
- **Strategy**: Market reports and TAM estimates are maps; when setting multi-tenant pricing strategy, don't trust the spreadsheet alone — look at the actual usage behavior and willingness to pay of merchants on each plan.
- **2026**: Especially important in the AI era: LLM-generated summaries / architecture descriptions are "maps of maps," more prone to drifting from reality, so return to the source code and data to verify.
- Sources: https://fs.blog/mental-models/, https://www.sloww.co/great-mental-models-volume-1/

### Bayesian Updating · fit 4
*aka / source:* Bayes' Theorem / base rate / prior & posterior; The Great Mental Models Vol 1
- **What it is**: Given limited but useful prior knowledge, when new information arrives you should combine it with what you already know (the base rate) to update your belief. The prior is itself a probability estimate; evidence that challenges the prior merely lowers the probability it's true, gradually updating to a posterior — not an all-or-nothing flip.
- **Use in the process**: Before judging, ask the base rate (how this kind of situation usually plays out historically), then update proportionally with the current evidence; avoid being swept along by a single sensational data point while ignoring the base rate.
- **Questions to ask**: "What's the base rate for this kind of thing?" "How much should this new evidence shift my belief — rather than fully overturning or ignoring it?" "Am I ignoring the base rate and fixating on the case in front of me?"
- **Engineering**: When troubleshooting, use base rates: a given symptom is 80% connection-pool exhaustion, 15% network, 5% a code bug — check the high-probability cause first; when an alert fires, use Bayesian updating to adjust the probability of "real incident vs. false alarm."
- **Product**: When one merchant complains a feature is hard to use, don't immediately overhaul it; combine the base rate (what fraction of merchants have the same problem) to update your severity judgment, avoiding letting one loud customer dominate the roadmap.
- **Ops**: When you see "conversion crashed," first use the base rate (the historical range of fluctuation) to judge whether it's anomalous, then progressively use more dimensional data to update the posterior probability of "real drop vs. broken instrumentation."
- **Strategy**: When competitor moves and market signals arrive, don't overturn the whole strategy; incrementally update your beliefs about the market by the strength of evidence, avoiding overreaction to a single event.
- **2026**: It's the engine of probabilistic thinking; through 2025–2026 it's also the underlying concept for understanding ML/recommendation systems and the statistics engines of A/B platforms — engineers who understand Bayes read experiment results better.
- Sources: https://fs.blog/bayes-theorem/, https://www.sloww.co/great-mental-models-volume-1/

### Occam's Razor · fit 4
*aka / source:* Occam's Razor / Law of Parsimony; The Great Mental Models Vol 2; Super Thinking #117
- **What it is**: When several competing explanations fit the evidence equally well, the one with the fewest, simplest assumptions is usually the most likely correct; prefer the simple explanation until a more complex one is shown to be needed (but the truth is sometimes genuinely complex, so don't apply it dogmatically).
- **Use in the process**: When facing a problem, list the simplest possible causes and verify them first, rather than jumping straight to elaborate conspiracy-style explanations.
- **Questions to ask**: "What's the simplest explanation with the fewest assumptions?" "Am I overcomplicating this?" "Is there a more mundane cause I skipped over?"
- **Engineering**: When debugging, check the simplest causes first: did you forget to deploy, is an environment variable wrong, was a cache not cleared — rather than suspecting a deep race condition from the start. The simplest design that passes all tests is usually the most maintainable.
- **Product**: The simplest explanation for users "not using a feature" is often "they can't find it / don't know it exists," not "the need doesn't exist"; validate discoverability before reaching complex conclusions.
- **Ops**: For a metric anomaly, check the most mundane explanations first: instrumentation changed, a big customer imported data, a holiday effect — rather than immediately building a complex attribution model.
- **Strategy**: Facing a revenue decline, validate simple factors first (seasonality, loss of a single large customer) before invoking complex narratives about macro market-structure shifts.
- **2026**: In engineering it maps to the KISS principle and "minimum viable design"; facing AI-generated complex solutions, Occam is a reminder to prefer understandable, maintainable, simple answers.
- Sources: https://fs.blog/mental-models/, https://www.sloww.co/super-thinking-book/

### Critical Mass · fit 4
*aka / source:* Critical Mass; from nuclear physics (the mass of fissile material needed to trigger a chain reaction); Super Thinking #29
- **What it is**: Borrowed from nuclear physics: the minimum mass needed to trigger a self-sustaining chain reaction. The metaphor is that a system (product, community, change) must reach a threshold before it can sustain itself and grow spontaneously; below the threshold it needs continuous external force.
- **Use in the process**: Before driving anything that needs to self-reinforce (a platform, community, organizational change), first estimate where critical mass is and design how to concentrate resources to "ignite" past the threshold, rather than spreading resources evenly.
- **Questions to ask**: "How many users / how much activity does this need to become self-sustaining?" "How far are we from critical mass?" "How should we concentrate firepower to ignite one segment first, rather than rolling out broadly?"
- **Engineering**: Adoption of an internal platform/tool also needs critical mass: a new framework or shared service self-propagates only after enough teams adopt it; when pushing internal tooling, find early-adopter teams to ignite it first.
- **Product**: A two-sided market (an e-commerce platform connecting merchants and buyers, or an app store connecting developers) only takes off after reaching critical mass on both supply and demand sides; design a cold-start strategy (subsidize one side first).
- **Ops**: When analyzing growth curves, identify the "inflection point" — past critical mass, growth shifts from linear to exponential; monitor whether you're nearing the threshold to decide when to scale up investment.
- **Strategy**: Concentrate new feature / new market rollout on a single vertical or region to reach critical mass first, prove the flywheel can turn, then replicate and expand; consistent with the gradual strategy of devolving an EC feature to designated plans.
- **2026**: Tightly linked with network effects and flywheel; the three together often form the core narrative of a growth strategy.
- Sources: https://www.sloww.co/super-thinking-book/, https://paulminors.com/blog/super-thinking-by-gabriel-weinberg-lauren-mccann-book-summary-pdf/

### Lindy Effect · fit 4
*aka / source:* Lindy Effect; proposed by Mandelbrot, popularized by Taleb *Antifragile*; Super Thinking #78
- **What it is**: For non-perishable things (technologies, ideas, books, organizations), expected remaining life is proportional to how long they've already existed — the longer something has lasted, the longer it's expected to last further. Taleb's example: a book in print for 40 years can be expected to remain in print another 40; if it survives 10 more, its expected remaining life becomes 50.
- **Use in the process**: When choosing technologies/methods/standards to depend on, prefer those that have already survived a long time (they've passed the test of time), and stay skeptical of the very new and shiny (unproven).
- **Questions to ask**: "How long has this technology/framework existed? Is it time-tested, or this year's fad?" "Am I betting on something Lindy (long-lived), or something that will go obsolete fast?"
- **Engineering**: When choosing a tech stack, Lindy favors mature, reliable ones: SQL, HTTP, the Unix philosophy, and relational databases have survived decades and will likely persist; stay skeptical of the trendiest frameworks / JS toolchains, using Lindy tech for core systems and experimenting only at the edges.
- **Product**: Solving users' fundamental needs (payment, trust, convenience) is Lindy; flashy UI trends go obsolete. Bet the product core on long-lived needs.
- **Ops**: Long-validated core metrics (revenue, retention, GMV) are more reliable than each quarter's trendy vanity metric; choose analysis frameworks that stand the test of time.
- **Strategy**: Bet on long-lived business models and standards; calibrate "the new paradigm will disrupt everything" narratives with Lindy — many old things are more durable than imagined (e.g. email and Excel still dominate business).
- **2026**: Especially useful amid the AI hype through 2025–2026: use Lindy to distinguish which are fundamental changes that will stay and which are overheated hype; mature, boring but durable technology is often the safer engineering bet.
- Sources: https://en.wikipedia.org/wiki/Lindy_effect, https://www.sloww.co/super-thinking-book/, https://modelthinkers.com/mental-model/the-lindy-effect

### Via Negativa · fit 4
*aka / source:* Via Negativa / Subtractive Knowledge / Addition by Subtraction; Taleb *Antifragile*; also cited often by Naval
- **What it is**: Improvement often comes from removing what's harmful or unnecessary, not from adding. Taleb: negative knowledge (knowing what's wrong, what doesn't work) is more robust and less error-prone than positive knowledge; knowledge grows more by subtraction than addition. Ask "what should I remove" rather than "what should I add."
- **Use in the process**: When improving a system/process/life, first look for what can be removed or stopped (lowering downside risk, removing sources of fragility), rather than relentlessly adding new features or process.
- **Questions to ask**: "Rather than adding something, what should I remove / stop?" "What is making the system fragile that I should remove first?" "Am I more certain about what's wrong than about what's right?"
- **Engineering**: Improving reliability often comes from subtraction: delete unused feature flags, remove dead code, cut rarely-used but high-risk integrations, reduce dependencies — more effective than continually adding safeguards. Reducing complexity is itself the biggest improvement (matching Occam).
- **Product**: Products improve more often by removing: cut settings merchants don't use but that add cognitive load; simplify onboarding steps. Via negativa fights feature bloat.
- **Ops**: Dashboards and alerts improve by subtraction: remove metrics no one looks at and noisy fatigue-inducing alerts, so the signals that truly matter surface.
- **Strategy**: Strategically, "what not to do" matters as much as "what to do": explicitly decline markets/customizations/features that don't align with the north star, and focus on the core; reduce downside risk (security, compliance, single-point dependence) before talking about expansion.
- **2026**: Complements antifragile and margin of safety (all address the downside first); through 2025–2026, "subtraction" is the counter-discipline against the code/feature bloat that AI accelerates.
- Sources: https://www.wealest.com/articles/via-negativa, https://rationalwalk.com/via-negativa-wisdom-through-subtraction/, https://medium.com/the-quiet-footnote/antifragile-by-nassim-nicholas-taleb-how-to-thrive-in-chaos-b3b5e98177f0

### Hanlon's Razor · fit 3
*aka / source:* Hanlon's Razor; The Great Mental Models Vol 2; Super Thinking #118
- **What it is**: "Never attribute to malice that which is adequately explained by stupidity / carelessness." Most seemingly malicious behavior is actually caused by incompetence, error, or bias, not deliberate harm.
- **Use in the process**: When encountering someone's negative behavior, first assume it's a mistake or a communication gap rather than intentional, lowering the emotional reaction and putting energy into solving the problem rather than assigning blame.
- **Questions to ask**: "Was this really deliberate, or just carelessness / a missed communication / a misunderstanding?" "Is assuming malice making me overreact?"
- **Engineering**: When a colleague merges in a destructive change, first assume they didn't notice the side effects rather than deliberately broke things; adopt a blameless-postmortem culture in incident review, consistent with Hanlon's razor.
- **Product**: When a merchant leaves a harsh review / files an aggressively worded complaint, first assume they're frustrated by a bug rather than maliciously nitpicking; design empathetic support and error messages accordingly.
- **Ops**: For data anomalies, first assume an upstream system failure or an instrumentation oversight rather than "someone is gaming the numbers," avoiding a conspiracy-tinted reading.
- **Strategy**: For a move by a competitor or partner platform, first assume internal disorganization / silos rather than a precise calculation aimed at you, avoiding overly defensive decisions.
- **2026**: More useful when collaborating with remote / cross-timezone teams and AI: many conflicts arise from gaps in asynchronous communication rather than malice — use Hanlon's razor to cool down first.
- Sources: https://fs.blog/mental-models/, https://www.sloww.co/super-thinking-book/
