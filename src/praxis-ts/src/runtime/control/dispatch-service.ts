import { join } from "node:path";
import { readJsonFile } from "../state/index.js";
import { nowIsoUtc } from "../common/time.js";
import { compileDispatch } from "./dispatch-compiler.js";
import { ToolTelemetry } from "../tools/index.js";
import { exists } from "../state/store.js";
import { prepareIsolatedWorkspace } from "../workers/worktree-manager.js";
import {
  validateWorkerSessionRegistration
} from "../../contracts/validators.js";
import { BlockedStateError, RejectedProgressionError } from "../../contracts/errors.js";
import type { DispatchRecord, RunRecord, WorkerSessionRegistration } from "../../contracts/model.js";
import type { PraxisStateRepository } from "../state/repository.js";
import type { RegisterWorkerSessionOutcome, WorkerLaunchPayload } from "./types.js";

export class DispatchService {
  constructor(private readonly repo: PraxisStateRepository) {}

  async createDispatch(): Promise<DispatchRecord> {
    const run = await this.repo.loadRun();
    if (!run) {
      throw new BlockedStateError("No active run found at .praxis/run.json.");
    }
    this.assertDispatchLaunchAllowed(run, "dispatch");
    if (run.active.dispatch_id) {
      throw new RejectedProgressionError(
        `Dispatch ${run.active.dispatch_id} is already active. Submit a stage result, register a worker session, or cancel before creating another dispatch.`
      );
    }

    const handoffData = await this.loadBoundaryHandoffOrBlock(run, "dispatch");

    const dispatch = compileDispatch({ run, boundaryHandoff: handoffData, repoRoot: this.repo.paths.root });
    await this.ensureRequiredArtifactsExistOrBlock(run, dispatch.inputs.required_artifacts, "dispatch");
    if (dispatch.execution.worktree_mode === "isolated") {
      const workspace = await prepareIsolatedWorkspace(this.repo.paths.root, dispatch.dispatch_id);
      dispatch.execution.workspace_root = workspace.workspace_root;
      dispatch.execution.workspace_origin = workspace.workspace_origin;
      await this.repo.saveWorktreeRecord(dispatch.dispatch_id, {
        version: 1,
        run_id: run.run_id,
        dispatch_id: dispatch.dispatch_id,
        stage: dispatch.stage,
        workspace_root: workspace.workspace_root,
        workspace_origin: workspace.workspace_origin,
        created_at: dispatch.created_at
      });
    }
    await this.repo.saveDispatch(dispatch);
    const telemetry = new ToolTelemetry(this.repo);
    await telemetry.recordPolicyDecision({
      run_id: run.run_id,
      stage: dispatch.stage,
      dispatch_id: dispatch.dispatch_id,
      policy: dispatch.tool_policy
    });

    run.active.dispatch_id = dispatch.dispatch_id;
    if (!run.active.resumable) {
      run.active.worker_id = null;
      run.active.session_id = null;
    }
    run.timestamps.updated_at = nowIsoUtc();
    run.routing.reason = `Dispatch ${dispatch.dispatch_id} prepared for ${dispatch.stage}.`;

    await this.repo.saveRun(run);
    await this.repo.appendLifecycleEvent({
      ts: run.timestamps.updated_at,
      type: "dispatch_prepared",
      run_id: run.run_id,
      stage: run.current.stage,
      action: "dispatch",
      details: {
        dispatch_id: dispatch.dispatch_id,
        worktree_mode: dispatch.execution.worktree_mode,
        workspace_root: dispatch.execution.workspace_root
      }
    });

    return dispatch;
  }

