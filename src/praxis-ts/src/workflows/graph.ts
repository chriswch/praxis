import type {
  RunRecord,
  StageName,
  StageResultRecord,
  WorkflowDefinition,
  WorkflowName,
  WorkflowTransition
} from "../contracts/model.js";
import {
  expectedInputArtifactsForStage,
  expectedInputArtifactsForTransition as expectedInputArtifactsForTransitionStage
} from "./stage-artifacts.js";

function transition(routeKind: WorkflowTransition["routeKind"], nextStage: StageName | null): WorkflowTransition {
  return { routeKind, nextStage };
}

export const WORKFLOW_GRAPH: Record<WorkflowName, WorkflowDefinition> = {
  craft: {
    name: "craft",
    stages: {
      "clarifying-intent": {
        stage: "clarifying-intent",
        outcomes: {
          trivial_change: transition("done", null),
          bug_fix_ready: transition("proceed", "driving-tdd"),
          story_spec_ready: transition("proceed", "sketching-design"),
          feature_brief_ready: transition("proceed", "slicing-stories"),
          clarification_needed: transition("ask_user", "clarifying-intent")
        }
      },
      "slicing-stories": {
        stage: "slicing-stories",
        outcomes: {
          slice_map_ready: transition("proceed", "clarifying-intent"),
          blocking_questions: transition("ask_user", "slicing-stories")
        }
      },
      "sketching-design": {
        stage: "sketching-design",
        outcomes: {
          sketch_ready: transition("proceed", "driving-tdd"),
          sketch_skipped: transition("proceed", "driving-tdd"),
          spec_issue: transition("ask_user", "clarifying-intent")
        }
      },
      "driving-tdd": {
        stage: "driving-tdd",
        outcomes: {
          tdd_complete: transition("proceed", "code-reviewing"),
          spec_feedback: transition("ask_user", "clarifying-intent")
        }
      },
      "code-reviewing": {
        stage: "code-reviewing",
        outcomes: {
          review_ready: transition("proceed", "code-improving"),
          review_skipped: transition("proceed", "verifying-and-adapting")
        }
      },
      "code-improving": {
        stage: "code-improving",
        outcomes: {
          improvement_ready: transition("proceed", "verifying-and-adapting"),
          improvement_skipped: transition("proceed", "verifying-and-adapting"),
          spec_feedback: transition("ask_user", "clarifying-intent")
        }
      },
      "verifying-and-adapting": {
        stage: "verifying-and-adapting",
        outcomes: {
          verification_complete: transition("done", null),
          next_slice: transition("next_slice", "clarifying-intent"),
          rework_needed: transition("rework", "driving-tdd"),
          escalation_needed: transition("escalate", "clarifying-intent")
        }
      }
    }
  },
  "converge-pre-remediation": {
    name: "converge-pre-remediation",
    stages: {
      "clarifying-intent": {
        stage: "clarifying-intent",
        outcomes: {
          target_spec_ready: transition("proceed", "assessing-gaps"),
          clarification_needed: transition("ask_user", "clarifying-intent")
        }
      },
      "assessing-gaps": {
        stage: "assessing-gaps",
        outcomes: {
          findings_recorded: transition("proceed", "planning-remediation"),
          no_gaps: transition("done", null)
        }
      },
      "planning-remediation": {
        stage: "planning-remediation",
        outcomes: {
          remediation_map_ready: transition("proceed", null),
          no_selection: transition("ask_user", "planning-remediation")
        }
      }
    }
  }
};

export function resolveWorkflowOutcome(
  workflow: WorkflowName,
  stage: StageName,
  outcomeCode: string
): WorkflowTransition {
  const workflowDefinition = WORKFLOW_GRAPH[workflow];
  const stageDefinition = workflowDefinition.stages[stage];

  if (!stageDefinition) {
    throw new Error(`Stage ${stage} is not part of workflow ${workflow}.`);
  }

  const resolved = stageDefinition.outcomes[outcomeCode];
  if (!resolved) {
    throw new Error(
      `Outcome ${outcomeCode} is not mapped in workflow ${workflow} stage ${stage}.`
    );
  }

  return resolved;
}

export function resolveWorkflowTransition(
  workflow: WorkflowName,
  stageResult: StageResultRecord
): WorkflowTransition {
  return resolveWorkflowOutcome(workflow, stageResult.stage, stageResult.data.outcome_code);
}

export function expectedInputArtifacts(
  run: Pick<RunRecord, "workflow" | "current" | "mode" | "constraints">
): string[] {
  const stage = run.current.stage;

  if (!stage) {
    return [];
  }

  return expectedInputArtifactsForStage(
    stage,
    run.current.artifact_dir,
    run.constraints?.clarifying_required_artifacts ?? [],
    run.workflow
  );
}

export function expectedInputArtifactsForTransition(
  run: Pick<RunRecord, "workflow" | "current" | "routing" | "constraints">,
  transition: {
    from_stage: StageName | null;
    from_outcome_code: string | null;
  }
): string[] {
  const stage = run.current.stage;

  if (!stage) {
    return [];
  }

  return expectedInputArtifactsForTransitionStage(
    stage,
    run.current.artifact_dir,
    transition,
    run.constraints?.clarifying_required_artifacts ?? [],
    run.workflow
  );
}
