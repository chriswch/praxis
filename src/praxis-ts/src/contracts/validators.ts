import { posix } from "node:path";
import {
  ADAPTER_NAMES,
  CAMPAIGN_STATUS,
  CAMPAIGN_STOP_REASON_CODES,
  CHILD_RUN_SLOT_STATUS,
  CONVERGE_STAGE_NAMES,
  CONVERGE_PROFILES,
  DISPATCH_WORKER_MODES,
  EXECUTION_MODES,
  FINDING_KINDS,
  FINDING_SEVERITIES,
  FINDING_STATUS,
  PERMISSION_PROFILES,
  ROUTE_KINDS,
  RUN_NEXT_ACTIONS,
  RUN_SCOPES,
  RUN_STATUS,
  STAGE_NAMES,
  STAGE_RESULT_STATUS,
  TOOL_KINDS,
  TOOL_USE_STATUS,
  WORKTREE_MODES,
  WORKER_CLASSES,
  WORKFLOW_NAMES,
  type CampaignLedgerRecord,
  type CampaignRecord,
  type ChildRunSlotRecord,
  type ConvergeStageResultRecord,
  type DispatchRecord,
  type GapAssessmentResult,
  type ObjectiveAssessmentResult,
  type PassBatchRecord,
  type PassSummaryRecord,
  type RemediationMapRecord,
  type RemediationSelectionFields,
  type RunRecord,
  type StageResultRecord,
  type StoryLedgerRecord,
  type WorkerSessionRegistration,
} from "./model.js";

export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}

function assertEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  label: string,
): asserts value is T {
  if (!allowed.includes(value as T)) {
    throw new ContractError(`Invalid ${label}: ${value}. Allowed: ${allowed.join(", ")}.`);
  }
}

function assertWorkflowName(
  value: string,
  label: string,
): asserts value is (typeof WORKFLOW_NAMES)[number] {
  if (value === "forge") {
    throw new ContractError(
      `Invalid ${label}: forge. Legacy forge state is not supported; start a fresh run or campaign using craft.`,
    );
  }
  assertEnum(value, WORKFLOW_NAMES, label);
}

function assertPraxisPath(value: string | null, label: string): void {
  if (value === null) {
    return;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ContractError(`${label} must be a non-empty string path`);
  }

  const normalized = posix.normalize(value.replaceAll("\\", "/"));
  const isAbsolute = normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized);
  if (isAbsolute) {
    throw new ContractError(`${label} must be a relative .praxis path: ${value}`);
  }

  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new ContractError(`${label} must not escape the repo root: ${value}`);
  }

  if (normalized !== ".praxis" && !normalized.startsWith(".praxis/")) {
    throw new ContractError(`${label} must be scoped under .praxis: ${value}`);
  }
}

function assertRepoRelativePath(value: string | null, label: string): void {
  if (value === null) {
    return;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ContractError(`${label} must be a non-empty string path`);
  }

  const normalized = posix.normalize(value.replaceAll("\\", "/"));
  const isAbsolute = normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized);
  if (isAbsolute) {
    throw new ContractError(`${label} must be repo-relative: ${value}`);
  }

  if (normalized === ".." || normalized.startsWith("../")) {
    throw new ContractError(`${label} must not escape the repo root: ${value}`);
  }
}

function assertPlainString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ContractError(`${label} must be a non-empty string`);
  }
}

function assertBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new ContractError(`${label} must be a boolean`);
  }
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ContractError(`${label} must be an object`);
  }
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new ContractError(`${label} must be an array`);
  }

  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") {
      throw new ContractError(`${label}[${String(index)}] must be a string`);
    }
  }
}

