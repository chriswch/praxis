import { resolve } from "node:path";
import { readJsonFile } from "../state/index.js";
import { validateStageResult } from "../../contracts/validators.js";
import type { RunRecord, StageName, StageResultRecord } from "../../contracts/model.js";
import { resolveWorkflowTransition } from "../../workflows/index.js";
import {
  InvalidInputError,
  RejectedProgressionError
} from "../../contracts/errors.js";

export type StageResultAcceptance = {
  result: StageResultRecord;
  transition: {
    route_kind: string;
    next_stage: StageName | null;
  };
};

export async function loadAndValidateStageResult(
  repoRoot: string,
  stageResultPath: string,
  run: RunRecord
): Promise<StageResultAcceptance> {
  const absolutePath = resolve(repoRoot, stageResultPath);
  const result = await readJsonFile<StageResultRecord>(absolutePath);

  validateStageResult(result);

  if (result.run_id !== null && result.run_id !== run.run_id) {
    throw new RejectedProgressionError(
      `Stage result run_id mismatch. Expected ${run.run_id}, received ${result.run_id}.`
    );
  }

  if (run.current.stage !== result.stage) {
    throw new RejectedProgressionError(
      `Stage result out of order. Current stage is ${run.current.stage}, received ${result.stage}.`
    );
  }

  if (run.current.artifact_dir !== result.artifact_dir) {
    throw new RejectedProgressionError(
      `Stage result artifact scope mismatch. Current artifact dir is ${run.current.artifact_dir}, received ${result.artifact_dir}.`
    );
  }

  const transition = resolveWorkflowTransition(run.workflow, result);
  if (transition.routeKind !== result.route.kind) {
    throw new InvalidInputError(
      `Stage result route kind mismatch. Expected ${transition.routeKind}, received ${result.route.kind}.`
    );
  }

  return {
    result,
    transition: {
      route_kind: transition.routeKind,
      next_stage: transition.nextStage
    }
  };
}
