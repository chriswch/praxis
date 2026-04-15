import type {
  AdapterName,
  DispatchRecord,
  ExecutionMode,
  RunRecord,
  StageName,
  WorkerSessionRegistration,
  WorkflowName
} from "../../contracts/model.js";
import type { StatusProjection } from "./status-projector.js";

export type RunCreateInput = {
  workflow: WorkflowName;
  adapter: AdapterName;
  executionMode: ExecutionMode;
  entryTask: string;
  entrypoint?: string;
};

export type InspectProjection = {
  status: StatusProjection;
  run: RunRecord;
  ledger_present: boolean;
  recent_events: Record<string, unknown>[];
  recent_stage_history: Record<string, unknown>[];
  recent_policy_records: Record<string, unknown>[];
  state_paths: {
    run_file: string;
    story_ledger_file: string;
    events_file: string;
    stage_history_file: string;
    dispatches_dir: string;
    sessions_dir: string;
    policy_dir: string;
  };
};

export type WorkerLaunchPayload = {
  run_id: string;
  dispatch_id: string;
  workflow: string;
  stage: string;
  scope: string;
  artifact_dir: string;
  stage_result_path: string;
  inputs: {
    required_artifacts: string[];
    boundary_handoff: Record<string, unknown> | null;
  };
  worker: {
    adapter: string;
    mode: string;
    resume_session_id: string | null;
  };
  runtime: {
    entrypoint: string;
    fresh_context_per_story: boolean;
  };
};

export type SubmitStageResultOutcome = {
  stage: string;
  outcome_code: string;
  route_kind: string;
  next_stage: StageName | null;
  next_action: string;
  run_status: string;
  reason: string;
};

export type LifecycleActionOutcome = {
  run_id: string;
  status: string;
  next_action: string;
  next_stage: StageName | null;
  reason: string;
};

export type RegisterWorkerSessionOutcome = {
  run_id: string;
  dispatch_id: string;
  worker_id: string;
  session_id: string | null;
  resumable: boolean;
  stage: StageName | null;
  reason: string;
};

export type RegisterWorkerSessionInput = WorkerSessionRegistration;
