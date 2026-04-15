import type {
  RunRecord,
  StageName,
  StageResultRecord,
  WorkflowDefinition,
  WorkflowName,
  WorkflowTransition
} from "../contracts/model.js";

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
      },
      "rapid-implementing": undefined
    }
  },
  forge: {
    name: "forge",
    stages: {
      "clarifying-intent": {
        stage: "clarifying-intent",
        outcomes: {
          trivial_change: transition("done", null),
          bug_fix_ready: transition("proceed", "rapid-implementing"),
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
          sketch_ready: transition("proceed", "rapid-implementing"),
          sketch_skipped: transition("proceed", "rapid-implementing"),
          spec_issue: transition("ask_user", "clarifying-intent")
        }
      },
      "rapid-implementing": {
        stage: "rapid-implementing",
        outcomes: {
          implementation_complete: transition("proceed", "code-reviewing"),
          spec_feedback: transition("ask_user", "clarifying-intent")
        }
      },
      "code-reviewing": {
        stage: "code-reviewing",
        outcomes: {
          review_ready: transition("proceed", "code-improving"),
          review_skipped: transition("proceed", null)
        }
      },
      "code-improving": {
        stage: "code-improving",
        outcomes: {
          improvement_ready: transition("proceed", null),
          improvement_skipped: transition("proceed", null),
          spec_feedback: transition("ask_user", "clarifying-intent")
        }
      },
      "driving-tdd": undefined,
      "verifying-and-adapting": undefined
    }
  }
};

export function resolveWorkflowTransition(
  workflow: WorkflowName,
  stageResult: StageResultRecord
): WorkflowTransition {
  const workflowDefinition = WORKFLOW_GRAPH[workflow];
  const stageDefinition = workflowDefinition.stages[stageResult.stage];

  if (!stageDefinition) {
    throw new Error(`Stage ${stageResult.stage} is not part of workflow ${workflow}.`);
  }

  const outcomeCode = stageResult.data.outcome_code;
  const resolved = stageDefinition.outcomes[outcomeCode];
  if (!resolved) {
    throw new Error(
      `Outcome ${outcomeCode} is not mapped in workflow ${workflow} stage ${stageResult.stage}.`
    );
  }

  return resolved;
}

export function shouldPauseAfterStageResult(workflow: WorkflowName, stageResult: StageResultRecord): boolean {
  if (stageResult.needs_user_input || stageResult.needs_confirmation) {
    return true;
  }

  if (workflow === "forge" && stageResult.stage === "clarifying-intent") {
    return true;
  }

  return false;
}

export function expectedInputArtifacts(run: Pick<RunRecord, "current" | "mode">): string[] {
  const stage = run.current.stage;
  const artifactDir = run.current.artifact_dir;

  if (!stage) {
    return [];
  }

  if (stage === "clarifying-intent") {
    // Bootstrap and normal clarifying-intent dispatches are user/handoff driven.
    return [];
  }

  if (stage === "slicing-stories") {
    return [".praxis/brief.md"];
  }

  if (stage === "sketching-design" || stage === "driving-tdd" || stage === "rapid-implementing") {
    return [`${artifactDir}/spec.md`];
  }

  if (stage === "code-reviewing") {
    return [`${artifactDir}/implementation.md`];
  }

  if (stage === "code-improving") {
    return [`${artifactDir}/review.md`];
  }

  if (stage === "verifying-and-adapting") {
    return [`${artifactDir}/improvement.md`];
  }

  return [];
}
