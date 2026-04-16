import { join } from "node:path";
import { unlink, writeFile, mkdir, rm } from "node:fs/promises";
import type {
  CampaignLedgerRecord,
  CampaignRecord,
  DispatchRecord,
  LifecycleEvent,
  ObjectiveAssessmentResult,
  PassBatchRecord,
  PassSummaryRecord,
  RunRecord,
  StageResultRecord,
  StoryLedgerRecord
} from "../../contracts/model.js";
import {
  validateCampaignLedgerRecord,
  validateCampaignRecord,
  validateDispatchRecord,
  validateObjectiveAssessmentResult,
  validatePassBatchRecord,
  validatePassSummaryRecord,
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

  resolvePath(relativePath: string): string {
    return join(this.repoRoot, relativePath);
  }

  async ensureLayout(): Promise<void> {
    await ensureDir(this.paths.praxisDir);
    await ensureDir(this.paths.passesDir);
    await ensureDir(this.paths.reviewsDir);
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

  async loadCampaign(): Promise<CampaignRecord | null> {
    const campaign = await readJsonFileIfExists<CampaignRecord>(this.paths.campaignFile);
    if (campaign) {
      validateCampaignRecord(campaign);
    }
    return campaign;
  }

  async saveCampaign(campaign: CampaignRecord): Promise<void> {
    validateCampaignRecord(campaign);
    await writeJsonFile(this.paths.campaignFile, campaign);
  }

  async loadCampaignLedger(): Promise<CampaignLedgerRecord | null> {
    const ledger = await readJsonFileIfExists<CampaignLedgerRecord>(this.paths.campaignLedgerFile);
    if (ledger) {
      validateCampaignLedgerRecord(ledger);
    }
    return ledger;
  }

  async saveCampaignLedger(ledger: CampaignLedgerRecord): Promise<void> {
    validateCampaignLedgerRecord(ledger);
    await writeJsonFile(this.paths.campaignLedgerFile, ledger);
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

  async saveObjectiveMarkdown(markdown: string): Promise<void> {
    await writeFile(this.paths.objectiveFile, `${markdown.trimEnd()}\n`, "utf8");
  }

  async saveReviewArtifacts(
    reviewId: string,
    payload: {
      assessmentMarkdown: string;
      findings: ObjectiveAssessmentResult;
      stageResult: Record<string, unknown>;
    }
  ): Promise<void> {
    const reviewDir = join(this.paths.reviewsDir, reviewId);
    const resultsDir = join(reviewDir, "results");
    await mkdir(resultsDir, { recursive: true });

    validateObjectiveAssessmentResult(payload.findings);
    await writeFile(join(reviewDir, "assessment.md"), `${payload.assessmentMarkdown.trimEnd()}\n`, "utf8");
    await writeJsonFile(join(reviewDir, "findings.json"), payload.findings);
    await writeJsonFile(join(resultsDir, "objective-assessing.json"), payload.stageResult);
  }

  async savePassBatch(passId: string, batchMarkdown: string, batch: PassBatchRecord): Promise<void> {
    validatePassBatchRecord(batch);
    const passDir = join(this.paths.passesDir, passId);
    await mkdir(passDir, { recursive: true });
    await writeFile(join(passDir, "batch.md"), `${batchMarkdown.trimEnd()}\n`, "utf8");
    await writeJsonFile(join(passDir, "batch.json"), batch);
  }

  async loadPassBatch(passId: string): Promise<PassBatchRecord | null> {
    const batch = await readJsonFileIfExists<PassBatchRecord>(join(this.paths.passesDir, passId, "batch.json"));
    if (batch) {
      validatePassBatchRecord(batch);
    }
    return batch;
  }

  async savePassSummary(passId: string, summary: PassSummaryRecord): Promise<void> {
    validatePassSummaryRecord(summary);
    const passDir = join(this.paths.passesDir, passId);
    await mkdir(passDir, { recursive: true });
    await writeJsonFile(join(passDir, "summary.json"), summary);
  }

  async loadPassSummary(passId: string): Promise<PassSummaryRecord | null> {
    const summary = await readJsonFileIfExists<PassSummaryRecord>(
      join(this.paths.passesDir, passId, "summary.json")
    );
    if (summary) {
      validatePassSummaryRecord(summary);
    }
    return summary;
  }

  async savePassChildRun(passId: string, payload: Record<string, unknown>): Promise<void> {
    const passDir = join(this.paths.passesDir, passId);
    await mkdir(passDir, { recursive: true });
    await writeJsonFile(join(passDir, "child-run.json"), payload);
  }

  async loadPassChildRun(passId: string): Promise<Record<string, unknown> | null> {
    return readJsonFileIfExists<Record<string, unknown>>(join(this.paths.passesDir, passId, "child-run.json"));
  }

  async clearRunControlState(): Promise<void> {
    await Promise.all([
      this.safeUnlink(this.paths.runFile),
      this.safeUnlink(this.paths.storyLedgerFile),
      this.safeUnlink(this.paths.runLedgerTransactionFile)
    ]);
    await Promise.all([
      rm(this.paths.dispatchesDir, { recursive: true, force: true }),
      rm(this.paths.sessionsDir, { recursive: true, force: true }),
      rm(this.paths.worktreesDir, { recursive: true, force: true })
    ]);
    await Promise.all([
      mkdir(this.paths.dispatchesDir, { recursive: true }),
      mkdir(this.paths.sessionsDir, { recursive: true }),
      mkdir(this.paths.worktreesDir, { recursive: true })
    ]);
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
    await this.safeUnlink(this.paths.runLedgerTransactionFile);
  }

  private async safeUnlink(path: string): Promise<void> {
    try {
      await unlink(path);
    } catch {
      // Marker is best-effort cleanup; recovery remains safe when already removed.
    }
  }
}
