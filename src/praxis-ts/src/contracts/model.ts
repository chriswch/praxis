export const WORKFLOW_NAMES = ["craft", "forge"] as const;
export type WorkflowName = (typeof WORKFLOW_NAMES)[number];

export const CONVERGE_PROFILES = ["product-spec-gap", "architecture-gap"] as const;
export type ConvergeProfile = (typeof CONVERGE_PROFILES)[number];

export const FINDING_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_STATUS = [
  "open",
  "batched",
  "in_progress",
  "fixed",
  "still_open",
  "regressed",
  "waived",
  "duplicate",
  "escalated"
] as const;
export type FindingStatus = (typeof FINDING_STATUS)[number];

export const CAMPAIGN_STATUS = [
  "running",
  "waiting_for_user",
  "blocked",
  "completed",
  "cancelled"
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUS)[number];

export const CAMPAIGN_STOP_REASON_CODES = [
  "converged",
  "needs_operator",
  "blocked",
  "stalled",
  "budget_exhausted",
  "cancelled"
] as const;
export type CampaignStopReasonCode = (typeof CAMPAIGN_STOP_REASON_CODES)[number];

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

export const PERMISSION_PROFILES = [
  "planning",
  "design",
  "implementation",
  "review",
  "verification"
] as const;
export type PermissionProfile = (typeof PERMISSION_PROFILES)[number];

export const WORKTREE_MODES = ["shared", "isolated"] as const;
export type WorktreeMode = (typeof WORKTREE_MODES)[number];

export const TOOL_KINDS = ["filesystem", "shell", "git", "search", "patch", "network"] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

export const TOOL_USE_STATUS = ["granted", "denied", "failed"] as const;
export type ToolUseStatus = (typeof TOOL_USE_STATUS)[number];

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
  tool_uses?: Array<{
    tool: string;
    kind: ToolKind;
    status: ToolUseStatus;
    target_path?: string | null;
    reason?: string | null;
  }>;
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

export type RepoInstructionSurface = {
  path: string;
  kind: "file" | "directory";
  provider: "shared" | "codex" | "claude";
  authoritative: boolean;
  exists: boolean;
  description: string;
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
    entered_from_stage: StageName | null;
    entered_from_outcome_code: string | null;
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
  contract: {
    stage_goal: string;
    stage_instructions: string[];
    expected_output_artifacts: string[];
    primary_output: string | null;
  };
  context_manifest: {
    declared_inputs: string[];
    boundary_handoff_path: string | null;
    instruction_surfaces: RepoInstructionSurface[];
  };
  worker: {
    adapter: AdapterName;
    mode: DispatchWorkerMode;
    worker_class: WorkerClass;
  };
  execution: {
    fresh_context: boolean;
    worktree_mode: WorktreeMode;
    workspace_root: string;
    workspace_origin: "shared" | "git_worktree" | "snapshot";
  };
  tool_policy: {
    writable_roots: string[];
    blocked_paths: string[];
    network: "enabled" | "restricted";
    profile: PermissionProfile;
  };
};

export type WorkerSessionRegistration = {
  dispatch_id: string;
  worker_id: string;
  session_id: string | null;
  started_at: string;
  locator: string | null;
  resumable: boolean;
  details?: Record<string, unknown> | null;
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

export type ObjectiveManifest = {
  source_path: string;
  normalized_path: string;
  profile: ConvergeProfile;
  scope: string[];
  created_at: string;
};

export type CampaignRecord = {
  version: number;
  campaign_id: string;
  workflow: "forge";
  adapter: AdapterName;
  objective: ObjectiveManifest;
  profile: ConvergeProfile;
  severity_threshold: FindingSeverity;
  max_passes: number;
  max_findings_per_pass: number;
  max_stories_per_pass: number;
  commit_per_story: boolean;
  auto_continue: boolean;
  allow_waive: boolean;
  status: CampaignStatus;
  current_pass: number;
  current_review_id: string | null;
  current_child_run_id: string | null;
  stop_reason_code: CampaignStopReasonCode | null;
  reason: string;
  metrics: {
    last_unresolved_at_or_above_threshold: number | null;
    no_progress_passes: number;
  };
  timestamps: {
    created_at: string;
    updated_at: string;
  };
};

export type CampaignFinding = {
  finding_id: string;
  fingerprint: string;
  title: string;
  severity: FindingSeverity;
  category: string;
  summary: string;
  evidence: string[];
  objective_refs: string[];
  affected_paths: string[];
  recommended_action: string;
  status: FindingStatus;
  confidence: number;
  introduced_in_pass: number;
  resolved_in_pass: number | null;
  child_run_ids: string[];
  story_ids: string[];
  commit_refs: string[];
  last_seen_pass: number;
};

export type CampaignLedgerRecord = {
  version: number;
  campaign_id: string;
  profile: ConvergeProfile;
  findings: Record<string, CampaignFinding>;
  finding_order: string[];
  timestamps: {
    updated_at: string;
  };
};

export type ObjectiveFinding = Omit<CampaignFinding, "finding_id" | "status" | "introduced_in_pass" | "resolved_in_pass" | "child_run_ids" | "story_ids" | "commit_refs" | "last_seen_pass">;

export type ObjectiveAssessmentResult = {
  version: number;
  profile: ConvergeProfile;
  review_id: string;
  objective_path: string;
  findings: ObjectiveFinding[];
  generated_at: string;
};

export type PassBatchRecord = {
  version: number;
  campaign_id: string;
  pass_id: string;
  pass_number: number;
  review_id: string;
  selected_finding_ids: string[];
  deferred_finding_ids: string[];
  stories: Array<{
    story_id: string;
    title: string;
    finding_ids: string[];
    objective_context: string;
    non_goals: string[];
  }>;
  generated_at: string;
};

export type PassSummaryRecord = {
  version: number;
  campaign_id: string;
  pass_id: string;
  pass_number: number;
  child_run_id: string | null;
  planned_finding_ids: string[];
  completed_story_ids: string[];
  produced_commits: string[];
  reassessment_review_id: string;
  unresolved_at_or_above_threshold: number;
  outcome: "continue" | "converged" | "needs_operator" | "stalled" | "budget_exhausted";
  generated_at: string;
};
