import { BlockedStateError } from "../../contracts/errors.js";
import { exists } from "../state/store.js";
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
    const activeDispatch = run.active.dispatch_id ? await this.repo.loadDispatch(run.active.dispatch_id) : null;
    const activeSession = run.active.session_id ? await this.repo.loadSessionRecord(run.active.session_id) : null;
    const activeWorktree = run.active.dispatch_id ? await this.repo.loadWorktreeRecord(run.active.dispatch_id) : null;
    const [recentEvents, recentStageHistory, recentPolicyRecords] = await Promise.all([
      this.repo.listLifecycleEvents(40),
      this.repo.listStageHistory(40),
      this.repo.listPolicyRecords(40)
    ]);
    const artifactInspection = activeDispatch
      ? {
          required_inputs: await Promise.all(
            activeDispatch.inputs.required_artifacts.map(async (path) => ({
              path,
              exists: await exists(this.repo.resolvePath(path))
            }))
          ),
          expected_outputs: await Promise.all(
            activeDispatch.contract.expected_output_artifacts.map(async (path) => ({
              path,
              exists: await exists(this.repo.resolvePath(path))
            }))
          ),
          stage_result: {
            path: activeDispatch.stage_result_path,
            exists: await exists(this.repo.resolvePath(activeDispatch.stage_result_path))
          },
          boundary_handoff: run.routing.boundary_handoff_path
            ? {
                path: run.routing.boundary_handoff_path,
                exists: await exists(this.repo.resolvePath(run.routing.boundary_handoff_path))
              }
            : null
        }
      : null;

    return {
      status: projectStatus(run, ledger),
      run,
      ledger_present: ledger !== null,
      active_dispatch: activeDispatch,
      active_session: activeSession,
      active_worktree: activeWorktree,
      artifact_inspection: artifactInspection,
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
        worktrees_dir: this.repo.paths.worktreesDir,
        policy_dir: this.repo.paths.policyDir
      }
    };
  }
}
