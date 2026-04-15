import { posix } from "node:path";
import {
  ADAPTER_NAMES,
  DISPATCH_WORKER_MODES,
  EXECUTION_MODES,
  ROUTE_KINDS,
  RUN_NEXT_ACTIONS,
  RUN_SCOPES,
  RUN_STATUS,
  STAGE_NAMES,
  STAGE_RESULT_STATUS,
  WORKER_CLASSES,
  WORKFLOW_NAMES,
  type DispatchRecord,
  type RunRecord,
  type StageResultRecord,
  type StoryLedgerRecord,
  type WorkerSessionRegistration
} from "./model.js";

export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}

function assertEnum<T extends string>(value: string, allowed: readonly T[], label: string): asserts value is T {
  if (!allowed.includes(value as T)) {
    throw new ContractError(`Invalid ${label}: ${value}. Allowed: ${allowed.join(", ")}.`);
  }
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
      throw new ContractError(`${label}[${index}] must be a string`);
    }
  }
}

export function validateRunRecord(run: RunRecord): void {
  if (run.version < 1) {
    throw new ContractError("run.version must be >= 1");
  }

  assertEnum(run.workflow, WORKFLOW_NAMES, "workflow");
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
  }
  if (result.route.next_slice_id !== null) {
    assertPlainString(result.route.next_slice_id, "route.next_slice_id");
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
    const permissionProfiles = ["planning", "design", "implementation", "review", "verification"] as const;
    const worktreeModes = ["shared", "isolated"] as const;
    assertEnum(result.execution.permission_profile, permissionProfiles, "execution.permission_profile");
    assertEnum(result.execution.worktree_mode, worktreeModes, "execution.worktree_mode");
    assertBoolean(result.execution.fresh_context, "execution.fresh_context");
    assertBoolean(result.execution.resumed, "execution.resumed");
  }

  if (result.verification !== undefined) {
    assertRecord(result.verification, "verification");
    assertBoolean(result.verification.tests_run, "verification.tests_run");
    assertBoolean(result.verification.diff_reviewed, "verification.diff_reviewed");
  }

  if (result.handoff !== undefined && result.handoff !== null) {
    assertRecord(result.handoff, "handoff");
  }
}

export function validateDispatchRecord(dispatch: DispatchRecord): void {
  if (dispatch.version < 1) {
    throw new ContractError("dispatch.version must be >= 1");
  }

  assertEnum(dispatch.workflow, WORKFLOW_NAMES, "dispatch.workflow");
  assertEnum(dispatch.stage, STAGE_NAMES, "dispatch.stage");
  assertEnum(dispatch.worker.adapter, ADAPTER_NAMES, "dispatch.worker.adapter");
  assertEnum(dispatch.scope, RUN_SCOPES, "dispatch.scope");
  assertEnum(dispatch.worker.mode, DISPATCH_WORKER_MODES, "dispatch.worker.mode");

  assertPraxisPath(dispatch.artifact_dir, "dispatch.artifact_dir");
  assertPraxisPath(dispatch.stage_result_path, "dispatch.stage_result_path");

  for (const path of dispatch.inputs.required_artifacts) {
    assertPraxisPath(path, "required_artifacts item");
  }
}

export function validateStoryLedgerRecord(ledger: StoryLedgerRecord): void {
  if (ledger.version < 1) {
    throw new ContractError("story ledger version must be >= 1");
  }

  assertEnum(ledger.workflow, WORKFLOW_NAMES, "ledger.workflow");
  assertEnum(ledger.execution_mode, EXECUTION_MODES, "ledger.execution_mode");

  const { order, active, last_completed, items } = ledger.stories;
  const seenOrderIds = new Set<string>();
  for (const storyId of order) {
    assertPlainString(storyId, "stories.order item");
    if (seenOrderIds.has(storyId)) {
      throw new ContractError(`stories.order contains duplicate story id ${storyId}`);
    }
    seenOrderIds.add(storyId);
    if (!items[storyId]) {
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
    if (story.carry_forward_from !== null && !items[story.carry_forward_from]) {
      throw new ContractError(
        `stories.items.${storyId}.carry_forward_from references missing story ${story.carry_forward_from}`
      );
    }
    assertPraxisPath(story.handoff_path, `stories.items.${storyId}.handoff_path`);
  }

  if (active !== null && !items[active]) {
    throw new ContractError(`stories.active references missing story ${active}`);
  }
  if (last_completed !== null && !items[last_completed]) {
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
}
