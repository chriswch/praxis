import { join, relative } from "node:path";
import { unlink, writeFile, mkdir, rm } from "node:fs/promises";
import type {
  CampaignLedgerRecord,
  CampaignRecord,
  ChildRunSlotRecord,
  ConvergeStageResultRecord,
  DispatchRecord,
  GapAssessmentResult,
  LifecycleEvent,
  PassBatchRecord,
  PassSummaryRecord,
  RemediationMapRecord,
  RunRecord,
  StageResultRecord,
  StoryLedgerRecord,
} from "../../contracts/model.js";
import {
  validateCampaignLedgerRecord,
  validateCampaignRecord,
  validateChildRunSlotRecord,
  validateConvergeStageResult,
  validateDispatchRecord,
  validateGapAssessmentResult,
  validatePassBatchRecord,
  validatePassSummaryRecord,
  validateRemediationMapRecord,
  validateRunRecord,
  validateStageResult,
  validateStoryLedgerRecord,
} from "../../contracts/validators.js";
import {
  appendJsonLine,
  ensureDir,
  readJsonFileIfExists,
  readJsonLines,
  writeJsonFile,
} from "./store.js";
import { resolvePraxisPaths, type PraxisPathSet } from "./paths.js";
import { canonicalizeGapFingerprints } from "../converge/gap-fingerprints.js";

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
    await ensureDir(this.paths.clarificationsDir);
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

  async loadChildRunSlot(): Promise<ChildRunSlotRecord | null> {
    const slot = await readJsonFileIfExists<ChildRunSlotRecord>(this.paths.childRunSlotFile);
    if (slot) {
      validateChildRunSlotRecord(slot);
    }
    return slot;
  }

  async saveChildRunSlot(slot: ChildRunSlotRecord): Promise<void> {
    validateChildRunSlotRecord(slot);
    await writeJsonFile(this.paths.childRunSlotFile, slot);
  }

  async clearChildRunSlot(): Promise<void> {
    await this.safeUnlink(this.paths.childRunSlotFile);
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
      ledger,
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
      join(this.paths.dispatchesDir, `${dispatchId}.json`),
    );
    if (dispatch) {
      validateDispatchRecord(dispatch);
    }
    return dispatch;
  }

  async appendLifecycleEvent(event: LifecycleEvent): Promise<void> {
    await appendJsonLine(this.paths.eventsFile, event);
  }

  async appendAuditWarning(payload: Record<string, unknown>): Promise<void> {
    await appendJsonLine(this.paths.auditWarningsFile, payload);
  }

  async appendStageResultRecord(payload: StageResultRecord): Promise<void> {
    await appendJsonLine(
      this.paths.stageHistoryFile,
      payload as unknown as Record<string, unknown>,
    );
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
      join(this.paths.sessionsDir, `${sessionId}.json`),
    );
  }

  async saveWorktreeRecord(dispatchId: string, payload: Record<string, unknown>): Promise<void> {
    await writeJsonFile(join(this.paths.worktreesDir, `${dispatchId}.json`), payload);
  }

  async loadWorktreeRecord(dispatchId: string): Promise<Record<string, unknown> | null> {
    return readJsonFileIfExists<Record<string, unknown>>(
      join(this.paths.worktreesDir, `${dispatchId}.json`),
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

  async saveTargetSpecMarkdown(markdown: string): Promise<void> {
    await writeFile(this.paths.targetSpecFile, `${markdown.trimEnd()}\n`, "utf8");
  }

  async saveGapArtifacts(payload: {
    gapMarkdown: string;
    gap: GapAssessmentResult;
    stageResult: ConvergeStageResultRecord & { stage: "assessing-gaps" };
  }): Promise<string[]> {
    canonicalizeGapFingerprints(payload.gap);
    validateGapAssessmentResult(payload.gap);
    validateConvergeStageResult(payload.stageResult);

    // Materialise the review mirror under .praxis/reviews/<review_id>/ FIRST
    // so a crash mid-flight cannot leave the discoverable root .praxis/gap.* /
    // results/assessing-gaps.json out of sync with an empty review directory.
    // Once the mirror is in place we copy through to the root paths.
    //
    // This is one-directional: a crash AFTER the mirror is on disk but BEFORE
    // the root files are rewritten leaves the mirror "ahead" of the root. We
    // tolerate that window because (a) loadGapAssessment reads only the root
    // .praxis/gap.json — a stale root reflects the previous pass, not corrupt
    // state — and (b) the mirror is the historical record per review_id, so a
    // mirror that exists without a matching root is recoverable on next pass.
    // See validateAndAppendStageResult for the audit-trail equivalent. If
    // future readers cross the boundary, lift this to a transaction marker
    // (cf. saveRunAndStoryLedger / recoverRunLedgerTransactionIfPresent).
    const trimmedMarkdown = `${payload.gapMarkdown.trimEnd()}\n`;
    const reviewDir = join(this.paths.reviewsDir, payload.gap.review_id);
    const reviewResultsDir = join(reviewDir, "results");
    await mkdir(reviewResultsDir, { recursive: true });
    const reviewGapMd = join(reviewDir, "gap.md");
    const reviewGapJson = join(reviewDir, "gap.json");
    const reviewStageResult = join(reviewResultsDir, "assessing-gaps.json");
    await writeFile(reviewGapMd, trimmedMarkdown, "utf8");
    await writeJsonFile(reviewGapJson, payload.gap);
    await writeJsonFile(reviewStageResult, payload.stageResult);

    const resultsDir = join(this.paths.praxisDir, "results");
    await mkdir(resultsDir, { recursive: true });
    const rootStageResult = join(resultsDir, "assessing-gaps.json");
    await writeFile(this.paths.gapFile, trimmedMarkdown, "utf8");
    await writeJsonFile(this.paths.gapDataFile, payload.gap);
    await writeJsonFile(rootStageResult, payload.stageResult);

    return [
      relative(this.paths.root, this.paths.gapFile),
      relative(this.paths.root, this.paths.gapDataFile),
      relative(this.paths.root, rootStageResult),
      relative(this.paths.root, reviewGapMd),
      relative(this.paths.root, reviewGapJson),
      relative(this.paths.root, reviewStageResult),
    ];
  }

  async loadGapAssessment(): Promise<GapAssessmentResult | null> {
    const gap = await readJsonFileIfExists<GapAssessmentResult>(this.paths.gapDataFile);
    if (gap) {
      const changedFingerprints = canonicalizeGapFingerprints(gap);
      validateGapAssessmentResult(gap);
      if (changedFingerprints) {
        await writeJsonFile(this.paths.gapDataFile, gap);
      }
    }
    return gap;
  }

  async savePassBatch(
    passId: string,
    batchMarkdown: string,
    batch: PassBatchRecord,
  ): Promise<void> {
    validatePassBatchRecord(batch);
    const passDir = join(this.paths.passesDir, passId);
    await mkdir(passDir, { recursive: true });
    await writeFile(join(passDir, "batch.md"), `${batchMarkdown.trimEnd()}\n`, "utf8");
    await writeJsonFile(join(passDir, "batch.json"), batch);
  }

  async loadPassBatch(passId: string): Promise<PassBatchRecord | null> {
    const batch = await readJsonFileIfExists<PassBatchRecord>(
      join(this.paths.passesDir, passId, "batch.json"),
    );
    if (batch) {
      validatePassBatchRecord(batch);
    }
    return batch;
  }

  async saveRemediationMap(
    markdown: string,
    remediationMap: RemediationMapRecord,
    stageResult: ConvergeStageResultRecord & { stage: "planning-remediation" },
  ): Promise<void> {
    validateRemediationMapRecord(remediationMap);
    validateConvergeStageResult(stageResult);
    const resultsDir = join(this.paths.praxisDir, "results");
    await mkdir(resultsDir, { recursive: true });
    await writeFile(this.paths.remediationMapFile, `${markdown.trimEnd()}\n`, "utf8");
    await writeJsonFile(this.paths.remediationMapDataFile, remediationMap);
    await writeJsonFile(join(resultsDir, "planning-remediation.json"), stageResult);

    const reviewDir = join(this.paths.reviewsDir, remediationMap.review_id);
    const reviewResultsDir = join(reviewDir, "results");
    await mkdir(reviewResultsDir, { recursive: true });
    await writeFile(join(reviewDir, "remediation-map.md"), `${markdown.trimEnd()}\n`, "utf8");
    await writeJsonFile(join(reviewDir, "remediation-map.json"), remediationMap);
    await writeJsonFile(join(reviewResultsDir, "planning-remediation.json"), stageResult);
  }

  async savePassSummary(passId: string, summary: PassSummaryRecord): Promise<void> {
    validatePassSummaryRecord(summary);
    const passDir = join(this.paths.passesDir, passId);
    await mkdir(passDir, { recursive: true });
    await writeJsonFile(join(passDir, "summary.json"), summary);
  }

  async loadPassSummary(passId: string): Promise<PassSummaryRecord | null> {
    const summary = await readJsonFileIfExists<PassSummaryRecord>(
      join(this.paths.passesDir, passId, "summary.json"),
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
    return readJsonFileIfExists<Record<string, unknown>>(
      join(this.paths.passesDir, passId, "child-run.json"),
    );
  }

  async clearRunControlState(): Promise<void> {
    await Promise.all([
      this.safeUnlink(this.paths.runFile),
      this.safeUnlink(this.paths.storyLedgerFile),
      this.safeUnlink(this.paths.runLedgerTransactionFile),
    ]);
    await Promise.all([
      rm(this.paths.dispatchesDir, { recursive: true, force: true }),
      rm(this.paths.sessionsDir, { recursive: true, force: true }),
      rm(this.paths.worktreesDir, { recursive: true, force: true }),
    ]);
    await Promise.all([
      mkdir(this.paths.dispatchesDir, { recursive: true }),
      mkdir(this.paths.sessionsDir, { recursive: true }),
      mkdir(this.paths.worktreesDir, { recursive: true }),
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
      join(this.paths.policyDir, "tool-records.jsonl"),
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