export function validateRunRecord(run: RunRecord): void {
  if (run.version < 1) {
    throw new ContractError("run.version must be >= 1");
  }

  assertWorkflowName(run.workflow, "workflow");
  assertEnum(run.runtime.adapter, ADAPTER_NAMES, "runtime.adapter");
  assertEnum(run.execution.mode, EXECUTION_MODES, "execution.mode");
  assertEnum(run.status, RUN_STATUS, "status");
  assertEnum(run.current.scope, RUN_SCOPES, "current.scope");
  assertEnum(run.routing.next_action, RUN_NEXT_ACTIONS, "routing.next_action");

  if (run.current.stage !== null) {
    assertEnum(run.current.stage, STAGE_NAMES, "current.stage");
  }

  if (run.routing.next_stage !== null) {
    assertEnum(run.routing.next_stage, STAGE_NAMES, "routing.next_stage");
  }
  const enteredFromStage = run.routing.entered_from_stage ?? null;
  if (enteredFromStage !== null) {
    assertEnum(enteredFromStage, STAGE_NAMES, "routing.entered_from_stage");
  }

  if (run.routing.next_slice_id !== null) {
    assertPlainString(run.routing.next_slice_id, "routing.next_slice_id");
  }
  const enteredFromOutcomeCode = run.routing.entered_from_outcome_code ?? null;
  if (enteredFromOutcomeCode !== null) {
    assertPlainString(enteredFromOutcomeCode, "routing.entered_from_outcome_code");
  }

  assertPraxisPath(run.current.artifact_dir, "current.artifact_dir");
  assertPraxisPath(run.routing.boundary_handoff_path, "routing.boundary_handoff_path");

  if (run.current.scope === "root" && run.current.slice_id !== null) {
    throw new ContractError("current.slice_id must be null when current.scope is root");
  }

  if (run.current.scope === "slice" && run.current.slice_id === null) {
    throw new ContractError("current.slice_id is required when current.scope is slice");
  }

  if (run.workflow_constraints !== undefined) {
    assertRecord(run.workflow_constraints, "workflow_constraints");

    // workflow_constraints.workflow identifies the *origin* of the constraints
    // (which workflow configured them), not the run's own workflow. A converge
    // campaign seeds a craft child run with converge-pre-remediation constraints,
    // so we don't enforce workflow === run.workflow.
    assertEnum(
      run.workflow_constraints.workflow,
      ["converge-pre-remediation"] as const,
      "workflow_constraints.workflow",
    );

    if (run.workflow_constraints.clarifying_required_artifacts !== undefined) {
      assertStringArray(
        run.workflow_constraints.clarifying_required_artifacts,
        "workflow_constraints.clarifying_required_artifacts",
      );
      for (const path of run.workflow_constraints.clarifying_required_artifacts) {
        assertPraxisPath(path, "workflow_constraints.clarifying_required_artifacts item");
      }
    }

    if (run.workflow_constraints.clarifying_allowed_outcomes !== undefined) {
      assertStringArray(
        run.workflow_constraints.clarifying_allowed_outcomes,
        "workflow_constraints.clarifying_allowed_outcomes",
      );
      for (const outcomeCode of run.workflow_constraints.clarifying_allowed_outcomes) {
        assertPlainString(outcomeCode, "workflow_constraints.clarifying_allowed_outcomes item");
      }
    }

    if (run.workflow_constraints.bounded_scope !== undefined) {
      assertRecord(run.workflow_constraints.bounded_scope, "workflow_constraints.bounded_scope");
      assertEnum(
        run.workflow_constraints.bounded_scope.kind,
        ["converge_pass"],
        "workflow_constraints.bounded_scope.kind",
      );
      assertPlainString(
        run.workflow_constraints.bounded_scope.pass_id,
        "workflow_constraints.bounded_scope.pass_id",
      );
      assertRepoRelativePath(
        run.workflow_constraints.bounded_scope.objective_path,
        "workflow_constraints.bounded_scope.objective_path",
      );
      assertStringArray(
        run.workflow_constraints.bounded_scope.finding_ids,
        "workflow_constraints.bounded_scope.finding_ids",
      );
      assertStringArray(
        run.workflow_constraints.bounded_scope.story_ids,
        "workflow_constraints.bounded_scope.story_ids",
      );
      assertPraxisPath(
        run.workflow_constraints.bounded_scope.brief_path,
        "workflow_constraints.bounded_scope.brief_path",
      );
    }

    if (run.workflow_constraints.commit_per_story !== undefined) {
      assertRecord(
        run.workflow_constraints.commit_per_story,
        "workflow_constraints.commit_per_story",
      );
      assertBoolean(
        run.workflow_constraints.commit_per_story.enabled,
        "workflow_constraints.commit_per_story.enabled",
      );
      if (run.workflow_constraints.commit_per_story.last_verified_head !== null) {
        assertPlainString(
          run.workflow_constraints.commit_per_story.last_verified_head,
          "workflow_constraints.commit_per_story.last_verified_head",
        );
      }
      if (run.workflow_constraints.commit_per_story.pending_story_id !== null) {
        assertPlainString(
          run.workflow_constraints.commit_per_story.pending_story_id,
          "workflow_constraints.commit_per_story.pending_story_id",
        );
      }
    }
  }

  if (run.audit_status !== undefined) {
    assertEnum(run.audit_status, ["clean", "degraded"], "audit_status");
  }
  if (run.audit_warnings !== undefined) {
    assertStringArray(run.audit_warnings, "audit_warnings");
  }
}

