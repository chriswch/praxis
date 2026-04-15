import {
  ADAPTER_NAMES,
  EXECUTION_MODES,
  ROUTE_KINDS,
  RUN_STATUS,
  STAGE_NAMES,
  STAGE_RESULT_STATUS,
  WORKFLOW_NAMES,
  type DispatchRecord,
  type RunRecord,
  type StageResultRecord
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

  if (!value.startsWith(".praxis")) {
    throw new ContractError(`${label} must be scoped under .praxis: ${value}`);
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

  if (run.current.stage !== null) {
    assertEnum(run.current.stage, STAGE_NAMES, "current.stage");
  }

  if (run.routing.next_stage !== null) {
    assertEnum(run.routing.next_stage, STAGE_NAMES, "routing.next_stage");
  }

  assertPraxisPath(run.current.artifact_dir, "current.artifact_dir");
  assertPraxisPath(run.routing.boundary_handoff_path, "routing.boundary_handoff_path");
}

export function validateStageResult(result: StageResultRecord): void {
  if (result.version < 2) {
    throw new ContractError("stage result version must be >= 2");
  }

  assertEnum(result.stage, STAGE_NAMES, "stage");
  assertEnum(result.status, STAGE_RESULT_STATUS, "status");
  assertEnum(result.route.kind, ROUTE_KINDS, "route.kind");

  if (result.route.next_stage !== null) {
    assertEnum(result.route.next_stage, STAGE_NAMES, "route.next_stage");
  }

  assertPraxisPath(result.artifact_dir, "artifact_dir");
  assertPraxisPath(result.summary_path, "summary_path");

  for (const path of result.artifacts_written) {
    assertPraxisPath(path, "artifacts_written item");
  }

  if (!result.data.outcome_code || typeof result.data.outcome_code !== "string") {
    throw new ContractError("data.outcome_code is required");
  }
}

export function validateDispatchRecord(dispatch: DispatchRecord): void {
  if (dispatch.version < 1) {
    throw new ContractError("dispatch.version must be >= 1");
  }

  assertEnum(dispatch.workflow, WORKFLOW_NAMES, "dispatch.workflow");
  assertEnum(dispatch.stage, STAGE_NAMES, "dispatch.stage");
  assertEnum(dispatch.worker.adapter, ADAPTER_NAMES, "dispatch.worker.adapter");

  assertPraxisPath(dispatch.artifact_dir, "dispatch.artifact_dir");
  assertPraxisPath(dispatch.stage_result_path, "dispatch.stage_result_path");

  for (const path of dispatch.inputs.required_artifacts) {
    assertPraxisPath(path, "required_artifacts item");
  }
}
