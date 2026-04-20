import { ConvergeStageExecutorRegistry } from "../stage-executor.js";
import { AgentAssessingGapsExecutor } from "./assessing-gaps-executor.js";
import { AgentClarifyingIntentExecutor } from "./clarifying-intent-executor.js";
import { buildFixtureConvergeExecutorRegistry } from "./fixture-executors.js";
import { PlanningRemediationExecutor } from "./planning-executor.js";

// Default wiring. agent-backed executors for clarifying-intent and
// assessing-gaps; in-process planner for planning-remediation. Swapping any of
// them is a registration change — no campaign-service edit required.
//
// The `PRAXIS_CONVERGE_FIXTURE_EXECUTORS=1` env var swaps the full registry
// for the deterministic fixture registry. This is how smoke tests exercise the
// orchestration plumbing without a real adapter binary.
export function buildDefaultConvergeExecutorRegistry(): ConvergeStageExecutorRegistry {
  if (process.env.PRAXIS_CONVERGE_FIXTURE_EXECUTORS === "1") {
    return buildFixtureConvergeExecutorRegistry();
  }
  return new ConvergeStageExecutorRegistry()
    .register(new AgentClarifyingIntentExecutor())
    .register(new AgentAssessingGapsExecutor())
    .register(new PlanningRemediationExecutor());
}

export { AgentAssessingGapsExecutor } from "./assessing-gaps-executor.js";
export { AgentClarifyingIntentExecutor } from "./clarifying-intent-executor.js";
export { PlanningRemediationExecutor } from "./planning-executor.js";
export {
  FixtureAssessingGapsExecutor,
  FixtureClarifyingIntentExecutor,
  buildFixtureConvergeExecutorRegistry,
} from "./fixture-executors.js";