  async registerWorkerSession(input: WorkerSessionRegistration): Promise<RegisterWorkerSessionOutcome> {
    validateWorkerSessionRegistration(input);

    const run = await this.repo.loadRun();
    if (!run) {
      throw new BlockedStateError("No active run found at .praxis/run.json.");
    }
    if (!run.current.stage) {
      throw new RejectedProgressionError("Cannot register a worker session without an active stage.");
    }
    if (!run.active.dispatch_id) {
      throw new RejectedProgressionError(
        "Cannot register a worker session without an active dispatch. Run `praxis dispatch` first."
      );
    }
    if (run.active.dispatch_id !== input.dispatch_id) {
      throw new RejectedProgressionError(
        `Worker session dispatch mismatch. Expected ${run.active.dispatch_id}, received ${input.dispatch_id}.`
      );
    }

    const dispatch = await this.repo.loadDispatch(run.active.dispatch_id);
    if (!dispatch) {
      throw new BlockedStateError(`Active dispatch ${run.active.dispatch_id} does not exist.`);
    }

    const resumable = input.resumable && input.session_id !== null;
    const sessionRecordId = input.session_id ?? `worker_${input.worker_id}`;
    const now = nowIsoUtc();

    run.active.worker_id = input.worker_id;
    run.active.session_id = input.session_id;
    run.active.resumable = resumable;
    run.timestamps.updated_at = now;
    run.routing.reason = `Worker session registered for ${dispatch.stage} (${input.worker_id}).`;

    await this.repo.saveSessionRecord(sessionRecordId, {
      version: 1,
      run_id: run.run_id,
      dispatch_id: dispatch.dispatch_id,
      stage: dispatch.stage,
      scope: dispatch.scope,
      artifact_dir: dispatch.artifact_dir,
      adapter: dispatch.worker.adapter,
      worker_id: input.worker_id,
      session_id: input.session_id,
      resumable,
      started_at: input.started_at,
      locator: input.locator,
      recorded_at: now,
      provider_details: input.details ?? null
    });
    await this.repo.saveRun(run);
    await this.repo.appendLifecycleEvent({
      ts: now,
      type: "worker_session_registered",
      run_id: run.run_id,
      stage: dispatch.stage,
      action: "register-worker-session",
      details: {
        dispatch_id: dispatch.dispatch_id,
        worker_id: input.worker_id,
        session_id: input.session_id,
        resumable,
        provider_details: input.details ?? null
      }
    });

    return {
      run_id: run.run_id,
      dispatch_id: dispatch.dispatch_id,
      worker_id: input.worker_id,
      session_id: input.session_id,
      resumable,
      stage: run.current.stage,
      reason: run.routing.reason
    };
  }

  async buildWorkerLaunch(): Promise<WorkerLaunchPayload> {
    const run = await this.repo.loadRun();
    if (!run) {
      throw new BlockedStateError("No active run found at .praxis/run.json.");
    }
    this.assertDispatchLaunchAllowed(run, "build-worker-launch");
    if (!run.active.dispatch_id) {
      throw new RejectedProgressionError("No active dispatch found. Run `praxis dispatch` first.");
    }

    const dispatch = await this.repo.loadDispatch(run.active.dispatch_id);
    if (!dispatch) {
      throw new BlockedStateError(`Dispatch ${run.active.dispatch_id} does not exist.`);
    }

    const boundaryHandoff = await this.loadBoundaryHandoffOrBlock(run, "build-worker-launch");
    await this.ensureRequiredArtifactsExistOrBlock(
      run,
      dispatch.inputs.required_artifacts,
      "build-worker-launch"
    );

    return {
      run_id: run.run_id,
      dispatch_id: dispatch.dispatch_id,
      workflow: run.workflow,
      stage: dispatch.stage,
      scope: dispatch.scope,
      artifact_dir: dispatch.artifact_dir,
      stage_result_path: dispatch.stage_result_path,
      contract: dispatch.contract,
      context_manifest: dispatch.context_manifest,
      inputs: {
        required_artifacts: dispatch.inputs.required_artifacts,
        boundary_handoff: boundaryHandoff ?? dispatch.inputs.boundary_handoff
      },
      policy: dispatch.tool_policy,
      worker: {
        adapter: dispatch.worker.adapter,
        mode: dispatch.worker.mode,
        worker_class: dispatch.worker.worker_class,
        resume_session_id: run.active.resumable ? run.active.session_id : null
      },
      execution: dispatch.execution,
      runtime: {
        entrypoint: run.runtime.entrypoint,
        fresh_context_per_story: run.execution.fresh_context_per_story
      }
    };
  }

