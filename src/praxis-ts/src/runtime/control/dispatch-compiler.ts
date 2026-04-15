import { join } from "node:path";
import type { DispatchRecord, RunRecord } from "../../contracts/model.js";
import { buildDispatchId } from "../common/ids.js";
import { nowIsoUtc } from "../common/time.js";
import { expectedInputArtifacts } from "../../workflows/index.js";
import { buildToolPolicy } from "../tools/index.js";

export type DispatchCompileInput = {
  run: RunRecord;
  boundaryHandoff: Record<string, unknown> | null;
};

export function compileDispatch(input: DispatchCompileInput): DispatchRecord {
  const { run, boundaryHandoff } = input;
  const stage = run.current.stage;

  if (!stage) {
    throw new Error("Cannot compile dispatch for a run without an active stage.");
  }

  const artifactDir = run.current.artifact_dir;
  const dispatchId = buildDispatchId();
  const policy = buildToolPolicy(stage);

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
      required_artifacts: expectedInputArtifacts(run),
      boundary_handoff: boundaryHandoff
    },
    worker: {
      adapter: run.runtime.adapter,
      mode: run.active.resumable ? "same_stage_resume" : "fresh_session"
    },
    tool_policy: {
      writable_roots: policy.writable_roots,
      blocked_paths: policy.blocked_paths,
      network: policy.network
    }
  };
}
