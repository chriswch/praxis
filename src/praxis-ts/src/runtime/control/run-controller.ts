import { join } from "node:path";
import { readJsonFileIfExists } from "../state/index.js";
import type {
  AdapterName,
  DispatchRecord,
  ExecutionMode,
  RunRecord,
  StageName,
  WorkflowName
} from "../../contracts/model.js";
import { validateRunRecord } from "../../contracts/validators.js";
import { nowIsoUtc } from "../common/time.js";
import { buildRunId } from "../common/ids.js";
import { projectStatus, type StatusProjection } from "./status-projector.js";
import { PraxisStateRepository } from "../state/index.js";
import { compileDispatch } from "./dispatch-compiler.js";
import { loadAndValidateStageResult } from "./stage-result-validator.js";
import { decideNextRouting } from "./workflow-router.js";
import { getAdapter } from "../adapters/index.js";
import {
  checkpointStoryBoundary,
  clearBoundaryHandoffIfConsumed,
  initializeStoryLedgerFromSliceMap
} from "./story-boundary.js";
import { ToolTelemetry } from "../tools/index.js";

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
  state_paths: {
    run_file: string;
    story_ledger_file: string;
    events_file: string;
    dispatches_dir: string;
    sessions_dir: string;
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

export class RunController {
  constructor(private readonly repo: PraxisStateRepository) {}

  async initializeRun(input: RunCreateInput): Promise<RunRecord> {
    await this.repo.ensureLayout();

    const existing = await this.repo.loadRun();
    if (existing) {
      throw new Error("A run already exists at .praxis/run.json. Use status/inspect/resume instead.");
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
        boundary_handoff_path: null
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
      throw new Error("No active run found at .praxis/run.json.");
    }

    const ledger = await this.repo.loadStoryLedger();
    return projectStatus(run, ledger);
  }

  async inspectRun(): Promise<InspectProjection> {
    const run = await this.repo.loadRun();
    if (!run) {
      throw new Error("No active run found at .praxis/run.json.");
    }

    const ledger = await this.repo.loadStoryLedger();
    return {
      status: projectStatus(run, ledger),
      run,
      ledger_present: ledger !== null,
      state_paths: {
        run_file: this.repo.paths.runFile,
        story_ledger_file: this.repo.paths.storyLedgerFile,
        events_file: this.repo.paths.eventsFile,
        dispatches_dir: this.repo.paths.dispatchesDir,
        sessions_dir: this.repo.paths.sessionsDir
      }
    };
  }

  async createDispatch(): Promise<DispatchRecord> {
    const run = await this.repo.loadRun();
    if (!run) {
      throw new Error("No active run found at .praxis/run.json.");
    }

    const handoffData = run.routing.boundary_handoff_path
      ? await readJsonFileIfExists<Record<string, unknown>>(
          join(this.repo.paths.root, run.routing.boundary_handoff_path)
        )
      : null;

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
    run.active.worker_id = `wrk_${dispatch.scope}_${dispatch.stage}`;
    run.active.session_id = null;
    run.active.resumable = false;
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

  async buildWorkerLaunch(): Promise<WorkerLaunchPayload> {
    const run = await this.repo.loadRun();
    if (!run) {
      throw new Error("No active run found at .praxis/run.json.");
    }
    if (!run.active.dispatch_id) {
      throw new Error("No active dispatch found. Run `praxis dispatch` first.");
    }

    const dispatch = await this.repo.loadDispatch(run.active.dispatch_id);
    if (!dispatch) {
      throw new Error(`Dispatch ${run.active.dispatch_id} does not exist.`);
    }

    const boundaryHandoff = run.routing.boundary_handoff_path
      ? await readJsonFileIfExists<Record<string, unknown>>(
          join(this.repo.paths.root, run.routing.boundary_handoff_path)
        )
      : null;

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

  async submitStageResult(stageResultPath: string): Promise<SubmitStageResultOutcome> {
    const run = await this.repo.loadRun();
    if (!run) {
      throw new Error("No active run found at .praxis/run.json.");
    }

    const accepted = await loadAndValidateStageResult(this.repo.paths.root, stageResultPath, run);
    await this.repo.validateAndAppendStageResult(accepted.result);
    const telemetry = new ToolTelemetry(this.repo);
    await telemetry.recordToolUse({
      run_id: run.run_id,
      stage: accepted.result.stage,
      tool: "submit-stage-result",
      status: "granted"
    });
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

    const routingDecision = decideNextRouting(run, accepted);

    run.status = routingDecision.status;
    run.current.stage = routingDecision.current_stage;
    run.routing.next_action = routingDecision.next_action;
    run.routing.next_stage = routingDecision.next_stage;
    run.routing.reason = routingDecision.reason;
    run.routing.stop_reason_code = routingDecision.stop_reason_code;
    run.timestamps.updated_at = nowIsoUtc();
    run.active.resumable = false;
    run.active.session_id = null;

    const boundaryTransitionRequired =
      run.mode === "multi_slice" &&
      (accepted.transition.route_kind === "next_slice" ||
        accepted.transition.route_kind === "done" ||
        (accepted.transition.route_kind === "proceed" && accepted.transition.next_stage === null));

    if (boundaryTransitionRequired) {
      if (!ledger) {
        throw new Error("Story boundary transition requires .praxis/story-ledger.json.");
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
    await this.repo.saveRun(run);

    await this.repo.appendLifecycleEvent({
      ts: run.timestamps.updated_at,
      type: "stage_result_accepted",
      run_id: run.run_id,
      stage: accepted.result.stage,
      action: "submit-stage-result",
      details: {
        outcome_code: accepted.result.data.outcome_code,
        route_kind: accepted.transition.route_kind,
        next_stage: accepted.transition.next_stage,
        next_action: routingDecision.next_action,
        run_status: routingDecision.status
      }
    });

    return {
      stage: accepted.result.stage,
      outcome_code: accepted.result.data.outcome_code,
      route_kind: accepted.transition.route_kind,
      next_stage: accepted.transition.next_stage,
      next_action: routingDecision.next_action,
      run_status: routingDecision.status,
      reason: routingDecision.reason
    };
  }

  async continueRun(): Promise<LifecycleActionOutcome> {
    const run = await this.repo.loadRun();
    if (!run) {
      throw new Error("No active run found at .praxis/run.json.");
    }
    if (run.routing.next_action !== "confirm_then_run") {
      throw new Error(
        `continue is only valid when next_action is confirm_then_run (found ${run.routing.next_action}).`
      );
    }
    if (!run.current.stage) {
      throw new Error("Cannot continue a run without an active stage.");
    }

    run.status = "running";
    run.routing.next_action = "run_stage";
    run.routing.next_stage = run.current.stage;
    run.routing.stop_reason_code = null;
    run.routing.reason = `Continue acknowledged. Ready to run ${run.current.stage}.`;
    run.timestamps.updated_at = nowIsoUtc();

    await this.repo.saveRun(run);
    await this.repo.appendLifecycleEvent({
      ts: run.timestamps.updated_at,
      type: "run_continued",
      run_id: run.run_id,
      stage: run.current.stage,
      action: "continue"
    });

    return {
      run_id: run.run_id,
      status: run.status,
      next_action: run.routing.next_action,
      next_stage: run.routing.next_stage,
      reason: run.routing.reason
    };
  }

  async approveRun(note: string | null): Promise<LifecycleActionOutcome> {
    const run = await this.repo.loadRun();
    if (!run) {
      throw new Error("No active run found at .praxis/run.json.");
    }
    if (!run.current.stage) {
      throw new Error("Cannot approve a run without an active stage.");
    }
    if (!["confirm_then_run", "ask_user"].includes(run.routing.next_action)) {
      throw new Error(`approve is not valid while next_action is ${run.routing.next_action}.`);
    }

    const approvalId = `approval_${Date.now()}`;
    run.status = "running";
    run.routing.next_action = "run_stage";
    run.routing.next_stage = run.current.stage;
    run.routing.stop_reason_code = null;
    run.routing.reason = `Approval ${approvalId} accepted for stage ${run.current.stage}.`;
    run.timestamps.updated_at = nowIsoUtc();

    await this.repo.saveApprovalRecord(approvalId, {
      run_id: run.run_id,
      stage: run.current.stage,
      note,
      approved_at: run.timestamps.updated_at
    });
    await this.repo.saveRun(run);
    await this.repo.appendLifecycleEvent({
      ts: run.timestamps.updated_at,
      type: "run_approved",
      run_id: run.run_id,
      stage: run.current.stage,
      action: "approve",
      details: {
        approval_id: approvalId
      }
    });

    return {
      run_id: run.run_id,
      status: run.status,
      next_action: run.routing.next_action,
      next_stage: run.routing.next_stage,
      reason: run.routing.reason
    };
  }

  async resumeRun(): Promise<LifecycleActionOutcome> {
    const run = await this.repo.loadRun();
    if (!run) {
      throw new Error("No active run found at .praxis/run.json.");
    }
    if (!run.current.stage) {
      throw new Error("Cannot resume a run without an active stage.");
    }

    if (run.status === "cancelled" || run.routing.next_action === "finish") {
      throw new Error("Cannot resume a terminal run.");
    }

    if (run.routing.next_action === "confirm_then_run" || run.routing.next_action === "ask_user") {
      throw new Error("Run is waiting for operator input. Use continue or approve.");
    }

    run.status = "running";
    run.routing.next_action = "run_stage";
    run.routing.next_stage = run.current.stage;
    run.routing.stop_reason_code = null;
    run.routing.reason = `Resume requested. Continue ${run.current.stage}.`;
    run.timestamps.updated_at = nowIsoUtc();

    await this.repo.saveRun(run);
    await this.repo.appendLifecycleEvent({
      ts: run.timestamps.updated_at,
      type: "run_resumed",
      run_id: run.run_id,
      stage: run.current.stage,
      action: "resume"
    });

    return {
      run_id: run.run_id,
      status: run.status,
      next_action: run.routing.next_action,
      next_stage: run.routing.next_stage,
      reason: run.routing.reason
    };
  }

  async cancelRun(note: string | null): Promise<LifecycleActionOutcome> {
    const run = await this.repo.loadRun();
    if (!run) {
      throw new Error("No active run found at .praxis/run.json.");
    }

    let cancellationReason = "Run cancelled by operator.";
    if (run.active.session_id) {
      const adapter = getAdapter(run.runtime.adapter);
      const cancellation = await adapter.cancel(run.active.session_id);
      cancellationReason = cancellation.reason;
    }

    run.status = "cancelled";
    run.routing.next_action = "finish";
    run.routing.next_stage = null;
    run.routing.stop_reason_code = "cancelled";
    run.routing.reason = note ? `${cancellationReason} Note: ${note}` : cancellationReason;
    run.current.stage = null;
    run.timestamps.updated_at = nowIsoUtc();

    await this.repo.saveRun(run);
    await this.repo.appendLifecycleEvent({
      ts: run.timestamps.updated_at,
      type: "run_cancelled",
      run_id: run.run_id,
      stage: null,
      action: "cancel",
      details: note ? { note } : undefined
    });

    return {
      run_id: run.run_id,
      status: run.status,
      next_action: run.routing.next_action,
      next_stage: run.routing.next_stage,
      reason: run.routing.reason
    };
  }
}