  private assertDispatchLaunchAllowed(run: RunRecord, action: "dispatch" | "build-worker-launch"): void {
    if (!run.current.stage) {
      throw new BlockedStateError(`Cannot ${action} without an active stage.`);
    }

    if (run.status === "cancelled" || run.routing.next_action === "finish") {
      throw new RejectedProgressionError(`Cannot ${action} for a terminal run.`);
    }

    if (run.routing.next_action !== "run_stage") {
      throw new RejectedProgressionError(
        `Cannot ${action} while next_action is ${run.routing.next_action}. Expected run_stage.`
      );
    }

    if (run.routing.next_stage !== run.current.stage) {
      throw new RejectedProgressionError(
        `Cannot ${action} while next_stage (${run.routing.next_stage}) differs from current stage (${run.current.stage}).`
      );
    }
  }

  private async loadBoundaryHandoffOrBlock(
    run: RunRecord,
    action: "dispatch" | "build-worker-launch"
  ): Promise<Record<string, unknown> | null> {
    const handoffPath = run.routing.boundary_handoff_path;
    if (!handoffPath) {
      return null;
    }

    const absolutePath = join(this.repo.paths.root, handoffPath);
    try {
      const handoff = await readJsonFile<unknown>(absolutePath);
      if (typeof handoff !== "object" || handoff === null || Array.isArray(handoff)) {
        throw new Error("boundary handoff must be a JSON object");
      }
      return handoff as Record<string, unknown>;
    } catch (error) {
      const now = nowIsoUtc();
      const detailMessage = error instanceof Error ? error.message : String(error);
      const blockedReason = `Boundary handoff load failed for ${handoffPath}. Recreate the handoff artifact and retry ${action}.`;

      run.status = "blocked";
      run.routing.next_action = "ask_user";
      run.routing.reason = blockedReason;
      run.routing.stop_reason_code = "boundary_handoff_load_failed";
      run.timestamps.updated_at = now;
      await this.repo.saveRun(run);
      await this.repo.appendLifecycleEvent({
        ts: now,
        type: "boundary_handoff_load_failed",
        run_id: run.run_id,
        stage: run.current.stage,
        action,
        details: {
          boundary_handoff_path: handoffPath,
          error: detailMessage
        }
      });
      throw new BlockedStateError(blockedReason);
    }
  }

  private async ensureRequiredArtifactsExistOrBlock(
    run: RunRecord,
    requiredArtifacts: string[],
    action: "dispatch" | "build-worker-launch"
  ): Promise<void> {
    const missingArtifacts: string[] = [];

    for (const artifactPath of requiredArtifacts) {
      const absolutePath = join(this.repo.paths.root, artifactPath);
      if (!(await exists(absolutePath))) {
        missingArtifacts.push(artifactPath);
      }
    }

    if (missingArtifacts.length === 0) {
      return;
    }

    const now = nowIsoUtc();
    const blockedReason = `Missing required artifacts for ${action}: ${missingArtifacts.join(", ")}. Produce the required artifacts and retry ${action}.`;

    run.status = "blocked";
    run.routing.next_action = "ask_user";
    run.routing.reason = blockedReason;
    run.routing.stop_reason_code = "missing_required_artifacts";
    run.timestamps.updated_at = now;
    await this.repo.saveRun(run);
    await this.repo.appendLifecycleEvent({
      ts: now,
      type: "missing_required_artifacts",
      run_id: run.run_id,
      stage: run.current.stage,
      action,
      details: {
        missing_artifacts: missingArtifacts
      }
    });
    throw new BlockedStateError(blockedReason);
  }
}
