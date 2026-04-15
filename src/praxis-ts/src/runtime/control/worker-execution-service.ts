import { getAdapter } from "../adapters/index.js";
import { nowIsoUtc } from "../common/time.js";
import { BlockedStateError, RejectedProgressionError } from "../../contracts/errors.js";
import type { DispatchRecord, RunRecord } from "../../contracts/model.js";
import type { PraxisStateRepository } from "../state/repository.js";
import type { LaunchStageOutcome } from "./types.js";
import { DispatchService } from "./dispatch-service.js";

export class WorkerExecutionService {
  private readonly dispatchService: DispatchService;

  constructor(private readonly repo: PraxisStateRepository) {
    this.dispatchService = new DispatchService(repo);
  }

  async launchReadyStage(): Promise<LaunchStageOutcome> {
    let run = await this.loadRunOrThrow();
    if (!run.current.stage || run.routing.next_action !== "run_stage") {
      throw new RejectedProgressionError(
        `Cannot launch a worker while next_action is ${run.routing.next_action}.`
      );
    }
    if (run.active.worker_id) {
      throw new RejectedProgressionError(
        `Worker ${run.active.worker_id} already owns the active dispatch.`
      );
    }

    let dispatch = await this.loadActiveDispatch(run);
    if (!dispatch) {
      dispatch = await this.dispatchService.createDispatch();
      run = await this.loadRunOrThrow();
    }

    const adapter = getAdapter(dispatch.worker.adapter);

    try {
      const response = await adapter.launch({
        dispatch,
        repoRoot: this.repo.paths.root,
        entrypoint: run.runtime.entrypoint
      });
      const registration = await this.dispatchService.registerWorkerSession({
        dispatch_id: dispatch.dispatch_id,
        worker_id: response.worker_id,
        session_id: response.session_id,
        started_at: response.started_at,
        locator: response.locator,
        resumable: response.session_id !== null
      });

      return {
        run_id: registration.run_id,
        dispatch_id: registration.dispatch_id,
        stage: registration.stage,
        worker_id: registration.worker_id,
        session_id: registration.session_id,
        locator: response.locator,
        resumable: registration.resumable,
        mode: "launch",
        reason: registration.reason
      };
    } catch (error) {
      await this.persistAdapterFailure(run, dispatch, "adapter_launch_failed", "launch", error);
      throw error;
    }
  }

  async resumeRegisteredStage(): Promise<LaunchStageOutcome> {
    const run = await this.loadRunOrThrow();
    if (!run.current.stage) {
      throw new BlockedStateError("Cannot resume a run without an active stage.");
    }
    if (!run.active.dispatch_id || !run.active.session_id || !run.active.resumable) {
      throw new RejectedProgressionError("No resumable worker session is active for this run.");
    }

    const dispatch = await this.loadActiveDispatch(run);
    if (!dispatch) {
      throw new BlockedStateError(`Active dispatch ${run.active.dispatch_id} does not exist.`);
    }

    const adapter = getAdapter(dispatch.worker.adapter);

    try {
      const response = await adapter.resume(run.active.session_id, {
        dispatch,
        repoRoot: this.repo.paths.root,
        entrypoint: run.runtime.entrypoint
      });
      const registration = await this.dispatchService.registerWorkerSession({
        dispatch_id: dispatch.dispatch_id,
        worker_id: response.worker_id,
        session_id: response.session_id,
        started_at: response.started_at,
        locator: response.locator,
        resumable: true
      });

      return {
        run_id: registration.run_id,
        dispatch_id: registration.dispatch_id,
        stage: registration.stage,
        worker_id: registration.worker_id,
        session_id: registration.session_id,
        locator: response.locator,
        resumable: registration.resumable,
        mode: "resume",
        reason: registration.reason
      };
    } catch (error) {
      await this.persistAdapterFailure(run, dispatch, "adapter_resume_failed", "resume", error);
      throw error;
    }
  }

  private async loadRunOrThrow(): Promise<RunRecord> {
    const run = await this.repo.loadRun();
    if (!run) {
      throw new BlockedStateError("No active run found at .praxis/run.json.");
    }
    return run;
  }

  private async loadActiveDispatch(run: RunRecord): Promise<DispatchRecord | null> {
    if (!run.active.dispatch_id) {
      return null;
    }
    return this.repo.loadDispatch(run.active.dispatch_id);
  }

  private async persistAdapterFailure(
    run: RunRecord,
    dispatch: DispatchRecord,
    stopReasonCode: string,
    action: "launch" | "resume",
    error: unknown
  ): Promise<void> {
    const detailMessage = error instanceof Error ? error.message : String(error);
    const now = nowIsoUtc();

    run.status = "blocked";
    run.routing.next_action = "ask_user";
    run.routing.reason = `Adapter ${action} failed for ${dispatch.stage}: ${detailMessage}`;
    run.routing.stop_reason_code = stopReasonCode;
    run.timestamps.updated_at = now;
    await this.repo.saveRun(run);
    await this.repo.appendLifecycleEvent({
      ts: now,
      type: stopReasonCode,
      run_id: run.run_id,
      stage: dispatch.stage,
      action,
      details: {
        dispatch_id: dispatch.dispatch_id,
        error: detailMessage
      }
    });
  }
}