export function validateStageResult(result: StageResultRecord): void {
  assertRecord(result, "stage result");

  if (result.version < 2) {
    throw new ContractError("stage result version must be >= 2");
  }

  if (result.run_id !== null && typeof result.run_id !== "string") {
    throw new ContractError("run_id must be a string or null");
  }

  assertPlainString(result.dispatch_id, "dispatch_id");
  if (result.session_id !== undefined && result.session_id !== null) {
    assertPlainString(result.session_id, "session_id");
  }
  assertEnum(result.stage, STAGE_NAMES, "stage");
  assertPlainString(result.artifact_dir, "artifact_dir");
  assertEnum(result.status, STAGE_RESULT_STATUS, "status");
  if (result.summary_path !== null) {
    assertPlainString(result.summary_path, "summary_path");
  }
  assertStringArray(result.artifacts_written, "artifacts_written");

  assertRecord(result.route, "route");
  assertEnum(result.route.kind, ROUTE_KINDS, "route.kind");

  if (result.route.next_stage !== null) {
    assertEnum(result.route.next_stage, STAGE_NAMES, "route.next_stage");
    throw new ContractError(
      "route.next_stage must be null because next-stage routing is runtime-derived",
    );
  }
  if (result.route.next_slice_id !== null) {
    assertPlainString(result.route.next_slice_id, "route.next_slice_id");
    throw new ContractError(
      "route.next_slice_id must be null because next-slice routing is runtime-derived",
    );
  }

  assertPraxisPath(result.summary_path, "summary_path");

  for (const path of result.artifacts_written) {
    assertPlainString(path, "artifacts_written item");
    assertPraxisPath(path, "artifacts_written item");
  }

  assertRecord(result.data, "data");
  if (!result.data.outcome_code || typeof result.data.outcome_code !== "string") {
    throw new ContractError("data.outcome_code is required");
  }

  assertBoolean(result.needs_user_input, "needs_user_input");
  assertBoolean(result.needs_confirmation, "needs_confirmation");

  if (result.input_artifacts !== undefined) {
    assertStringArray(result.input_artifacts, "input_artifacts");
    for (const path of result.input_artifacts) {
      assertPraxisPath(path, "input_artifacts item");
    }
  }

  if (result.output_artifacts !== undefined) {
    assertStringArray(result.output_artifacts, "output_artifacts");
    for (const path of result.output_artifacts) {
      assertPraxisPath(path, "output_artifacts item");
    }
  }

  if (result.worker) {
    assertRecord(result.worker, "worker");
    assertEnum(result.worker.worker_class, WORKER_CLASSES, "worker.worker_class");
    if (result.worker.worker_id !== null) {
      assertPlainString(result.worker.worker_id, "worker.worker_id");
    }
    if (result.worker.adapter !== null) {
      assertEnum(result.worker.adapter, ADAPTER_NAMES, "worker.adapter");
    }
    if (result.worker.session_id !== null) {
      assertPlainString(result.worker.session_id, "worker.session_id");
    }
  }

  if (result.execution !== undefined) {
    assertRecord(result.execution, "execution");
    const permissionProfiles = [
      "planning",
      "design",
      "implementation",
      "review",
      "verification",
    ] as const;
    const worktreeModes = ["shared"] as const;
    assertEnum(
      result.execution.permission_profile,
      permissionProfiles,
      "execution.permission_profile",
    );
    assertEnum(result.execution.worktree_mode, worktreeModes, "execution.worktree_mode");
    assertBoolean(result.execution.fresh_context, "execution.fresh_context");
    assertBoolean(result.execution.resumed, "execution.resumed");
  }

  if (result.verification !== undefined) {
    assertRecord(result.verification, "verification");
    assertBoolean(result.verification.tests_run, "verification.tests_run");
    assertBoolean(result.verification.diff_reviewed, "verification.diff_reviewed");
  }

  if (result.tool_uses !== undefined) {
    if (!Array.isArray(result.tool_uses)) {
      throw new ContractError("tool_uses must be an array");
    }
    for (const [index, toolUse] of result.tool_uses.entries()) {
      assertRecord(toolUse, `tool_uses[${String(index)}]`);
      assertPlainString(toolUse.tool, `tool_uses[${String(index)}].tool`);
      assertEnum(toolUse.kind, TOOL_KINDS, `tool_uses[${String(index)}].kind`);
      assertEnum(toolUse.status, TOOL_USE_STATUS, `tool_uses[${String(index)}].status`);
      if (toolUse.target_path !== undefined && toolUse.target_path !== null) {
        assertRepoRelativePath(toolUse.target_path, `tool_uses[${String(index)}].target_path`);
      }
      if (toolUse.reason !== undefined && toolUse.reason !== null) {
        assertPlainString(toolUse.reason, `tool_uses[${String(index)}].reason`);
      }
    }
  }

  if (result.handoff !== undefined && result.handoff !== null) {
    assertRecord(result.handoff, "handoff");
  }
}

