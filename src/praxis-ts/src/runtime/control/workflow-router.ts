import type { RunRecord, StageName } from "../../contracts/model.js";
import type { StageResultAcceptance } from "./stage-result-validator.js";
import { shouldPauseAfterStageResult } from "../../workflows/index.js";

export type RoutingDecision = {
  next_action: RunRecord["routing"]["next_action"];
  next_stage: RunRecord["routing"]["next_stage"];
  status: RunRecord["status"];
  reason: string;
  stop_reason_code: string | null;
  current_stage: RunRecord["current"]["stage"];
};

function pauseForConfirmation(
  stage: StageName,
  reason: string,
  stopReasonCode: string | null = null
): RoutingDecision {
  return {
    next_action: "confirm_then_run",
    next_stage: stage,
    status: "waiting_for_user",
    reason,
    stop_reason_code: stopReasonCode,
    current_stage: stage
  };
}

function pauseForUser(stage: StageName, reason: string, stopReasonCode: string): RoutingDecision {
  return {
    next_action: "ask_user",
    next_stage: stage,
    status: "waiting_for_user",
    reason,
    stop_reason_code: stopReasonCode,
    current_stage: stage
  };
}

export function decideNextRouting(run: RunRecord, accepted: StageResultAcceptance): RoutingDecision {
  const { result, transition } = accepted;
  const nextStage = transition.next_stage;

  if (transition.route_kind === "ask_user") {
    return pauseForUser(
      result.stage,
      `Stage ${result.stage} requested user input (${result.data.outcome_code}).`,
      "needs_user_input"
    );
  }

  if (transition.route_kind === "rework") {
    return pauseForUser(
      nextStage ?? result.stage,
      `Stage ${result.stage} requested rework (${result.data.outcome_code}).`,
      "rework_requested"
    );
  }

  if (transition.route_kind === "escalate") {
    return pauseForUser(
      nextStage ?? result.stage,
      `Stage ${result.stage} escalated to operator (${result.data.outcome_code}).`,
      "escalation"
    );
  }

  if (transition.route_kind === "done") {
    return {
      next_action: "finish",
      next_stage: null,
      status: "completed",
      reason: `Run completed at ${result.stage} (${result.data.outcome_code}).`,
      stop_reason_code: null,
      current_stage: null
    };
  }

  if (transition.route_kind === "next_slice") {
    return {
      next_action: "ask_user",
      next_stage: "clarifying-intent",
      status: "waiting_for_user",
      reason: "Slice boundary reached. Activate next slice after checkpoint.",
      stop_reason_code: "boundary_pending",
      current_stage: "clarifying-intent"
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
        current_stage: "clarifying-intent"
      };
    }

    return {
      next_action: "finish",
      next_stage: null,
      status: "completed",
      reason: `Run completed after ${result.stage} (${result.data.outcome_code}).`,
      stop_reason_code: null,
      current_stage: null
    };
  }

  if (run.execution.mode === "manual") {
    return pauseForConfirmation(nextStage, `Manual checkpoint before ${nextStage}.`, "manual_checkpoint");
  }

  if (shouldPauseAfterStageResult(run.workflow, result)) {
    if (result.needs_user_input) {
      return pauseForUser(nextStage, `Paused for user input before ${nextStage}.`, "needs_user_input");
    }

    return pauseForConfirmation(nextStage, `Paused for confirmation before ${nextStage}.`, "confirmation_required");
  }

  return {
    next_action: "run_stage",
    next_stage: nextStage,
    status: "running",
    reason: `Autopilot advanced to ${nextStage}.`,
    stop_reason_code: null,
    current_stage: nextStage
  };
}
