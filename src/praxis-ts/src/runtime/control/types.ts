import type {
  AdapterName,
  DispatchRecord,
  ExecutionMode,
  RunRecord,
  StageName,
  WorkerSessionRegistration,
} from "../../contracts/model.js";
import type { StatusProjection } from "./status-projector.js";

export interface RunCreateInput {
  adapter: AdapterName;
  executionMode: ExecutionMode;
  entryTask: string;
  entrypoint?: string;
}

export interface InspectProjection {
  status: StatusProjection;
  run: RunRecord;
  ledger_present: boolean;
  active_dispatch: DispatchRecord | null;
  active_session: Record<string, unknown> | null;
  active_worktree: Record<string, unknown> | null;
  artifact_inspection: {
    required_inputs: { path: string; exists: boolean }[];
    expected_outputs: { path: string; exists: boolean }[];
    stage_result: { path: string; exists: boolean } | null;
    boundary_handoff: { path: string; exists: boolean } | null;
  } | null;
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
    worktrees_dir: string;
    policy_dir: string;
  };
}

export interface WorkerLaunchPayload {
  run_id: string;
  dispatch_id: string;
  workflow: string;
  stage: string;
  scope: string;
  artifact_dir: string;
  stage_result_path: string;
  contract: DispatchRecord["contract"];
  context_manifest: DispatchRecord["context_manifest"];
  inputs: {
    required_artifacts: string[];
    boundary_handoff: Record<string, unknown> | null;
  };
  policy: DispatchRecord["tool_policy"];
  worker: {
    adapter: string;
    mode: string;
    worker_class: DispatchRecord["worker"]["worker_class"];
    resume_session_id: string | null;
  };
  execution: DispatchRecord["execution"];
  runtime: {
    entrypoint: string;
    fresh_context_per_story: boolean;
  };
}

export interface LaunchStageOutcome {
  run_id: string;
  dispatch_id: string;
  stage: StageName | null;
  worker_id: string;
  session_id: string | null;
  locator: string | null;
  resumable: boolean;
  mode: "launch" | "resume";
  reason: string;
}

export interface SubmitStageResultOutcome {
  stage: string;
  outcome_code: string;
  route_kind: string;
  next_stage: StageName | null;
  next_action: string;
  run_status: string;
  reason: string;
  audit_warnings?: string[];
}

export interface LifecycleActionOutcome {
  run_id: string;
  status: string;
  next_action: string;
  next_stage: StageName | null;
  reason: string;
}

export interface RegisterWorkerSessionOutcome {
  run_id: string;
  dispatch_id: string;
  worker_id: string;
  session_id: string | null;
  resumable: boolean;
  stage: StageName | null;
  reason: string;
}

export type RegisterWorkerSessionInput = WorkerSessionRegistration;
