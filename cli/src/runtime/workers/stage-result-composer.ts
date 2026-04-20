import { readJsonFile } from "../state/store.js";
import { resolveWorkflowOutcome } from "../../workflows/index.js";
import { STAGE_RESULT_STATUS, STAGE_NAMES, WORKFLOW_NAMES } from "../../contracts/model.js";
import type {
  StageName,
  StageResultRecord,
  StageResultStatus,
  WorkflowName,
} from "../../contracts/model.js";
import type { WorkerLaunchPayload } from "../control/types.js";

export interface RoutingPayload {
  outcome_code: string;
  status: StageResultStatus;
  summary_path?: string | null;
  artifacts_written?: string[];
  data?: Record<string, unknown>;
  input_artifacts?: string[];
  output_artifacts?: string[];
  needs_user_input?: boolean;
  needs_confirmation?: boolean;
  handoff?: Record<string, unknown> | null;
  verification?: {
    tests_run: boolean;
    diff_reviewed: boolean;
  };
}

export class RoutingPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutingPayloadError";
  }
}

export async function readRoutingPayload(scratchPath: string): Promise<RoutingPayload> {
  let raw: unknown;
  try {
    raw = await readJsonFile<unknown>(scratchPath);
  } catch (error) {
    throw new RoutingPayloadError(
      `Routing payload missing or unreadable at ${scratchPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return parseRoutingPayload(raw);
}

export function parseRoutingPayload(raw: unknown): RoutingPayload {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new RoutingPayloadError("Routing payload must be a JSON object.");
  }
  const record = raw as Record<string, unknown>;

  const outcomeCode = record.outcome_code;
  if (typeof outcomeCode !== "string" || outcomeCode.trim().length === 0) {
    throw new RoutingPayloadError("Routing payload must include a non-empty outcome_code string.");
  }

  const status = record.status;
  if (typeof status !== "string" || !(STAGE_RESULT_STATUS as readonly string[]).includes(status)) {
    throw new RoutingPayloadError(
      `Routing payload status must be one of ${STAGE_RESULT_STATUS.join(", ")}.`,
    );
  }

  const payload: RoutingPayload = {
    outcome_code: outcomeCode,
    status: status as StageResultStatus,
  };

  if (record.summary_path !== undefined) {
    if (record.summary_path !== null && typeof record.summary_path !== "string") {
      throw new RoutingPayloadError("Routing payload summary_path must be a string or null.");
    }
    payload.summary_path = record.summary_path;
  }

  if (record.artifacts_written !== undefined) {
    if (!isStringArray(record.artifacts_written)) {
      throw new RoutingPayloadError("Routing payload artifacts_written must be a string array.");
    }
    payload.artifacts_written = record.artifacts_written;
  }

  if (record.input_artifacts !== undefined) {
    if (!isStringArray(record.input_artifacts)) {
      throw new RoutingPayloadError("Routing payload input_artifacts must be a string array.");
    }
    payload.input_artifacts = record.input_artifacts;
  }

  if (record.output_artifacts !== undefined) {
    if (!isStringArray(record.output_artifacts)) {
      throw new RoutingPayloadError("Routing payload output_artifacts must be a string array.");
    }
    payload.output_artifacts = record.output_artifacts;
  }

  if (record.data !== undefined) {
    if (record.data === null || typeof record.data !== "object" || Array.isArray(record.data)) {
      throw new RoutingPayloadError("Routing payload data must be an object.");
    }
    payload.data = record.data as Record<string, unknown>;
  }

  if (record.needs_user_input !== undefined) {
    if (typeof record.needs_user_input !== "boolean") {
      throw new RoutingPayloadError("Routing payload needs_user_input must be a boolean.");
    }
    payload.needs_user_input = record.needs_user_input;
  }

  if (record.needs_confirmation !== undefined) {
    if (typeof record.needs_confirmation !== "boolean") {
      throw new RoutingPayloadError("Routing payload needs_confirmation must be a boolean.");
    }
    payload.needs_confirmation = record.needs_confirmation;
  }

  if (record.handoff !== undefined) {
    if (
      record.handoff !== null &&
      (typeof record.handoff !== "object" || Array.isArray(record.handoff))
    ) {
      throw new RoutingPayloadError("Routing payload handoff must be an object or null.");
    }
    payload.handoff = record.handoff as Record<string, unknown> | null;
  }

  if (record.verification !== undefined) {
    const verification = record.verification;
    if (
      verification === null ||
      typeof verification !== "object" ||
      Array.isArray(verification) ||
      typeof (verification as Record<string, unknown>).tests_run !== "boolean" ||
      typeof (verification as Record<string, unknown>).diff_reviewed !== "boolean"
    ) {
      throw new RoutingPayloadError(
        "Routing payload verification must be {tests_run: boolean, diff_reviewed: boolean}.",
      );
    }
    payload.verification = verification as { tests_run: boolean; diff_reviewed: boolean };
  }

  return payload;
}

export function composeStageResult(
  launch: WorkerLaunchPayload,
  sessionId: string | null,
  payload: RoutingPayload,
): StageResultRecord {
  const workflow = launch.workflow as WorkflowName;
  if (!(WORKFLOW_NAMES as readonly string[]).includes(workflow)) {
    throw new RoutingPayloadError(`Unknown workflow on launch payload: ${launch.workflow}.`);
  }
  const stage = launch.stage as StageName;
  if (!(STAGE_NAMES as readonly string[]).includes(stage)) {
    throw new RoutingPayloadError(`Unknown stage on launch payload: ${launch.stage}.`);
  }

  const transition = resolveWorkflowOutcome(workflow, stage, payload.outcome_code);

  const data: StageResultRecord["data"] = {
    ...(payload.data ?? {}),
    outcome_code: payload.outcome_code,
  };

  const result: StageResultRecord = {
    version: 2,
    run_id: launch.run_id,
    dispatch_id: launch.dispatch_id,
    session_id: sessionId,
    stage,
    artifact_dir: launch.artifact_dir,
    status: payload.status,
    summary_path: payload.summary_path ?? null,
    artifacts_written: payload.artifacts_written ?? [],
    route: {
      kind: transition.routeKind,
      next_stage: null,
      next_slice_id: null,
    },
    data,
    needs_user_input: payload.needs_user_input ?? false,
    needs_confirmation: payload.needs_confirmation ?? false,
  };

  if (payload.input_artifacts !== undefined) {
    result.input_artifacts = payload.input_artifacts;
  }
  if (payload.output_artifacts !== undefined) {
    result.output_artifacts = payload.output_artifacts;
  }
  if (payload.handoff !== undefined) {
    result.handoff = payload.handoff;
  }
  if (payload.verification !== undefined) {
    result.verification = payload.verification;
  }

  return result;
}

export function routingScratchPathFor(stageResultPath: string): string {
  if (stageResultPath.endsWith(".json")) {
    return `${stageResultPath.slice(0, -".json".length)}.draft.json`;
  }
  return `${stageResultPath}.draft.json`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
