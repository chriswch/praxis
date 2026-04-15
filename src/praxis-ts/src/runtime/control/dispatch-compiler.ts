import { join } from "node:path";
import type { DispatchRecord, RunRecord } from "../../contracts/model.js";
import { buildDispatchId } from "../common/ids.js";
import { nowIsoUtc } from "../common/time.js";
import { expectedInputArtifactsForTransition } from "../../workflows/index.js";
import { buildToolPolicy } from "../tools/index.js";
import { buildInstructionSurfaceManifest } from "../workers/context-manifest.js";
import { buildStageContract } from "../workers/stage-contract.js";

export type DispatchCompileInput = {
  run: RunRecord;
  boundaryHandoff: Record<string, unknown> | null;
  repoRoot: string;
};

export function compileDispatch(input: DispatchCompileInput): DispatchRecord {
  const { run, boundaryHandoff, repoRoot } = input;
  const stage = run.current.stage;

  if (!stage) {
    throw new Error("Cannot compile dispatch for a run without an active stage.");
  }

  const artifactDir = run.current.artifact_dir;
  const dispatchId = buildDispatchId();
  const policy = buildToolPolicy(stage);
  const requiredArtifacts = expectedInputArtifactsForTransition(run, {
    from_stage: run.routing.entered_from_stage,
    from_outcome_code: run.routing.entered_from_outcome_code
  });
  const workerMode = run.active.resumable ? "same_stage_resume" : "fresh_session";

  return {
    version: 1,
    dispatch_id: dispatchId,
    run_id: run.run_id,
    workflow: run.workflow,
    stage,
    scope: run.current.scope,
    slice_id: run.current.slice_id,
    artifact_dir: artifactDir,
    stage_result_path: join(artifactDir, "results", `${stage}.json`).replace(/\\/g, "/"),
    created_at: nowIsoUtc(),
    inputs: {
      required_artifacts: requiredArtifacts,
      boundary_handoff: boundaryHandoff
    },
    contract: buildStageContract(run.workflow, stage, artifactDir),
    context_manifest: {
      declared_inputs: requiredArtifacts,
      boundary_handoff_path: run.routing.boundary_handoff_path,
      instruction_surfaces: buildInstructionSurfaceManifest(repoRoot)
    },
    worker: {
      adapter: run.runtime.adapter,
      mode: workerMode,
      worker_class: "session_worker"
    },
    execution: {
      fresh_context: true,
      worktree_mode: "shared"
    },
    tool_policy: {
      writable_roots: policy.writable_roots,
      blocked_paths: policy.blocked_paths,
      network: policy.network,
      profile: policy.profile
    }
  };
}
