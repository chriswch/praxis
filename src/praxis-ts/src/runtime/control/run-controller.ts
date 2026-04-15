import type { AdapterName, ExecutionMode, RunRecord, WorkflowName } from "../../contracts/model.js";
import { validateRunRecord } from "../../contracts/validators.js";
import { nowIsoUtc } from "../common/time.js";
import { buildRunId } from "../common/ids.js";
import { projectStatus, type StatusProjection } from "./status-projector.js";
import { PraxisStateRepository } from "../state/index.js";

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
}
