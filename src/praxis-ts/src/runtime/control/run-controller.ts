import { join } from "node:path";
import { readJsonFile } from "../state/index.js";
import type {
  AdapterName,
  DispatchRecord,
  ExecutionMode,
  RunRecord,
  StageName,
  WorkerSessionRegistration,
  WorkflowName
} from "../../contracts/model.js";
import { BlockedStateError, RejectedProgressionError } from "../../contracts/errors.js";
import {
  validateRunRecord,
  validateStageResult,
  validateWorkerSessionRegistration
} from "../../contracts/validators.js";
import { nowIsoUtc } from "../common/time.js";
import { buildRunId } from "../common/ids.js";
import { projectStatus, type StatusProjection } from "./status-projector.js";
import { PraxisStateRepository } from "../state/index.js";
import { compileDispatch } from "./dispatch-compiler.js";
import { loadAndValidateStageResult } from "./stage-result-validator.js";
import { decideNextRouting } from "./workflow-router.js";
import {
  checkpointStoryBoundary,
  clearBoundaryHandoffIfConsumed,
  initializeStoryLedgerFromSliceMap
} from "./story-boundary.js";
import { ToolTelemetry } from "../tools/index.js";
import { RunLifecycleService } from "./lifecycle-service.js";

export type RunCreateInput = {
  workflow: WorkflowName;
  adapter: AdapterName;
  executionMode: ExecutionMode;
  entryTask: string;
  entrypoint?: string;
};

export type InspectProjection = {
  status: StatusProjection;
  run: RunRecord;
  ledger_present: boolean;
  recent_events: Record<string, unknown>[];
  recent_stage_history: Record<string, unknown>[];
  recent_policy_records: Record<string, unknown>[];
  state_paths: {
    run_file: string;
    story_ledger_file: string;
    events_file: string;
    stage_history_file: string;
    dispatches_dir: string;
    sessions_dir: string;
    policy_dir: string;
  };
};

export type WorkerLaunchPayload = {
  run_id: string;
  dispatch_id: string;
  workflow: string;
  stage: string;
  scope: string;
  artifact_dir: string;
  stage_result_path: string;
  inputs: {
    required_artifacts: string[];
    boundary_handoff: Record<string, unknown> | null;
  };
  worker: {
    adapter: string;
    mode: string;
    resume_session_id: string | null;
  };
  runtime: {
    entrypoint: string;
    fresh_context_per_story: boolean;
  };
};

export type SubmitStageResultOutcome = {
  stage: string;
  outcome_code: string;
  route_kind: string;
  next_stage: StageName | null;
  next_action: string;
  run_status: string;
  reason: string;
};

export type LifecycleActionOutcome = {
  run_id: string;
  status: string;
  next_action: string;
  next_stage: StageName | null;
  reason: string;
};

export type RegisterWorkerSessionOutcome = {
  run_id: string;
  dispatch_id: string;
  worker_id: string;
  session_id: string | null;
  resumable: boolean;
  stage: StageName | null;
  reason: string;
};

type StageResultIngestPhase = {
  run: RunRecord;
  accepted: Awaited<ReturnType<typeof loadAndValidateStageResult>>;
  ledger: Awaited<ReturnType<PraxisStateRepository["loadStoryLedger"]>>;
};

type StageResultRoutingPhase = {
  run: RunRecord;
  accepted: Awaited<ReturnType<typeof loadAndValidateStageResult>>;
  ledger: Awaited<ReturnType<PraxisStateRepository["loadStoryLedger"]>>;
  routingDecision: ReturnType<typeof decideNextRouting>;
};

export class RunController {
  private readonly lifecycle: RunLifecycleService;

