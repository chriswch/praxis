import { BlockedStateError } from "../../contracts/errors.js";
import { projectStatus, type StatusProjection } from "./status-projector.js";
import type { PraxisStateRepository } from "../state/repository.js";
import type { InspectProjection } from "./types.js";

export class RunQueryService {
  constructor(private readonly repo: PraxisStateRepository) {}

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
}
