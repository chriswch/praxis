import type {
  ConvergeProfile,
  ConvergeStageResultRecord,
  StageResultStatus
} from "../../contracts/model.js";
import {
  getConvergeWorkflowStageContract,
  resolveConvergeWorkflowTransition,
  type ConvergeRuntimeStage
} from "../../workflows/index.js";

export type { ConvergeRuntimeStage };

type ConvergeStageContract = ReturnType<typeof getConvergeWorkflowStageContract>;
type StageTransition = ReturnType<typeof resolveConvergeWorkflowTransition>;

export function getConvergeStageContract(stage: ConvergeRuntimeStage): ConvergeStageContract {
  return getConvergeWorkflowStageContract(stage);
}

export function resolveConvergeStageTransition(stage: ConvergeRuntimeStage, outcomeCode: string): StageTransition {
  return resolveConvergeWorkflowTransition(stage, outcomeCode);
}

type BuildConvergeStageResultInput<TStage extends ConvergeRuntimeStage> = {
  stage: TStage;
  status?: StageResultStatus;
  profile?: ConvergeProfile;
  reviewId?: string;
  outcomeCode: string;
  data?: Record<string, unknown>;
};

export function buildConvergeStageResult<TStage extends ConvergeRuntimeStage>(
  input: BuildConvergeStageResultInput<TStage>
): ConvergeStageResultRecord & { stage: TStage } {
  const transition = resolveConvergeStageTransition(input.stage, input.outcomeCode);
  return {
    version: 1,
    stage: input.stage,
    status: input.status ?? "completed",
    ...(input.profile ? { profile: input.profile } : {}),
    ...(input.reviewId ? { review_id: input.reviewId } : {}),
    route: {
      kind: transition.routeKind
    },
    data: {
      outcome_code: input.outcomeCode,
      next_stage: transition.nextStage,
      routing_reason: transition.reason,
      ...(input.data ?? {})
    }
  };
}
