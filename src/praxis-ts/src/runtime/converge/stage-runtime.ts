import type {
  ConvergeProfile,
  ConvergeStageName,
  ConvergeStageResultRecord,
  StageResultStatus,
} from "../../contracts/model.js";
import {
  getConvergeWorkflowStageContract,
  resolveConvergeWorkflowTransition,
} from "../../workflows/index.js";

type ConvergeStageContract = ReturnType<typeof getConvergeWorkflowStageContract>;
type StageTransition = ReturnType<typeof resolveConvergeWorkflowTransition>;

export function getConvergeStageContract(stage: ConvergeStageName): ConvergeStageContract {
  return getConvergeWorkflowStageContract(stage);
}

export function resolveConvergeStageTransition(
  stage: ConvergeStageName,
  outcomeCode: string,
): StageTransition {
  return resolveConvergeWorkflowTransition(stage, outcomeCode);
}

interface BuildConvergeStageResultInput<TStage extends ConvergeStageName> {
  stage: TStage;
  status?: StageResultStatus;
  profile?: ConvergeProfile;
  reviewId?: string;
  outcomeCode: string;
  data?: Record<string, unknown>;
}

export function buildConvergeStageResult<TStage extends ConvergeStageName>(
  input: BuildConvergeStageResultInput<TStage>,
): ConvergeStageResultRecord & { stage: TStage } {
  const transition = resolveConvergeStageTransition(input.stage, input.outcomeCode);
  return {
    version: 1,
    stage: input.stage,
    status: input.status ?? "completed",
    ...(input.profile ? { profile: input.profile } : {}),
    ...(input.reviewId ? { review_id: input.reviewId } : {}),
    route: {
      kind: transition.routeKind,
    },
    data: {
      outcome_code: input.outcomeCode,
      next_stage: transition.nextStage,
      routing_reason: transition.reason,
      ...(input.data ?? {}),
    },
  };
}
