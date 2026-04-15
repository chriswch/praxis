import { join } from "node:path";
import { readJsonFileIfExists } from "../state/index.js";
import type {
  AdapterName,
  DispatchRecord,
  ExecutionMode,
  RunRecord,
  WorkflowName
} from "../../contracts/model.js";
import { validateRunRecord } from "../../contracts/validators.js";
import { nowIsoUtc } from "../common/time.js";
import { buildRunId } from "../common/ids.js";
import { projectStatus, type StatusProjection } from "./status-projector.js";
import { PraxisStateRepository } from "../state/index.js";
import { compileDispatch } from "./dispatch-compiler.js";

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
}