export function validateConvergeStageResult(result: ConvergeStageResultRecord): void {
  assertRecord(result, "converge stage result");

  if (result.version < 1) {
    throw new ContractError("converge stage result version must be >= 1");
  }

  assertEnum(result.stage, CONVERGE_STAGE_NAMES, "converge stage result stage");
  assertEnum(result.status, STAGE_RESULT_STATUS, "converge stage result status");
  if (result.profile !== undefined) {
    assertEnum(result.profile, CONVERGE_PROFILES, "converge stage result profile");
  }
  if (result.review_id !== undefined) {
    assertPlainString(result.review_id, "converge stage result review_id");
  }

  assertRecord(result.route, "converge stage result route");
  assertEnum(result.route.kind, ROUTE_KINDS, "converge stage result route.kind");

  assertRecord(result.data, "converge stage result data");
  assertPlainString(result.data.outcome_code, "converge stage result data.outcome_code");
}

export function validateDispatchRecord(dispatch: DispatchRecord): void {
  if (dispatch.version < 1) {
    throw new ContractError("dispatch.version must be >= 1");
  }

  assertWorkflowName(dispatch.workflow, "dispatch.workflow");
  assertEnum(dispatch.stage, STAGE_NAMES, "dispatch.stage");
  assertEnum(dispatch.worker.adapter, ADAPTER_NAMES, "dispatch.worker.adapter");
  assertEnum(dispatch.scope, RUN_SCOPES, "dispatch.scope");
  assertEnum(dispatch.worker.mode, DISPATCH_WORKER_MODES, "dispatch.worker.mode");
  assertEnum(dispatch.worker.worker_class, WORKER_CLASSES, "dispatch.worker.worker_class");
  assertEnum(dispatch.execution.worktree_mode, WORKTREE_MODES, "dispatch.execution.worktree_mode");
  assertBoolean(dispatch.execution.fresh_context, "dispatch.execution.fresh_context");
  assertPlainString(dispatch.execution.workspace_root, "dispatch.execution.workspace_root");
  assertEnum(
    dispatch.execution.workspace_origin,
    ["shared"],
    "dispatch.execution.workspace_origin",
  );
  assertEnum(dispatch.tool_policy.profile, PERMISSION_PROFILES, "dispatch.tool_policy.profile");

  assertPraxisPath(dispatch.artifact_dir, "dispatch.artifact_dir");
  assertPraxisPath(dispatch.stage_result_path, "dispatch.stage_result_path");

  for (const path of dispatch.inputs.required_artifacts) {
    assertPraxisPath(path, "required_artifacts item");
  }

  assertPlainString(dispatch.contract.stage_goal, "dispatch.contract.stage_goal");
  assertStringArray(dispatch.contract.stage_instructions, "dispatch.contract.stage_instructions");
  for (const instruction of dispatch.contract.stage_instructions) {
    assertPlainString(instruction, "dispatch.contract.stage_instructions item");
  }
  assertStringArray(
    dispatch.contract.expected_output_artifacts,
    "dispatch.contract.expected_output_artifacts",
  );
  for (const path of dispatch.contract.expected_output_artifacts) {
    assertPraxisPath(path, "dispatch.contract.expected_output_artifacts item");
  }
  assertPraxisPath(dispatch.contract.primary_output, "dispatch.contract.primary_output");

  assertStringArray(
    dispatch.context_manifest.declared_inputs,
    "dispatch.context_manifest.declared_inputs",
  );
  for (const path of dispatch.context_manifest.declared_inputs) {
    assertPraxisPath(path, "dispatch.context_manifest.declared_inputs item");
  }
  assertPraxisPath(
    dispatch.context_manifest.boundary_handoff_path,
    "dispatch.context_manifest.boundary_handoff_path",
  );
  for (const [index, surface] of dispatch.context_manifest.instruction_surfaces.entries()) {
    assertRecord(surface, `dispatch.context_manifest.instruction_surfaces[${String(index)}]`);
    assertRepoRelativePath(
      surface.path,
      `dispatch.context_manifest.instruction_surfaces[${String(index)}].path`,
    );
    assertEnum(
      surface.kind,
      ["file", "directory"],
      `dispatch.context_manifest.instruction_surfaces[${String(index)}].kind`,
    );
    assertEnum(
      surface.provider,
      ["shared", "codex", "claude"],
      `dispatch.context_manifest.instruction_surfaces[${String(index)}].provider`,
    );
    assertBoolean(
      surface.authoritative,
      `dispatch.context_manifest.instruction_surfaces[${String(index)}].authoritative`,
    );
    assertBoolean(
      surface.exists,
      `dispatch.context_manifest.instruction_surfaces[${String(index)}].exists`,
    );
    assertPlainString(
      surface.description,
      `dispatch.context_manifest.instruction_surfaces[${String(index)}].description`,
    );
  }

  for (const path of dispatch.tool_policy.writable_roots) {
    assertRepoRelativePath(path, "dispatch.tool_policy.writable_roots item");
  }
  for (const path of dispatch.tool_policy.blocked_paths) {
    assertRepoRelativePath(path, "dispatch.tool_policy.blocked_paths item");
  }
}

