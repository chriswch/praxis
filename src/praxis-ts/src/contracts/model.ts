export const WORKFLOW_NAMES = ["craft", "forge"] as const;
export type WorkflowName = (typeof WORKFLOW_NAMES)[number];

export const ADAPTER_NAMES = ["codex", "claude"] as const;
export type AdapterName = (typeof ADAPTER_NAMES)[number];

export const EXECUTION_MODES = ["manual", "autopilot"] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const RUN_SCOPES = ["root", "slice"] as const;
export type RunScope = (typeof RUN_SCOPES)[number];

export const RUN_STATUS = [
  "running",
  "waiting_for_user",
  "blocked",
  "completed",
  "failed",
  "cancelled",
  "cancelling"
] as const;
export type RunStatus = (typeof RUN_STATUS)[number];

export const ROUTE_KINDS = ["proceed", "ask_user", "done", "next_slice", "rework", "escalate"] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];

export const STAGE_RESULT_STATUS = ["completed", "blocked", "failed", "skipped"] as const;
export type StageResultStatus = (typeof STAGE_RESULT_STATUS)[number];

export const RUN_NEXT_ACTIONS = [
  "run_stage",
  "ask_user",
  "confirm_then_run",
  "finish",
  "cancel",
  "idle"
] as const;
export type RunNextAction = (typeof RUN_NEXT_ACTIONS)[number];

export const WORKER_CLASSES = [
  "interactive_orchestrator",
  "session_worker",
  "worktree_worker"
] as const;
export type WorkerClass = (typeof WORKER_CLASSES)[number];

export const DISPATCH_WORKER_MODES = [
  "fresh_session",
  "same_stage_resume",
  "isolated_worktree"
] as const;
export type DispatchWorkerMode = (typeof DISPATCH_WORKER_MODES)[number];

export const STAGE_NAMES = [
  "clarifying-intent",
  "slicing-stories",
  "sketching-design",
  "driving-tdd",
  "rapid-implementing",
  "code-reviewing",
  "code-improving",
  "verifying-and-adapting"
] as const;
export type StageName = (typeof STAGE_NAMES)[number];

export type StageRoute = {
  kind: RouteKind;
  next_stage: StageName | null;
  next_slice_id: string | null;
  reason?: string | null;
};

export type StageResultRecord = {
  version: number;
  run_id: string | null;
  dispatch_id: string;
  session_id?: string | null;
  stage: StageName;
  artifact_dir: string;
  status: StageResultStatus;
  summary_path: string | null;
  artifacts_written: string[];
  route: StageRoute;
  data: {
    outcome_code: string;
    [key: string]: unknown;
  };
  worker?: {
    worker_id: string | null;
    adapter: AdapterName | null;
    session_id: string | null;
    worker_class: WorkerClass;
  };
  execution?: {
    permission_profile: "planning" | "design" | "implementation" | "review" | "verification";
    worktree_mode: "shared" | "isolated";
    fresh_context: boolean;
    resumed: boolean;
  };
  input_artifacts?: string[];
  output_artifacts?: string[];
  verification?: {
    tests_run: boolean;
    diff_reviewed: boolean;
  };
  handoff?: Record<string, unknown> | null;
  needs_user_input: boolean;
  needs_confirmation: boolean;
};

export type WorkflowTransition = {
  routeKind: RouteKind;
  nextStage: StageName | null;
};

export type WorkflowStageDefinition = {
  stage: StageName;
  outcomes: Record<string, WorkflowTransition>;
};

export type WorkflowDefinition = {
  name: WorkflowName;
  stages: Record<StageName, WorkflowStageDefinition | undefined>;
};

export type RunRecord = {
  version: number;
  run_id: string;
  workflow: WorkflowName;
  status: RunStatus;
  mode: "single_story" | "multi_slice";
  entry_task: string;
  runtime: {
    adapter: AdapterName;
    entrypoint: string;
  };
  execution: {
    mode: ExecutionMode;
    fresh_context_per_story: boolean;
  };
  current: {
    scope: RunScope;
    slice_id: string | null;
    artifact_dir: string;
    stage: StageName | null;
  };
  routing: {
    next_action: RunNextAction;
    next_stage: StageName | null;
    next_slice_id: string | null;
    reason: string;
    stop_reason_code: string | null;
    boundary_handoff_path: string | null;
  };
  active: {
    dispatch_id: string | null;
    worker_id: string | null;
    session_id: string | null;
    resumable: boolean;
  };
  timestamps: {
    created_at: string;
    updated_at: string;
  };
};

export type DispatchRecord = {
  version: number;
  dispatch_id: string;
  run_id: string;
  workflow: WorkflowName;
  stage: StageName;
  scope: RunScope;
  slice_id: string | null;
  artifact_dir: string;
  stage_result_path: string;
  created_at: string;
  inputs: {
    required_artifacts: string[];
    boundary_handoff: Record<string, unknown> | null;
  };
  worker: {
    adapter: AdapterName;
    mode: DispatchWorkerMode;
  };
  tool_policy: {
    writable_roots: string[];
    blocked_paths: string[];
    network: "enabled" | "restricted";
  };
};

export type WorkerSessionRegistration = {
  dispatch_id: string;
  worker_id: string;
  session_id: string | null;
  started_at: string;
  locator: string | null;
  resumable: boolean;
};

export type StoryLedgerRecord = {
  version: number;
  run_id: string;
  workflow: WorkflowName;
  execution_mode: ExecutionMode;
  stories: {
    order: string[];
    active: string | null;
    last_completed: string | null;
    items: Record<
      string,
      {
        id: string;
        title: string;
        artifact_dir: string;
        status: "pending" | "active" | "active_next" | "completed";
        carry_forward_from: string | null;
        handoff_path: string | null;
      }
    >;
  };
};

export type LifecycleEvent = {
  ts: string;
  type: string;
  run_id: string;
  stage?: StageName | null;
  action?: string;
  details?: Record<string, unknown>;
};
