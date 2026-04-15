import { join } from "node:path";
import type {
  DispatchRecord,
  LifecycleEvent,
  RunRecord,
  StageResultRecord,
  StoryLedgerRecord
} from "../../contracts/model.js";
import {
  validateDispatchRecord,
  validateRunRecord,
  validateStageResult
} from "../../contracts/validators.js";
import { appendJsonLine, ensureDir, readJsonFileIfExists, writeJsonFile } from "./store.js";
import { resolvePraxisPaths, type PraxisPathSet } from "./paths.js";

export class PraxisStateRepository {
  readonly paths: PraxisPathSet;

  constructor(private readonly repoRoot: string) {
    this.paths = resolvePraxisPaths(repoRoot);
  }

  async ensureLayout(): Promise<void> {
    await ensureDir(this.paths.praxisDir);
    await ensureDir(this.paths.tracesDir);
    await ensureDir(this.paths.dispatchesDir);
    await ensureDir(this.paths.sessionsDir);
    await ensureDir(this.paths.approvalsDir);
    await ensureDir(this.paths.policyDir);
  }

  async loadRun(): Promise<RunRecord | null> {
    return readJsonFileIfExists<RunRecord>(this.paths.runFile);
  }

  async saveRun(run: RunRecord): Promise<void> {
    validateRunRecord(run);
    await writeJsonFile(this.paths.runFile, run);
  }

  async loadStoryLedger(): Promise<StoryLedgerRecord | null> {
    return readJsonFileIfExists<StoryLedgerRecord>(this.paths.storyLedgerFile);
  }

  async saveStoryLedger(ledger: StoryLedgerRecord): Promise<void> {
    await writeJsonFile(this.paths.storyLedgerFile, ledger);
  }

  async saveDispatch(dispatch: DispatchRecord): Promise<void> {
    validateDispatchRecord(dispatch);
    await writeJsonFile(join(this.paths.dispatchesDir, `${dispatch.dispatch_id}.json`), dispatch);
  }

  async loadDispatch(dispatchId: string): Promise<DispatchRecord | null> {
    return readJsonFileIfExists<DispatchRecord>(join(this.paths.dispatchesDir, `${dispatchId}.json`));
  }

  async appendLifecycleEvent(event: LifecycleEvent): Promise<void> {
    await appendJsonLine(this.paths.eventsFile, event);
  }

  async appendStageResultRecord(payload: Record<string, unknown>): Promise<void> {
    await appendJsonLine(this.paths.stageHistoryFile, payload);
  }

  async validateAndAppendStageResult(payload: StageResultRecord): Promise<void> {
    validateStageResult(payload);
    await this.appendStageResultRecord(payload);
  }

  async saveSessionRecord(sessionId: string, payload: Record<string, unknown>): Promise<void> {
    await writeJsonFile(join(this.paths.sessionsDir, `${sessionId}.json`), payload);
  }

  async saveApprovalRecord(approvalId: string, payload: Record<string, unknown>): Promise<void> {
    await writeJsonFile(join(this.paths.approvalsDir, `${approvalId}.json`), payload);
  }

  async appendPolicyRecord(payload: Record<string, unknown>): Promise<void> {
    await appendJsonLine(join(this.paths.policyDir, "tool-records.jsonl"), payload);
  }
}