export function validateStoryLedgerRecord(ledger: StoryLedgerRecord): void {
  if (ledger.version < 1) {
    throw new ContractError("story ledger version must be >= 1");
  }

  assertWorkflowName(ledger.workflow, "ledger.workflow");
  assertEnum(ledger.execution_mode, EXECUTION_MODES, "ledger.execution_mode");

  const { order, active, last_completed, items } = ledger.stories;
  const seenOrderIds = new Set<string>();
  for (const storyId of order) {
    assertPlainString(storyId, "stories.order item");
    if (seenOrderIds.has(storyId)) {
      throw new ContractError(`stories.order contains duplicate story id ${storyId}`);
    }
    seenOrderIds.add(storyId);
    if (!(storyId in items)) {
      throw new ContractError(`stories.items missing entry for ${storyId}`);
    }
  }

  const statuses = ["pending", "active", "active_next", "completed"] as const;
  for (const [storyId, story] of Object.entries(items)) {
    if (storyId !== story.id) {
      throw new ContractError(`stories.items key (${storyId}) must match story.id (${story.id})`);
    }
    assertPraxisPath(story.artifact_dir, `stories.items.${storyId}.artifact_dir`);
    assertEnum(story.status, statuses, `stories.items.${storyId}.status`);
    if (story.carry_forward_from !== null && !(story.carry_forward_from in items)) {
      throw new ContractError(
        `stories.items.${storyId}.carry_forward_from references missing story ${story.carry_forward_from}`,
      );
    }
    assertPraxisPath(story.handoff_path, `stories.items.${storyId}.handoff_path`);
  }

  if (active !== null && !(active in items)) {
    throw new ContractError(`stories.active references missing story ${active}`);
  }
  if (last_completed !== null && !(last_completed in items)) {
    throw new ContractError(`stories.last_completed references missing story ${last_completed}`);
  }
}

export function validateWorkerSessionRegistration(payload: WorkerSessionRegistration): void {
  assertPlainString(payload.dispatch_id, "dispatch_id");
  assertPlainString(payload.worker_id, "worker_id");

  if (payload.session_id !== null) {
    assertPlainString(payload.session_id, "session_id");
  }

  if (typeof payload.resumable !== "boolean") {
    throw new ContractError("resumable must be a boolean");
  }

  if (payload.resumable && payload.session_id === null) {
    throw new ContractError("session_id is required when resumable is true");
  }

  assertPlainString(payload.started_at, "started_at");
  if (payload.locator !== null) {
    assertPlainString(payload.locator, "locator");
  }
  if (payload.details !== undefined && payload.details !== null) {
    assertRecord(payload.details, "details");
  }
}

