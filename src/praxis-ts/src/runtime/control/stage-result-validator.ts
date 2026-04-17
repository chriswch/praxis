import { resolve } from "node:path";
import { readJsonFile } from "../state/index.js";
import { exists } from "../state/store.js";
import { validateStageResult } from "../../contracts/validators.js";
import type {
  DispatchRecord,
  RunRecord,
  StageName,
  StageResultRecord,
} from "../../contracts/model.js";
import { resolveWorkflowTransition } from "../../workflows/index.js";
import { InvalidInputError, RejectedProgressionError } from "../../contracts/errors.js";

export interface StageResultAcceptance {
  result: StageResultRecord;
  transition: {
    route_kind: string;
    next_stage: StageName | null;
  };
}

export async function loadAndValidateStageResult(
  repoRoot: string,
  stageResultPath: string,
  run: RunRecord,
  activeDispatch: DispatchRecord,
): Promise<StageResultAcceptance> {
  if (stageResultPath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(stageResultPath)) {
    throw new InvalidInputError("Stage result path must be a relative .praxis path.");
  }

  const praxisRoot = resolve(repoRoot, ".praxis");
  const absolutePath = resolve(repoRoot, stageResultPath);
  const normalizeForCompare = (value: string): string => value.replaceAll("\\", "/");
  const isUnderPraxisRoot = (value: string): boolean => {
    const candidate = normalizeForCompare(value);
    const root = normalizeForCompare(praxisRoot);
    return candidate === root || candidate.startsWith(`${root}/`);
  };

  if (!isUnderPraxisRoot(absolutePath)) {
    throw new InvalidInputError(
      `Stage result path must resolve under .praxis (received ${stageResultPath}).`,
    );
  }

  const result = await readJsonFile<StageResultRecord>(absolutePath);

  validateStageResult(result);
  await validateResultArtifacts(repoRoot, result);
  validateReportedToolUses(result, activeDispatch);

  if (result.route.next_stage !== null || result.route.next_slice_id !== null) {
    throw new InvalidInputError(
      "Stage result route metadata is derived by runtime; route.next_stage and route.next_slice_id must be null.",
    );
  }

  if (result.run_id !== null && result.run_id !== run.run_id) {
    throw new RejectedProgressionError(
      `Stage result run_id mismatch. Expected ${run.run_id}, received ${result.run_id}.`,
    );
  }

  if (result.dispatch_id !== activeDispatch.dispatch_id) {
    throw new RejectedProgressionError(
      `Stage result dispatch_id mismatch. Expected ${activeDispatch.dispatch_id}, received ${result.dispatch_id}.`,
    );
  }

  const expectedResultPath = resolve(repoRoot, activeDispatch.stage_result_path);
  if (!isUnderPraxisRoot(expectedResultPath)) {
    throw new RejectedProgressionError(
      `Active dispatch stage_result_path is outside .praxis: ${activeDispatch.stage_result_path}.`,
    );
  }

  if (absolutePath !== expectedResultPath) {
    throw new RejectedProgressionError(
      `Stage result path mismatch. Expected ${activeDispatch.stage_result_path}, received ${stageResultPath}.`,
    );
  }

  if (activeDispatch.stage !== result.stage) {
    throw new RejectedProgressionError(
      `Stage result stage mismatch for active dispatch. Dispatch stage is ${activeDispatch.stage}, received ${result.stage}.`,
    );
  }

  if (activeDispatch.artifact_dir !== result.artifact_dir) {
    throw new RejectedProgressionError(
      `Stage result artifact mismatch for active dispatch. Dispatch artifact dir is ${activeDispatch.artifact_dir}, received ${result.artifact_dir}.`,
    );
  }

  if (activeDispatch.run_id !== run.run_id) {
    throw new RejectedProgressionError(
      `Active dispatch run mismatch. Dispatch run is ${activeDispatch.run_id}, expected ${run.run_id}.`,
    );
  }

  if (run.active.session_id !== null) {
    if (result.session_id === undefined || result.session_id === null) {
      throw new RejectedProgressionError(
        `Stage result session_id is required when an active session exists (${run.active.session_id}).`,
      );
    }
    if (result.session_id !== run.active.session_id) {
      throw new RejectedProgressionError(
        `Stage result session_id mismatch. Expected ${run.active.session_id}, received ${result.session_id}.`,
      );
    }
  } else if (result.session_id !== undefined && result.session_id !== null) {
    throw new RejectedProgressionError(
      `Stage result session_id mismatch. Expected null, received ${result.session_id}.`,
    );
  }

  if (run.current.stage !== result.stage) {
    throw new RejectedProgressionError(
      `Stage result out of order. Current stage is ${String(run.current.stage)}, received ${result.stage}.`,
    );
  }

  if (run.current.artifact_dir !== result.artifact_dir) {
    throw new RejectedProgressionError(
      `Stage result artifact scope mismatch. Current artifact dir is ${run.current.artifact_dir}, received ${result.artifact_dir}.`,
    );
  }

  const transition = resolveWorkflowTransition(run.workflow, result);
  if (transition.routeKind !== result.route.kind) {
    throw new InvalidInputError(
      `Stage result route kind mismatch. Expected ${transition.routeKind}, received ${result.route.kind}.`,
    );
  }
  validateRunScopedOutcomeConstraints(run, result);

  return {
    result,
    transition: {
      route_kind: transition.routeKind,
      next_stage: transition.nextStage,
    },
  };
}

