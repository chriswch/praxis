import type { DispatchRecord, RunRecord } from "../../contracts/model.js";
import { RejectedProgressionError } from "../../contracts/errors.js";
import { validateRunRecord } from "../../contracts/validators.js";
import { nowIsoUtc } from "../common/time.js";
import { buildRunId } from "../common/ids.js";
import { PraxisStateRepository } from "../state/index.js";
import { RunLifecycleService } from "./lifecycle-service.js";
import { DispatchService } from "./dispatch-service.js";
import { StageResultService } from "./stage-result-service.js";
import { RunQueryService } from "./run-query-service.js";
import { WorkerExecutionService } from "./worker-execution-service.js";
import {
  decideStageEntryCheckpoint,
  describeStageEntryCheckpoint
} from "./checkpoint-policy.js";
import type {
  InspectProjection,
  LaunchStageOutcome,
  LifecycleActionOutcome,
  RegisterWorkerSessionInput,
  RegisterWorkerSessionOutcome,
  RunCreateInput,
  SubmitStageResultOutcome,
  WorkerLaunchPayload
} from "./types.js";
import type { StatusProjection } from "./status-projector.js";

export class RunController {
  private readonly lifecycle: RunLifecycleService;
  private readonly dispatchService: DispatchService;
  private readonly stageResultService: StageResultService;
  private readonly queryService: RunQueryService;
  private readonly workerExecutionService: WorkerExecutionService;

  constructor(private readonly repo: PraxisStateRepository) {
    this.lifecycle = new RunLifecycleService(repo);
    this.dispatchService = new DispatchService(repo);
    this.stageResultService = new StageResultService(repo);
    this.queryService = new RunQueryService(repo);
    this.workerExecutionService = new WorkerExecutionService(repo);
  }

  async initializeRun(input: RunCreateInput): Promise<RunRecord> {
    await this.repo.ensureLayout();

    const existing = await this.repo.loadRun();
    if (existing) {
      throw new RejectedProgressionError(
        "A run already exists at .praxis/run.json. Use status/inspect/resume instead."
      );
    }

    const timestamp = nowIsoUtc();
    const initialCheckpoint = decideStageEntryCheckpoint({
      execution_mode: input.executionMode,
      stage: "clarifying-intent"
    });
    const run: RunRecord = {
      version: 1,
      run_id: buildRunId(),
      workflow: "craft",
      status: "running",
      mode: "single_story",
      entry_task: input.entryTask,
      runtime: {
        adapter: input.adapter,
        entrypoint: input.entrypoint ?? "praxis:craft"
      },
      execution: {
        mode: input.executionMode,
        fresh_context_per_story: true
      },
      current: {
        scope: "root",
        slice_id: null,
        artifact_dir: ".praxis",
        stage: "clarifying-intent"
      },
      routing: {
        next_action: initialCheckpoint.next_action,
        next_stage: "clarifying-intent",
        next_slice_id: null,
        reason: describeStageEntryCheckpoint("clarifying-intent", "run_initialization", initialCheckpoint),
        stop_reason_code: initialCheckpoint.stop_reason_code,
        boundary_handoff_path: null,
        entered_from_stage: null,
        entered_from_outcome_code: null
      },
      active: {
        dispatch_id: null,
        worker_id: null,
        session_id: null,
        resumable: false
      },
      timestamps: {
        created_at: timestamp,
        updated_at: timestamp
      }
    };
    run.status = initialCheckpoint.status;

    validateRunRecord(run);
    await this.repo.saveRun(run);
    await this.repo.appendLifecycleEvent({
      ts: timestamp,
      type: "run_initialized",
      run_id: run.run_id,
      stage: run.current.stage,
      action: "run"
    });

    return run;
  }

  async getStatus(): Promise<StatusProjection> {
    return this.queryService.getStatus();
  }

  async inspectRun(): Promise<InspectProjection> {
    return this.queryService.inspectRun();
  }

  async createDispatch(): Promise<DispatchRecord> {
    return this.dispatchService.createDispatch();
  }

  async registerWorkerSession(input: RegisterWorkerSessionInput): Promise<RegisterWorkerSessionOutcome> {
    return this.dispatchService.registerWorkerSession(input);
  }

  async buildWorkerLaunch(): Promise<WorkerLaunchPayload> {
    return this.dispatchService.buildWorkerLaunch();
  }

  async launchReadyStage(): Promise<LaunchStageOutcome> {
    return this.workerExecutionService.launchReadyStage();
  }

  async resumeRegisteredStage(): Promise<LaunchStageOutcome> {
    return this.workerExecutionService.resumeRegisteredStage();
  }

  async submitStageResult(stageResultPath: string): Promise<SubmitStageResultOutcome> {
    return this.stageResultService.submitStageResult(stageResultPath);
  }

  async continueRun(): Promise<LifecycleActionOutcome> {
    return this.lifecycle.continueRun();
  }

  async approveRun(note: string | null): Promise<LifecycleActionOutcome> {
    return this.lifecycle.approveRun(note);
  }

  async resumeRun(): Promise<LifecycleActionOutcome> {
    return this.lifecycle.resumeRun();
  }

  async cancelRun(note: string | null): Promise<LifecycleActionOutcome> {
    return this.lifecycle.cancelRun(note);
  }

}