export function validateCampaignRecord(campaign: CampaignRecord): void {
  if (campaign.version < 1) {
    throw new ContractError("campaign.version must be >= 1");
  }
  assertPlainString(campaign.campaign_id, "campaign_id");
  const campaignWorkflow = campaign.workflow as string;
  if (campaignWorkflow === "forge") {
    throw new ContractError(
      "Invalid campaign.workflow: forge. Legacy forge campaigns are unsupported; start a fresh campaign.",
    );
  }
  assertEnum(campaignWorkflow, ["craft"], "campaign.workflow");
  assertEnum(campaign.adapter, ADAPTER_NAMES, "campaign.adapter");
  assertEnum(campaign.profile, CONVERGE_PROFILES, "campaign.profile");
  assertEnum(campaign.severity_threshold, FINDING_SEVERITIES, "campaign.severity_threshold");
  assertEnum(campaign.status, CAMPAIGN_STATUS, "campaign.status");
  if (campaign.stop_reason_code !== null) {
    assertEnum(campaign.stop_reason_code, CAMPAIGN_STOP_REASON_CODES, "campaign.stop_reason_code");
  }
  if (campaign.max_passes < 1) {
    throw new ContractError("campaign.max_passes must be >= 1");
  }
  if (campaign.max_findings_per_pass < 1) {
    throw new ContractError("campaign.max_findings_per_pass must be >= 1");
  }
  if (campaign.max_stories_per_pass < 1) {
    throw new ContractError("campaign.max_stories_per_pass must be >= 1");
  }
  if (campaign.current_pass < 0) {
    throw new ContractError("campaign.current_pass must be >= 0");
  }
  assertBoolean(campaign.commit_per_story, "campaign.commit_per_story");
  assertBoolean(campaign.auto_continue, "campaign.auto_continue");
  assertBoolean(campaign.allow_waive, "campaign.allow_waive");
  assertPlainString(campaign.reason, "campaign.reason");
  assertRecord(campaign.metrics, "campaign.metrics");
  if (
    campaign.metrics.last_unresolved_at_or_above_threshold !== null &&
    campaign.metrics.last_unresolved_at_or_above_threshold < 0
  ) {
    throw new ContractError("campaign.metrics.last_unresolved_at_or_above_threshold must be >= 0");
  }
  if (campaign.metrics.no_progress_passes < 0) {
    throw new ContractError("campaign.metrics.no_progress_passes must be >= 0");
  }
  assertRecord(campaign.objective, "campaign.objective");
  assertPlainString(campaign.objective.source_path, "campaign.objective.source_path");
  assertRepoRelativePath(campaign.objective.normalized_path, "campaign.objective.normalized_path");
  assertEnum(campaign.objective.profile, CONVERGE_PROFILES, "campaign.objective.profile");
  assertStringArray(campaign.objective.scope, "campaign.objective.scope");
  for (const path of campaign.objective.scope) {
    assertRepoRelativePath(path, "campaign.objective.scope item");
  }
}

export function validateChildRunSlotRecord(slot: ChildRunSlotRecord): void {
  if (slot.version < 1) {
    throw new ContractError("child run slot version must be >= 1");
  }
  assertPlainString(slot.campaign_id, "child run slot campaign_id");
  assertPlainString(slot.pass_id, "child run slot pass_id");
  assertPlainString(slot.child_run_id, "child run slot child_run_id");
  assertEnum(slot.status, CHILD_RUN_SLOT_STATUS, "child run slot status");
  assertPlainString(slot.reason, "child run slot reason");
  assertPlainString(slot.updated_at, "child run slot updated_at");
}

export function validateCampaignLedgerRecord(ledger: CampaignLedgerRecord): void {
  if (ledger.version < 1) {
    throw new ContractError("campaign ledger version must be >= 1");
  }
  assertPlainString(ledger.campaign_id, "campaign ledger campaign_id");
  assertEnum(ledger.profile, CONVERGE_PROFILES, "campaign ledger profile");
  assertStringArray(ledger.finding_order, "campaign ledger finding_order");
  assertRecord(ledger.findings, "campaign ledger findings");

  const seenFindingIds = new Set<string>();
  for (const findingId of ledger.finding_order) {
    assertPlainString(findingId, "campaign ledger finding_order item");
    if (seenFindingIds.has(findingId)) {
      throw new ContractError(
        `campaign ledger finding_order contains duplicate finding id ${findingId}`,
      );
    }
    seenFindingIds.add(findingId);
    if (!(findingId in ledger.findings)) {
      throw new ContractError(`campaign ledger missing finding ${findingId}`);
    }
  }

  for (const [findingId, finding] of Object.entries(ledger.findings)) {
    if (finding.finding_id !== findingId) {
      throw new ContractError(
        `campaign finding key ${findingId} must match finding_id ${finding.finding_id}`,
      );
    }
    assertPlainString(finding.fingerprint, `${findingId}.fingerprint`);
    assertPlainString(finding.title, `${findingId}.title`);
    assertEnum(finding.kind, FINDING_KINDS, `${findingId}.kind`);
    assertEnum(finding.severity, FINDING_SEVERITIES, `${findingId}.severity`);
    assertPlainString(finding.category, `${findingId}.category`);
    assertPlainString(finding.summary, `${findingId}.summary`);
    assertPlainString(finding.expected_behavior, `${findingId}.expected_behavior`);
    assertPlainString(finding.current_behavior, `${findingId}.current_behavior`);
    assertStringArray(finding.evidence, `${findingId}.evidence`);
    assertStringArray(finding.objective_refs, `${findingId}.objective_refs`);
    assertStringArray(finding.affected_paths, `${findingId}.affected_paths`);
    for (const path of finding.affected_paths) {
      assertRepoRelativePath(path, `${findingId}.affected_paths item`);
    }
    assertPlainString(finding.recommended_direction, `${findingId}.recommended_direction`);
    assertPlainString(finding.recommended_action, `${findingId}.recommended_action`);
    assertEnum(finding.status, FINDING_STATUS, `${findingId}.status`);
    if (typeof finding.confidence !== "number" || Number.isNaN(finding.confidence)) {
      throw new ContractError(`${findingId}.confidence must be a number`);
    }
    if (finding.confidence < 0 || finding.confidence > 1) {
      throw new ContractError(`${findingId}.confidence must be between 0 and 1`);
    }
    if (finding.introduced_in_pass < 1) {
      throw new ContractError(`${findingId}.introduced_in_pass must be >= 1`);
    }
    if (
      finding.resolved_in_pass !== null &&
      finding.resolved_in_pass < finding.introduced_in_pass
    ) {
      throw new ContractError(`${findingId}.resolved_in_pass must be >= introduced_in_pass`);
    }
    assertStringArray(finding.child_run_ids, `${findingId}.child_run_ids`);
    assertStringArray(finding.story_ids, `${findingId}.story_ids`);
    assertStringArray(finding.commit_refs, `${findingId}.commit_refs`);
    if (finding.last_seen_pass < finding.introduced_in_pass) {
      throw new ContractError(`${findingId}.last_seen_pass must be >= introduced_in_pass`);
    }
  }
}

