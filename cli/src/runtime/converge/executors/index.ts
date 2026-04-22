import { ConvergeStageExecutorRegistry } from "../stage-executor.js";
import { AgentAssessingGapsExecutor } from "./assessing-gaps-executor.js";
import { AgentClarifyingIntentExecutor } from "./clarifying-intent-executor.js";
import { buildFixtureConvergeExecutorRegistry } from "./fixture-executors.js";

// Default wiring. Agent-backed executors for clarifying-intent and
// assessing-gaps. Planning-remediation is dispatched in-process by
// ConvergePassService and is not registered here.
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
    .register(new AgentAssessingGapsExecutor());
}

export { AgentAssessingGapsExecutor } from "./assessing-gaps-executor.js";
export { AgentClarifyingIntentExecutor } from "./clarifying-intent-executor.js";
export {
  FixtureAssessingGapsExecutor,
  FixtureClarifyingIntentExecutor,
  buildFixtureConvergeExecutorRegistry,
} from "./fixture-executors.js";
