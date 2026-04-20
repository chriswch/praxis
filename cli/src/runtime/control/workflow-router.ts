import type { RunRecord, StageName } from "../../contracts/model.js";
import type { StageResultAcceptance } from "./stage-result-validator.js";
import { decideStageEntryCheckpoint, describeStageEntryCheckpoint } from "./checkpoint-policy.js";

export interface RoutingDecision {
  next_action: RunRecord["routing"]["next_action"];
  next_stage: RunRecord["routing"]["next_stage"];
  status: RunRecord["status"];
  reason: string;
  stop_reason_code: string | null;
  current_stage: RunRecord["current"]["stage"];
}

function pauseForConfirmation(
  stage: StageName,
  reason: string,
  stopReasonCode: string | null = null,
): RoutingDecision {
  return {
    next_action: "confirm_then_run",
    next_stage: stage,
    status: "waiting_for_user",
    reason,
    stop_reason_code: stopReasonCode,
    current_stage: stage,
  };
}

function pauseForUser(stage: StageName, reason: string, stopReasonCode: string): RoutingDecision {
  return {
    next_action: "ask_user",
    next_stage: stage,
    status: "waiting_for_user",
    reason,
    stop_reason_code: stopReasonCode,
    current_stage: stage,
  };
}

export function decideNextRouting(
  run: RunRecord,
  accepted: StageResultAcceptance,
): RoutingDecision {
  const { result, transition } = accepted;
  const nextStage = transition.next_stage;

  if (transition.route_kind === "ask_user") {
    const askUserStage = nextStage ?? result.stage;
    return pauseForUser(
      askUserStage,
      `Stage ${result.stage} requested user input (${result.data.outcome_code}).`,
      "needs_user_input",
    );
  }

  if (transition.route_kind === "rework") {
    return pauseForUser(
      nextStage ?? result.stage,
      `Stage ${result.stage} requested rework (${result.data.outcome_code}).`,
      "rework_requested",
    );
  }

  if (transition.route_kind === "escalate") {
    return pauseForUser(
      nextStage ?? result.stage,
      `Stage ${result.stage} escalated to operator (${result.data.outcome_code}).`,
      "escalation",
    );
  }

  if (transition.route_kind === "done") {
    return {
      next_action: "finish",
      next_stage: null,
      status: "completed",
      reason: `Run completed at ${result.stage} (${result.data.outcome_code}).`,
      stop_reason_code: null,
      current_stage: null,
    };
  }

  if (transition.route_kind === "next_slice") {
    return {
      next_action: "ask_user",
      next_stage: "clarifying-intent",
      status: "waiting_for_user",
      reason: "Slice boundary reached. Activate next slice after checkpoint.",
      stop_reason_code: "boundary_pending",
      current_stage: "clarifying-intent",
    };
  }

  if (transition.route_kind !== "proceed") {
    throw new Error(`Unsupported route kind: ${transition.route_kind}`);
  }

  if (!nextStage) {
    if (run.mode === "multi_slice") {
      return {
        next_action: "ask_user",
        next_stage: "clarifying-intent",
        status: "waiting_for_user",
        reason: "Story completed; boundary checkpoint required for next slice.",
        stop_reason_code: "boundary_pending",
        current_stage: "clarifying-intent",
      };
    }

    return {
      next_action: "finish",
      next_stage: null,
      status: "completed",
      reason: `Run completed after ${result.stage} (${result.data.outcome_code}).`,
      stop_reason_code: null,
      current_stage: null,
    };
  }

  const checkpoint = decideStageEntryCheckpoint({
    execution_mode: run.execution.mode,
    stage: nextStage,
    needs_user_input: result.needs_user_input,
    needs_confirmation: result.needs_confirmation,
  });
  const reason = describeStageEntryCheckpoint(nextStage, "stage_transition", checkpoint);
  if (checkpoint.next_action === "ask_user") {
    return pauseForUser(nextStage, reason, checkpoint.stop_reason_code ?? "needs_user_input");
  }
  if (checkpoint.next_action === "confirm_then_run") {
    return pauseForConfirmation(nextStage, reason, checkpoint.stop_reason_code);
  }
  return {
    next_action: checkpoint.next_action,
    next_stage: nextStage,
    status: checkpoint.status,
    reason,
    stop_reason_code: checkpoint.stop_reason_code,
    current_stage: nextStage,
  };
}