export function validateGapAssessmentResult(result: GapAssessmentResult): void {
  if (result.version < 1) {
    throw new ContractError("gap assessment result version must be >= 1");
  }
  assertEnum(result.profile, CONVERGE_PROFILES, "gap assessment profile");
  assertPlainString(result.review_id, "gap assessment review_id");
  assertRepoRelativePath(result.target_spec_path, "gap assessment target_spec_path");
  if (!Array.isArray(result.findings)) {
    throw new ContractError("gap assessment findings must be an array");
  }

  for (const [index, finding] of result.findings.entries()) {
    assertPlainString(finding.finding_id, `gap finding ${String(index)}.finding_id`);
    assertPlainString(finding.fingerprint, `gap finding ${String(index)}.fingerprint`);
    assertPlainString(finding.title, `gap finding ${String(index)}.title`);
    assertEnum(finding.kind, FINDING_KINDS, `gap finding ${String(index)}.kind`);
    assertEnum(finding.severity, FINDING_SEVERITIES, `gap finding ${String(index)}.severity`);
    assertPlainString(finding.category, `gap finding ${String(index)}.category`);
    assertPlainString(finding.summary, `gap finding ${String(index)}.summary`);
    assertPlainString(finding.expected_behavior, `gap finding ${String(index)}.expected_behavior`);
    assertPlainString(finding.current_behavior, `gap finding ${String(index)}.current_behavior`);
    assertStringArray(finding.evidence, `gap finding ${String(index)}.evidence`);
    assertStringArray(finding.objective_refs, `gap finding ${String(index)}.objective_refs`);
    assertStringArray(finding.affected_paths, `gap finding ${String(index)}.affected_paths`);
    for (const path of finding.affected_paths) {
      assertRepoRelativePath(path, `gap finding ${String(index)}.affected_paths item`);
    }
    assertPlainString(
      finding.recommended_direction,
      `gap finding ${String(index)}.recommended_direction`,
    );
    assertPlainString(
      finding.recommended_action,
      `gap finding ${String(index)}.recommended_action`,
    );
    if (typeof finding.confidence !== "number" || Number.isNaN(finding.confidence)) {
      throw new ContractError(`gap finding ${String(index)}.confidence must be a number`);
    }
  }
}

// Deprecated compatibility alias; prefer validateGapAssessmentResult.
export function validateObjectiveAssessmentResult(result: ObjectiveAssessmentResult): void {
  validateGapAssessmentResult(result);
}