  constructor(private readonly repo: PraxisStateRepository) {
    this.lifecycle = new RunLifecycleService(repo);
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

  async initializeRun(input: RunCreateInput): Promise<RunRecord> {
    await this.repo.ensureLayout();

    const existing = await this.repo.loadRun();
    if (existing) {
      throw new RejectedProgressionError(
        "A run already exists at .praxis/run.json. Use status/inspect/resume instead."
      );
    }

    const timestamp = nowIsoUtc();
    const run: RunRecord = {
      version: 1,
      run_id: buildRunId(),
      workflow: input.workflow,
      status: "running",
      mode: "single_story",
      entry_task: input.entryTask,
      runtime: {
        adapter: input.adapter,
        entrypoint: input.entrypoint ?? `praxis:${input.workflow}`
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
        next_action: "run_stage",
        next_stage: "clarifying-intent",
        next_slice_id: null,
        reason: "Run initialized. Start with clarifying-intent.",
        stop_reason_code: null,
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
    const run = await this.repo.loadRun();
    if (!run) {
      throw new BlockedStateError("No active run found at .praxis/run.json.");
    }

    const ledger = await this.repo.loadStoryLedger();
    return projectStatus(run, ledger);
  }

  async inspectRun(): Promise<InspectProjection> {
    const run = await this.repo.loadRun();
    if (!run) {
      throw new BlockedStateError("No active run found at .praxis/run.json.");
    }

    const ledger = await this.repo.loadStoryLedger();
    const [recentEvents, recentStageHistory, recentPolicyRecords] = await Promise.all([
      this.repo.listLifecycleEvents(40),
      this.repo.listStageHistory(40),
      this.repo.listPolicyRecords(40)
    ]);

    return {
      status: projectStatus(run, ledger),
      run,
      ledger_present: ledger !== null,
      recent_events: recentEvents,
      recent_stage_history: recentStageHistory,
      recent_policy_records: recentPolicyRecords,
      state_paths: {
        run_file: this.repo.paths.runFile,
        story_ledger_file: this.repo.paths.storyLedgerFile,
        events_file: this.repo.paths.eventsFile,
        stage_history_file: this.repo.paths.stageHistoryFile,
        dispatches_dir: this.repo.paths.dispatchesDir,
        sessions_dir: this.repo.paths.sessionsDir,
        policy_dir: this.repo.paths.policyDir
      }
    };
  }

  async createDispatch(): Promise<DispatchRecord> {
    const run = await this.repo.loadRun();
    if (!run) {
      throw new BlockedStateError("No active run found at .praxis/run.json.");
    }
    this.assertDispatchLaunchAllowed(run, "dispatch");

    const handoffData = await this.loadBoundaryHandoffOrBlock(run, "dispatch");

    const dispatch = compileDispatch({ run, boundaryHandoff: handoffData });
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
        dispatch_id: dispatch.dispatch_id
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
      recorded_at: now
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
        resumable
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

    return {
      run_id: run.run_id,
      dispatch_id: dispatch.dispatch_id,
      workflow: run.workflow,
      stage: dispatch.stage,
      scope: dispatch.scope,
      artifact_dir: dispatch.artifact_dir,
      stage_result_path: dispatch.stage_result_path,
      inputs: {
        required_artifacts: dispatch.inputs.required_artifacts,
        boundary_handoff: boundaryHandoff ?? dispatch.inputs.boundary_handoff
      },
      worker: {
        adapter: dispatch.worker.adapter,
        mode: dispatch.worker.mode,
        resume_session_id: run.active.resumable ? run.active.session_id : null
      },
      runtime: {
        entrypoint: run.runtime.entrypoint,
        fresh_context_per_story: run.execution.fresh_context_per_story
      }
    };
  }

  private async ingestStageResultPhase(stageResultPath: string): Promise<StageResultIngestPhase> {
    const run = await this.repo.loadRun();
    if (!run) {
      throw new BlockedStateError("No active run found at .praxis/run.json.");
    }
    if (!run.active.dispatch_id) {
      throw new RejectedProgressionError(
        "No active dispatch exists for this run. Prepare a dispatch before submitting a stage result."
      );
    }
    const activeDispatch = await this.repo.loadDispatch(run.active.dispatch_id);
    if (!activeDispatch) {
      throw new BlockedStateError(`Active dispatch ${run.active.dispatch_id} does not exist.`);
    }

    const accepted = await loadAndValidateStageResult(
      this.repo.paths.root,
      stageResultPath,
      run,
      activeDispatch
    );
    validateStageResult(accepted.result);
    let ledger = await this.repo.loadStoryLedger();

    if (
      accepted.result.stage === "slicing-stories" &&
      accepted.result.data.outcome_code === "slice_map_ready"
    ) {
      ledger = await initializeStoryLedgerFromSliceMap(
        this.repo.paths.root,
        run,
        run.execution.mode
      );
      await this.repo.saveStoryLedger(ledger);
    }

    return { run, accepted, ledger };
  }

  private routingProjectionPhase(phase: StageResultIngestPhase): StageResultRoutingPhase {
    const { run, accepted, ledger } = phase;
    const routingDecision = decideNextRouting(run, accepted);

    run.status = routingDecision.status;
    run.current.stage = routingDecision.current_stage;
    run.routing.next_action = routingDecision.next_action;
    run.routing.next_stage = routingDecision.next_stage;
    run.routing.reason = routingDecision.reason;
    run.routing.stop_reason_code = routingDecision.stop_reason_code;
    run.routing.entered_from_stage = accepted.result.stage;
    run.routing.entered_from_outcome_code = accepted.result.data.outcome_code;
    run.timestamps.updated_at = nowIsoUtc();
    run.active.dispatch_id = null;
    run.active.worker_id = null;
    run.active.resumable = false;
    run.active.session_id = null;

    return { run, accepted, ledger, routingDecision };
  }

  private async boundaryMutationPhase(phase: StageResultRoutingPhase): Promise<StageResultRoutingPhase> {
    const { run, accepted, routingDecision } = phase;
    let { ledger } = phase;

    const boundaryTransitionRequired =
      run.mode === "multi_slice" &&
      (accepted.transition.route_kind === "next_slice" ||
        accepted.transition.route_kind === "done" ||
        (accepted.transition.route_kind === "proceed" && accepted.transition.next_stage === null));

    if (boundaryTransitionRequired) {
      if (!ledger) {
        throw new BlockedStateError("Story boundary transition requires .praxis/story-ledger.json.");
      }
      const boundary = await checkpointStoryBoundary(
        this.repo.paths.root,
        run,
        ledger,
        accepted.result
      );
      ledger = boundary.ledger;
      run.routing.reason = boundary.handoff_path
        ? `Story boundary checkpointed (${boundary.handoff_path}). ${run.routing.reason}`
        : run.routing.reason;
      await this.repo.saveStoryLedger(ledger);
    }

    clearBoundaryHandoffIfConsumed(run);

    return {
      run,
      accepted,
      ledger,
      routingDecision
    };
  }

  private async persistenceCommitPhase(phase: StageResultRoutingPhase): Promise<SubmitStageResultOutcome> {
    const { run, accepted, routingDecision } = phase;

    await this.repo.saveRun(run);
    await this.repo.appendStageResultRecord(accepted.result);
    const telemetry = new ToolTelemetry(this.repo);
    await telemetry.recordToolUse({
      run_id: run.run_id,
      stage: accepted.result.stage,
      tool: "submit-stage-result",
      status: "granted"
    });

    await this.repo.appendLifecycleEvent({
      ts: run.timestamps.updated_at,
      type: "stage_result_accepted",
      run_id: run.run_id,
      stage: accepted.result.stage,
      action: "submit-stage-result",
      details: {
        outcome_code: accepted.result.data.outcome_code,
        route_kind: accepted.transition.route_kind,
        next_stage: routingDecision.next_stage,
        next_action: routingDecision.next_action,
        run_status: routingDecision.status
      }
    });

    return {
      stage: accepted.result.stage,
      outcome_code: accepted.result.data.outcome_code,
      route_kind: accepted.transition.route_kind,
      next_stage: routingDecision.next_stage,
      next_action: routingDecision.next_action,
      run_status: routingDecision.status,
      reason: routingDecision.reason
    };
  }

  async submitStageResult(stageResultPath: string): Promise<SubmitStageResultOutcome> {
    const ingestPhase = await this.ingestStageResultPhase(stageResultPath);
    const routingPhase = this.routingProjectionPhase(ingestPhase);
    const boundaryPhase = await this.boundaryMutationPhase(routingPhase);
    return this.persistenceCommitPhase(boundaryPhase);
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
