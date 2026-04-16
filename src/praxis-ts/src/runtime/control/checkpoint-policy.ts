import type { ExecutionMode, RunRecord, StageName } from "../../contracts/model.js";

type StageCheckpointOverride = "run" | "confirm";

type CheckpointResolutionSource =
  | "needs_user_input"
  | "needs_confirmation"
  | "stage_override"
  | "execution_mode_default";

type StageEntryContext = "run_initialization" | "stage_transition" | "story_boundary";

type StageEntryCheckpointInput = {
  execution_mode: ExecutionMode;
  stage: StageName;
  needs_user_input?: boolean;
  needs_confirmation?: boolean;
  stage_overrides?: Partial<Record<StageName, StageCheckpointOverride>>;
};

export type StageEntryCheckpointDecision = {
  next_action: RunRecord["routing"]["next_action"];
  status: RunRecord["status"];
  stop_reason_code: string | null;
  source: CheckpointResolutionSource;
};

const EMPTY_STAGE_OVERRIDES: Partial<Record<StageName, StageCheckpointOverride>> = {};

function defaultCheckpointOverride(executionMode: ExecutionMode): StageCheckpointOverride {
  return executionMode === "manual" ? "confirm" : "run";
}

export function decideStageEntryCheckpoint(input: StageEntryCheckpointInput): StageEntryCheckpointDecision {
  if (input.needs_user_input) {
    return {
      next_action: "ask_user",
      status: "waiting_for_user",
      stop_reason_code: "needs_user_input",
      source: "needs_user_input"
    };
  }

  if (input.needs_confirmation) {
    return {
      next_action: "confirm_then_run",
      status: "waiting_for_user",
      stop_reason_code: "confirmation_required",
      source: "needs_confirmation"
    };
  }

  const stageOverrides = input.stage_overrides ?? EMPTY_STAGE_OVERRIDES;
  const stageOverride = stageOverrides[input.stage];
  if (stageOverride === "confirm") {
    return {
      next_action: "confirm_then_run",
      status: "waiting_for_user",
      stop_reason_code: "stage_checkpoint",
      source: "stage_override"
    };
  }
  if (stageOverride === "run") {
    return {
      next_action: "run_stage",
      status: "running",
      stop_reason_code: null,
      source: "stage_override"
    };
  }

  const modeDefault = defaultCheckpointOverride(input.execution_mode);
  if (modeDefault === "confirm") {
    return {
      next_action: "confirm_then_run",
      status: "waiting_for_user",
      stop_reason_code: "manual_checkpoint",
      source: "execution_mode_default"
    };
  }

  return {
    next_action: "run_stage",
    status: "running",
    stop_reason_code: null,
    source: "execution_mode_default"
  };
}

export function describeStageEntryCheckpoint(
  stage: StageName,
  context: StageEntryContext,
  decision: StageEntryCheckpointDecision
): string {
  if (decision.source === "needs_user_input") {
    return `Paused for user input before ${stage}.`;
  }
  if (decision.source === "needs_confirmation") {
    return `Paused for confirmation before ${stage}.`;
  }
  if (decision.source === "stage_override") {
    return decision.next_action === "run_stage"
      ? `Checkpoint policy auto-advanced to ${stage}.`
      : `Checkpoint policy paused before ${stage}.`;
  }
  if (decision.next_action === "confirm_then_run") {
    return `Manual checkpoint before ${stage}.`;
  }
  if (context === "run_initialization") {
    return `Run initialized. Autopilot entered ${stage}.`;
  }
  if (context === "story_boundary") {
    return `Boundary checkpoint complete. Autopilot advanced to ${stage}.`;
  }
  return `Autopilot advanced to ${stage}.`;
}