function validateRemediationSelectionFields(
  fields: RemediationSelectionFields,
  label: string,
): void {
  if (fields.version < 1) {
    throw new ContractError(`${label} version must be >= 1`);
  }
  assertPlainString(fields.campaign_id, `${label} campaign_id`);
  assertPlainString(fields.pass_id, `${label} pass_id`);
  if (fields.pass_number < 1) {
    throw new ContractError(`${label} pass_number must be >= 1`);
  }
  assertPlainString(fields.review_id, `${label} review_id`);
  assertStringArray(fields.selected_finding_ids, `${label} selected_finding_ids`);
  assertStringArray(fields.deferred_finding_ids, `${label} deferred_finding_ids`);
  assertRecord(fields.selection, `${label} selection`);
  assertStringArray(fields.selection.policy, `${label} selection.policy`);
  if (!Array.isArray(fields.selection.selected)) {
    throw new ContractError(`${label} selection.selected must be an array`);
  }
  for (const [index, selected] of fields.selection.selected.entries()) {
    assertPlainString(
      selected.finding_id,
      `${label} selection.selected[${String(index)}].finding_id`,
    );
    if (typeof selected.priority_score !== "number" || Number.isNaN(selected.priority_score)) {
      throw new ContractError(
        `${label} selection.selected[${String(index)}].priority_score must be a number`,
      );
    }
    assertEnum(
      selected.risk,
      ["high", "medium", "low"],
      `${label} selection.selected[${String(index)}].risk`,
    );
    assertStringArray(
      selected.depends_on_finding_ids,
      `${label} selection.selected[${String(index)}].depends_on_finding_ids`,
    );
    assertPlainString(selected.reason, `${label} selection.selected[${String(index)}].reason`);
  }
  if (!Array.isArray(fields.selection.deferred)) {
    throw new ContractError(`${label} selection.deferred must be an array`);
  }
  for (const [index, deferred] of fields.selection.deferred.entries()) {
    assertPlainString(
      deferred.finding_id,
      `${label} selection.deferred[${String(index)}].finding_id`,
    );
    assertPlainString(deferred.reason, `${label} selection.deferred[${String(index)}].reason`);
  }
}

export function validateRemediationMapRecord(remediationMap: RemediationMapRecord): void {
  validateRemediationSelectionFields(remediationMap, "remediation map");
  if (!Array.isArray(remediationMap.slices)) {
    throw new ContractError("remediation map slices must be an array");
  }
  for (const [index, slice] of remediationMap.slices.entries()) {
    assertPlainString(slice.slice_id, `remediation map slices[${String(index)}].slice_id`);
    assertPlainString(slice.title, `remediation map slices[${String(index)}].title`);
    assertStringArray(slice.finding_ids, `remediation map slices[${String(index)}].finding_ids`);
    assertPlainString(slice.objective, `remediation map slices[${String(index)}].objective`);
    assertStringArray(slice.scope, `remediation map slices[${String(index)}].scope`);
    for (const path of slice.scope) {
      assertRepoRelativePath(path, `remediation map slices[${String(index)}].scope item`);
    }
    assertStringArray(slice.non_goals, `remediation map slices[${String(index)}].non_goals`);
    assertStringArray(slice.dependencies, `remediation map slices[${String(index)}].dependencies`);
    assertPlainString(
      slice.done_condition,
      `remediation map slices[${String(index)}].done_condition`,
    );
  }
}

export function validatePassBatchRecord(batch: PassBatchRecord): void {
  validateRemediationSelectionFields(batch, "pass batch");
  if (!Array.isArray(batch.stories)) {
    throw new ContractError("pass batch stories must be an array");
  }
  for (const [index, story] of batch.stories.entries()) {
    assertPlainString(story.story_id, `pass batch stories[${String(index)}].story_id`);
    assertPlainString(story.title, `pass batch stories[${String(index)}].title`);
    assertStringArray(story.finding_ids, `pass batch stories[${String(index)}].finding_ids`);
    assertPlainString(
      story.objective_context,
      `pass batch stories[${String(index)}].objective_context`,
    );
    assertStringArray(story.non_goals, `pass batch stories[${String(index)}].non_goals`);
  }
}

export function validatePassSummaryRecord(summary: PassSummaryRecord): void {
  if (summary.version < 1) {
    throw new ContractError("pass summary version must be >= 1");
  }
  assertPlainString(summary.campaign_id, "pass summary campaign_id");
  assertPlainString(summary.pass_id, "pass summary pass_id");
  if (summary.pass_number < 1) {
    throw new ContractError("pass summary pass_number must be >= 1");
  }
  if (summary.child_run_id !== null) {
    assertPlainString(summary.child_run_id, "pass summary child_run_id");
  }
  assertPlainString(summary.assessment_review_id, "pass summary assessment_review_id");
  assertStringArray(summary.planned_finding_ids, "pass summary planned_finding_ids");
  assertStringArray(summary.completed_story_ids, "pass summary completed_story_ids");
  assertStringArray(summary.produced_commits, "pass summary produced_commits");
  if (summary.reassessment_review_id !== null) {
    assertPlainString(summary.reassessment_review_id, "pass summary reassessment_review_id");
  }
  if (summary.unresolved_at_or_above_threshold < 0) {
    throw new ContractError("pass summary unresolved_at_or_above_threshold must be >= 0");
  }
  assertEnum(
    summary.outcome,
    ["continue", "converged", "needs_operator", "stalled", "budget_exhausted"],
    "pass summary outcome",
  );
}