function validateRunScopedOutcomeConstraints(run: RunRecord, result: StageResultRecord): void {
  if (result.stage !== "clarifying-intent") {
    return;
  }
  const allowedOutcomes = run.constraints?.clarifying_allowed_outcomes;
  if (!allowedOutcomes || allowedOutcomes.length === 0) {
    return;
  }
  if (allowedOutcomes.includes(result.data.outcome_code)) {
    return;
  }
  throw new InvalidInputError(
    `Outcome ${result.data.outcome_code} is outside the bounded clarifying-intent scope for this run. Allowed outcomes: ${allowedOutcomes.join(", ")}.`,
  );
}

function validateReportedToolUses(result: StageResultRecord, activeDispatch: DispatchRecord): void {
  for (const toolUse of result.tool_uses ?? []) {
    if (
      toolUse.kind === "network" &&
      toolUse.status === "granted" &&
      activeDispatch.tool_policy.network !== "enabled"
    ) {
      throw new InvalidInputError(
        `Stage result reports granted network access for ${result.stage}, but the dispatch policy restricts network access.`,
      );
    }

    if (toolUse.status !== "granted" || !toolUse.target_path) {
      continue;
    }

    const targetPath = normalizeRepoRelativePath(toolUse.target_path);
    if (
      activeDispatch.tool_policy.blocked_paths.some((blockedPath) =>
        pathMatchesRoot(targetPath, blockedPath),
      )
    ) {
      throw new InvalidInputError(
        `Stage result reports granted access to blocked path ${toolUse.target_path}.`,
      );
    }

    if (
      !activeDispatch.tool_policy.writable_roots.some((root) => pathMatchesRoot(targetPath, root))
    ) {
      throw new InvalidInputError(
        `Stage result reports granted access outside writable roots: ${toolUse.target_path}.`,
      );
    }
  }
}

function normalizeRepoRelativePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function pathMatchesRoot(path: string, root: string): boolean {
  const normalizedPath = normalizeRepoRelativePath(path);
  const normalizedRoot = normalizeRepoRelativePath(root);
  if (normalizedRoot === "." || normalizedRoot === "") {
    return true;
  }
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

async function validateResultArtifacts(repoRoot: string, result: StageResultRecord): Promise<void> {
  const requiredPaths = new Set<string>();

  if (result.summary_path) {
    requiredPaths.add(result.summary_path);
  }

  for (const artifactPath of result.artifacts_written) {
    requiredPaths.add(artifactPath);
  }

  for (const artifactPath of result.output_artifacts ?? []) {
    requiredPaths.add(artifactPath);
  }

  const missingPaths: string[] = [];
  for (const artifactPath of requiredPaths) {
    const absoluteArtifactPath = resolve(repoRoot, artifactPath);
    if (!(await exists(absoluteArtifactPath))) {
      missingPaths.push(artifactPath);
    }
  }

  if (missingPaths.length > 0) {
    throw new InvalidInputError(
      `Stage result declares missing artifacts: ${missingPaths.join(", ")}.`,
    );
  }
}
