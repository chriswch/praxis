import { isConvergeStageName, type ConvergeStageName, type RouteKind } from "../contracts/model.js";
import { resolveWorkflowOutcome } from "./graph.js";
import {
  expectedContractOutputArtifacts,
  expectedInputArtifactsForStage,
} from "./stage-artifacts.js";

type ConvergeStageContract = {
  stage: ConvergeStageName;
  goal: string;
  required_inputs: string[];
  outputs: string[];
  done_when: string[];
};

type ConvergeStageTransition = {
  routeKind: RouteKind;
  nextStage: ConvergeStageName | null;
  reason: string;
};

const CONVERGE_WORKFLOW = "converge-pre-remediation" as const;
const CONVERGE_ARTIFACT_DIR = ".praxis";

const CONVERGE_STAGE_GOALS: Record<ConvergeStageName, string> = {
  "clarifying-intent":
    "Clarify and persist an authoritative target spec for objective-driven remediation.",
  "assessing-gaps":
    "Assess implementation gaps against the active target spec and persist durable findings.",
  "planning-remediation":
    "Select bounded remediation slices from assessed findings and persist a remediation map.",
};

const CONVERGE_STAGE_DONE_WHEN: Record<ConvergeStageName, string[]> = {
  "clarifying-intent": [
    "Target spec captures goal, scope, non-goals, constraints, and acceptance criteria.",
    "Clarification decisions and approval status are persisted as durable artifacts.",
  ],
  "assessing-gaps": [
    "Gap artifacts describe expected vs current behavior with evidence.",
    "Stage result outcome is findings_recorded or no_gaps.",
  ],
  "planning-remediation": [
    "Selected and deferred findings are explicit.",
    "Stage result outcome is remediation_map_ready or no_selection.",
  ],
};

const CONVERGE_ROUTING_REASONS: Record<ConvergeStageName, Record<string, string>> = {
  "clarifying-intent": {
    target_spec_ready: "Target specification is ready for gap assessment.",
    clarification_needed: "Objective clarification is required before assessment.",
  },
  "assessing-gaps": {
    findings_recorded: "Gap findings are recorded and ready for planning.",
    no_gaps: "No unresolved findings remain at the assessment stage.",
  },
  "planning-remediation": {
    remediation_map_ready: "Remediation map is ready for bounded child execution.",
    no_selection: "No eligible findings were selected under current planning constraints.",
  },
};

export function getConvergeWorkflowStageContract(stage: ConvergeStageName): ConvergeStageContract {
  return {
    stage,
    goal: CONVERGE_STAGE_GOALS[stage],
    required_inputs: expectedInputArtifactsForStage(
      stage,
      CONVERGE_ARTIFACT_DIR,
      [".praxis/objective.md"],
      CONVERGE_WORKFLOW,
    ),
    outputs: expectedContractOutputArtifacts(stage, CONVERGE_ARTIFACT_DIR, CONVERGE_WORKFLOW),
    done_when: CONVERGE_STAGE_DONE_WHEN[stage],
  };
}

export function resolveConvergeWorkflowTransition(
  stage: ConvergeStageName,
  outcomeCode: string,
): ConvergeStageTransition {
  const transition = resolveWorkflowOutcome(CONVERGE_WORKFLOW, stage, outcomeCode);
  const reason = CONVERGE_ROUTING_REASONS[stage][outcomeCode];
  if (!reason) {
    throw new Error(`Outcome ${outcomeCode} is not mapped for converge stage ${stage}.`);
  }

  if (!isConvergeStageName(transition.nextStage)) {
    throw new Error(
      `Converge workflow produced an out-of-scope next stage ${transition.nextStage} from ${stage}/${outcomeCode}.`,
    );
  }

  return {
    routeKind: transition.routeKind,
    nextStage: transition.nextStage,
    reason,
  };
}
