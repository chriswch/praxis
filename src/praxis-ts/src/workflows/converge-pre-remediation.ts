import type { ConvergeStageName, RouteKind } from "../contracts/model.js";

export type ConvergeRuntimeStage = Exclude<ConvergeStageName, "objective-assessing">;

type ConvergeStageContract = {
  stage: ConvergeRuntimeStage;
  goal: string;
  required_inputs: string[];
  outputs: string[];
  done_when: string[];
};

type ConvergeStageTransition = {
  routeKind: RouteKind;
  nextStage: ConvergeRuntimeStage | null;
  reason: string;
};

const CONVERGE_STAGE_CONTRACTS: Record<ConvergeRuntimeStage, ConvergeStageContract> = {
  "clarifying-intent": {
    stage: "clarifying-intent",
    goal: "Clarify and persist an authoritative target spec for objective-driven remediation.",
    required_inputs: [".praxis/objective.md"],
    outputs: [".praxis/target-spec.md", ".praxis/results/clarifying-intent.json"],
    done_when: [
      "Target spec captures goal, scope, non-goals, constraints, and acceptance criteria.",
      "Stage result outcome is target_spec_ready or clarification_needed."
    ]
  },
  "assessing-gaps": {
    stage: "assessing-gaps",
    goal: "Assess implementation gaps against the active target spec and persist durable findings.",
    required_inputs: [".praxis/target-spec.md"],
    outputs: [".praxis/gap.md", ".praxis/gap.json", ".praxis/results/assessing-gaps.json"],
    done_when: [
      "Gap artifacts describe expected vs current behavior with evidence.",
      "Stage result outcome is findings_recorded or no_gaps."
    ]
  },
  "planning-remediation": {
    stage: "planning-remediation",
    goal: "Select bounded remediation slices from assessed findings and persist a remediation map.",
    required_inputs: [".praxis/gap.json"],
    outputs: [".praxis/remediation-map.md", ".praxis/remediation-map.json", ".praxis/results/planning-remediation.json"],
    done_when: [
      "Selected and deferred findings are explicit.",
      "Stage result outcome is remediation_map_ready or no_selection."
    ]
  }
};

const CONVERGE_STAGE_ROUTING: Record<ConvergeRuntimeStage, Record<string, ConvergeStageTransition>> = {
  "clarifying-intent": {
    target_spec_ready: {
      routeKind: "proceed",
      nextStage: "assessing-gaps",
      reason: "Target specification is ready for gap assessment."
    },
    clarification_needed: {
      routeKind: "ask_user",
      nextStage: "clarifying-intent",
      reason: "Objective clarification is required before assessment."
    }
  },
  "assessing-gaps": {
    findings_recorded: {
      routeKind: "proceed",
      nextStage: "planning-remediation",
      reason: "Gap findings are recorded and ready for planning."
    },
    no_gaps: {
      routeKind: "done",
      nextStage: null,
      reason: "No unresolved findings remain at the assessment stage."
    }
  },
  "planning-remediation": {
    remediation_map_ready: {
      routeKind: "proceed",
      nextStage: null,
      reason: "Remediation map is ready for bounded child execution."
    },
    no_selection: {
      routeKind: "ask_user",
      nextStage: "planning-remediation",
      reason: "No eligible findings were selected under current planning constraints."
    }
  }
};

export function getConvergeWorkflowStageContract(stage: ConvergeRuntimeStage): ConvergeStageContract {
  return CONVERGE_STAGE_CONTRACTS[stage];
}

export function resolveConvergeWorkflowTransition(
  stage: ConvergeRuntimeStage,
  outcomeCode: string
): ConvergeStageTransition {
  const transitions = CONVERGE_STAGE_ROUTING[stage];
  const transition = transitions[outcomeCode];
  if (!transition) {
    throw new Error(`Outcome ${outcomeCode} is not mapped for converge stage ${stage}.`);
  }
  return transition;
}

