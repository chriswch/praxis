import { join } from "node:path";
import { unlink } from "node:fs/promises";
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
  validateStageResult,
  validateStoryLedgerRecord
} from "../../contracts/validators.js";
import {
  appendJsonLine,
  ensureDir,
  readJsonFileIfExists,
  readJsonLines,
  writeJsonFile
} from "./store.js";
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
    await ensureDir(this.paths.worktreesDir);
    await ensureDir(this.paths.approvalsDir);
    await ensureDir(this.paths.policyDir);
  }

  async loadRun(): Promise<RunRecord | null> {
    await this.recoverRunLedgerTransactionIfPresent();
    const run = await readJsonFileIfExists<RunRecord>(this.paths.runFile);
    if (run) {
      validateRunRecord(run);
    }
    return run;
  }

  async saveRun(run: RunRecord): Promise<void> {
    validateRunRecord(run);
    await writeJsonFile(this.paths.runFile, run);
  }

  async loadStoryLedger(): Promise<StoryLedgerRecord | null> {
    await this.recoverRunLedgerTransactionIfPresent();
    const ledger = await readJsonFileIfExists<StoryLedgerRecord>(this.paths.storyLedgerFile);
    if (ledger) {
      validateStoryLedgerRecord(ledger);
    }
    return ledger;
  }

  async saveStoryLedger(ledger: StoryLedgerRecord): Promise<void> {
    validateStoryLedgerRecord(ledger);
    await writeJsonFile(this.paths.storyLedgerFile, ledger);
  }

  async saveRunAndStoryLedger(run: RunRecord, ledger: StoryLedgerRecord): Promise<void> {
    validateRunRecord(run);
    validateStoryLedgerRecord(ledger);

    const pending = {
      version: 1,
      run,
      ledger
    };
    await writeJsonFile(this.paths.runLedgerTransactionFile, pending);
    await writeJsonFile(this.paths.runFile, run);
    await writeJsonFile(this.paths.storyLedgerFile, ledger);
    await this.removeRunLedgerTransactionMarker();
  }

  async saveDispatch(dispatch: DispatchRecord): Promise<void> {
    validateDispatchRecord(dispatch);
    await writeJsonFile(join(this.paths.dispatchesDir, `${dispatch.dispatch_id}.json`), dispatch);
  }

  async loadDispatch(dispatchId: string): Promise<DispatchRecord | null> {
    const dispatch = await readJsonFileIfExists<DispatchRecord>(
      join(this.paths.dispatchesDir, `${dispatchId}.json`)
    );
    if (dispatch) {
      validateDispatchRecord(dispatch);
    }
    return dispatch;
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

  async loadSessionRecord(sessionId: string): Promise<Record<string, unknown> | null> {
    return readJsonFileIfExists<Record<string, unknown>>(
      join(this.paths.sessionsDir, `${sessionId}.json`)
    );
  }

  async saveWorktreeRecord(dispatchId: string, payload: Record<string, unknown>): Promise<void> {
    await writeJsonFile(join(this.paths.worktreesDir, `${dispatchId}.json`), payload);
  }

  async loadWorktreeRecord(dispatchId: string): Promise<Record<string, unknown> | null> {
    return readJsonFileIfExists<Record<string, unknown>>(
      join(this.paths.worktreesDir, `${dispatchId}.json`)
    );
  }

  async saveApprovalRecord(approvalId: string, payload: Record<string, unknown>): Promise<void> {
    await writeJsonFile(join(this.paths.approvalsDir, `${approvalId}.json`), payload);
  }

  async appendPolicyRecord(payload: Record<string, unknown>): Promise<void> {
    await appendJsonLine(join(this.paths.policyDir, "tool-records.jsonl"), payload);
  }

  async listLifecycleEvents(limit = 50): Promise<Record<string, unknown>[]> {
    const events = await readJsonLines<Record<string, unknown>>(this.paths.eventsFile);
    return events.slice(-limit);
  }

  async listStageHistory(limit = 50): Promise<Record<string, unknown>[]> {
    const records = await readJsonLines<Record<string, unknown>>(this.paths.stageHistoryFile);
    return records.slice(-limit);
  }

  async listPolicyRecords(limit = 50): Promise<Record<string, unknown>[]> {
    const records = await readJsonLines<Record<string, unknown>>(
      join(this.paths.policyDir, "tool-records.jsonl")
    );
    return records.slice(-limit);
  }

  private async recoverRunLedgerTransactionIfPresent(): Promise<void> {
    const pending = await readJsonFileIfExists<{
      version: number;
      run: RunRecord;
      ledger: StoryLedgerRecord;
    }>(this.paths.runLedgerTransactionFile);
    if (!pending) {
      return;
    }

    validateRunRecord(pending.run);
    validateStoryLedgerRecord(pending.ledger);
    await writeJsonFile(this.paths.runFile, pending.run);
    await writeJsonFile(this.paths.storyLedgerFile, pending.ledger);
    await this.removeRunLedgerTransactionMarker();
  }

  private async removeRunLedgerTransactionMarker(): Promise<void> {
    try {
      await unlink(this.paths.runLedgerTransactionFile);
    } catch {
      // Marker is best-effort cleanup; recovery remains safe when already removed.
    }
  }
}
