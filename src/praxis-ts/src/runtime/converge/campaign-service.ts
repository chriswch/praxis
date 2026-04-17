import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  InvalidInputError,
  BlockedStateError,
  RejectedProgressionError,
} from "../../contracts/errors.js";
import { nowIsoUtc } from "../common/time.js";
import type {
  CampaignLedgerRecord,
  CampaignRecord,
  ConvergeStageResultRecord,
} from "../../contracts/model.js";
import type { PraxisStateRepository } from "../state/repository.js";
import { ChildRunSlotService } from "./child-run-slot.js";
import { ChildRunReconciler } from "./child-run-reconciler.js";
import { buildPassId, buildReviewId } from "./identity.js";
import {
  countUnresolvedAtOrAboveThreshold,
  createEmptyCampaignLedger,
  listActiveFindings,
  mergeAssessmentIntoLedger,
} from "./ledger.js";
import { isAtOrAboveSeverity } from "./severity.js";
import type {
  ConvergeActionOutcome,
  ConvergeInspectProjection,
  ConvergeRunInput,
  ConvergeStatusProjection,
} from "./types.js";
import {
  applyWaivePolicy,
  formatObjectiveMarkdown,
  normalizeRepoPath,
  parseReviewOrdinal,
} from "./campaign-support.js";
import { ConvergePassService } from "./pass-service.js";
import type { GapAssessor } from "./gap-assessor.js";
import { getConvergeStageContract } from "./stage-runtime.js";
import { ConvergePreRemediationService } from "./pre-remediation-service.js";
import { CampaignStopPolicy } from "./stop-policy.js";

export interface ConvergeCampaignServiceOptions {
  gapAssessor?: GapAssessor;
}

export class ConvergeCampaignService {
  private readonly childRunSlot: ChildRunSlotService;
  private readonly passService: ConvergePassService;
  private readonly preRemediation: ConvergePreRemediationService;
  private readonly stopPolicy: CampaignStopPolicy;
  private readonly reconciler: ChildRunReconciler;

  constructor(
    private readonly repo: PraxisStateRepository,
    options: ConvergeCampaignServiceOptions = {},
  ) {
    this.childRunSlot = new ChildRunSlotService(repo);
    this.passService = new ConvergePassService(repo, this.childRunSlot);
    this.preRemediation = new ConvergePreRemediationService(repo, options.gapAssessor);
    this.stopPolicy = new CampaignStopPolicy();
    this.reconciler = new ChildRunReconciler(
      repo,
      this.childRunSlot,
      this.passService,
      this.stopPolicy,
      async (campaign, ledger, passNumber) => {
        const result = await this.assessAndMerge(
          campaign,
          ledger,
          passNumber,
          this.nextReviewId(campaign),
          await readFile(this.repo.paths.targetSpecFile, "utf8"),
        );
        return {
          campaign: result.campaign,
          ledger: result.ledger,
          unresolvedAtThreshold: result.unresolvedAtThreshold,
        };
      },
    );
  }

  async runCampaign(input: ConvergeRunInput): Promise<ConvergeActionOutcome> {
    await this.repo.ensureLayout();
    if (!Number.isInteger(input.maxPasses) || input.maxPasses < 1) {
      throw new InvalidInputError("--max-passes must be a positive integer.");
    }
    if (!Number.isInteger(input.maxFindingsPerPass) || input.maxFindingsPerPass < 1) {
      throw new InvalidInputError("--max-findings-per-pass must be a positive integer.");
    }
    if (!Number.isInteger(input.maxStoriesPerPass) || input.maxStoriesPerPass < 1) {
      throw new InvalidInputError("--max-stories-per-pass must be a positive integer.");
    }

    const existing = await this.repo.loadCampaign();
    if (existing && !["completed", "cancelled"].includes(existing.status)) {
      throw new RejectedProgressionError(
        `Campaign ${existing.campaign_id} is ${existing.status}. Use converge status/continue/resume/cancel.`,
      );
    }

    const normalizedObjectivePath = normalizeRepoPath(this.repo.paths.root, input.objective);
    const objectiveAbsolutePath = join(this.repo.paths.root, normalizedObjectivePath);
    let objectiveText: string;
    try {
      objectiveText = await readFile(objectiveAbsolutePath, "utf8");
    } catch {
      throw new BlockedStateError(`Objective file not found: ${normalizedObjectivePath}`);
    }

    const now = nowIsoUtc();
    await this.repo.clearChildRunSlot();
    const campaign: CampaignRecord = {
      version: 1,
      campaign_id: `campaign_${String(Date.now())}`,
      workflow: "craft",
      adapter: input.adapter,
      objective: {
        source_path: input.objective,
        normalized_path: normalizedObjectivePath,
        profile: input.profile,
        scope: [...input.scope],
        created_at: now,
      },
      profile: input.profile,
      severity_threshold: input.severityThreshold,
      max_passes: input.maxPasses,
      max_findings_per_pass: input.maxFindingsPerPass,
      max_stories_per_pass: input.maxStoriesPerPass,
      commit_per_story: input.commitPerStory,
      auto_continue: input.autoContinue,
      allow_waive: input.allowWaive,
      status: "running",
      current_pass: 0,
      current_review_id: null,
      current_child_run_id: null,
      stop_reason_code: null,
      reason: "Campaign initialized. Starting first assessment pass.",
      metrics: {
        last_unresolved_at_or_above_threshold: null,
        no_progress_passes: 0,
      },
      timestamps: {
        created_at: now,
        updated_at: now,
      },
    };

    const ledger = createEmptyCampaignLedger(campaign.campaign_id, campaign.profile, now);
    await this.repo.saveCampaign(campaign);
    await this.repo.saveCampaignLedger(ledger);
    await this.repo.saveObjectiveMarkdown(formatObjectiveMarkdown(campaign));
    const targetSpec = await this.refreshTargetSpecFromObjective(campaign, objectiveText);
    if (targetSpec.needsClarification) {
      campaign.status = "waiting_for_user";
      campaign.stop_reason_code = "needs_operator";
      campaign.reason = `Clarifying-intent requires objective refinement before assessment: ${targetSpec.clarificationIssues.join(" ")}`;
      campaign.timestamps.updated_at = nowIsoUtc();
      await this.repo.saveCampaign(campaign);
      await this.repo.saveCampaignLedger(ledger);
      return this.toOutcome(campaign);
    }

    const progressed = await this.progressCampaign(campaign, ledger, targetSpec.targetSpecText);
    await this.repo.saveCampaign(progressed.campaign);
    await this.repo.saveCampaignLedger(progressed.ledger);

    return this.toOutcome(progressed.campaign);
  }

  async continueCampaign(): Promise<ConvergeActionOutcome> {
    const campaign = await this.requireCampaign();
    if (campaign.status === "cancelled" || campaign.status === "completed") {
      throw new RejectedProgressionError(`Campaign is already terminal (${campaign.status}).`);
    }

    const ledger = await this.requireCampaignLedger();
    let targetSpecText = await readFile(this.repo.paths.targetSpecFile, "utf8");
    if (!campaign.current_review_id) {
      const targetSpec = await this.refreshTargetSpecFromObjective(campaign);
      targetSpecText = targetSpec.targetSpecText;
      if (targetSpec.needsClarification) {
        campaign.status = "waiting_for_user";
        campaign.stop_reason_code = "needs_operator";
        campaign.reason = `Clarifying-intent still needs objective refinement: ${targetSpec.clarificationIssues.join(" ")}`;
        campaign.timestamps.updated_at = nowIsoUtc();
        await this.repo.saveCampaign(campaign);
        await this.repo.saveCampaignLedger(ledger);
        return this.toOutcome(campaign);
      }
    }
    campaign.status = "running";
    campaign.stop_reason_code = null;
    campaign.reason = "Campaign continued by operator.";
    campaign.timestamps.updated_at = nowIsoUtc();

    const progressed = await this.progressCampaign(campaign, ledger, targetSpecText);
    await this.repo.saveCampaign(progressed.campaign);
    await this.repo.saveCampaignLedger(progressed.ledger);
    return this.toOutcome(progressed.campaign);
  }

  async resumeCampaign(): Promise<ConvergeActionOutcome> {
    const campaign = await this.requireCampaign();
    if (campaign.status === "cancelled" || campaign.status === "completed") {
      throw new RejectedProgressionError(`Campaign is already terminal (${campaign.status}).`);
    }
    const ledger = await this.requireCampaignLedger();
    let targetSpecText = await readFile(this.repo.paths.targetSpecFile, "utf8");
    if (!campaign.current_review_id) {
      const targetSpec = await this.refreshTargetSpecFromObjective(campaign);
      targetSpecText = targetSpec.targetSpecText;
      if (targetSpec.needsClarification) {
        campaign.status = "waiting_for_user";
        campaign.stop_reason_code = "needs_operator";
        campaign.reason = `Clarifying-intent still needs objective refinement: ${targetSpec.clarificationIssues.join(" ")}`;
        campaign.timestamps.updated_at = nowIsoUtc();
        await this.repo.saveCampaign(campaign);
        await this.repo.saveCampaignLedger(ledger);
        return this.toOutcome(campaign);
      }
    }
    const progressed = await this.progressCampaign(campaign, ledger, targetSpecText);
    await this.repo.saveCampaign(progressed.campaign);
    await this.repo.saveCampaignLedger(progressed.ledger);
    return this.toOutcome(progressed.campaign);
  }

  async cancelCampaign(note: string | null): Promise<ConvergeActionOutcome> {
    const campaign = await this.requireCampaign();
    if (campaign.current_child_run_id && campaign.current_pass > 0) {
      const passId = buildPassId(campaign.current_pass);
      await this.childRunSlot.release(campaign.campaign_id, passId, "Campaign cancelled.");
    }
    campaign.status = "cancelled";
    campaign.stop_reason_code = "cancelled";
    campaign.reason = note ? `Campaign cancelled. Note: ${note}` : "Campaign cancelled.";
    campaign.timestamps.updated_at = nowIsoUtc();
    await this.repo.saveCampaign(campaign);
    return this.toOutcome(campaign);
  }

  async getStatus(): Promise<ConvergeStatusProjection> {
    const campaign = await this.requireCampaign();
    const ledger = await this.requireCampaignLedger();
    const childRun = await this.passService.resolveChildRunProjection(campaign);
    return {
      campaign_id: campaign.campaign_id,
      status: campaign.status,
      profile: campaign.profile,
      severity_threshold: campaign.severity_threshold,
      current_pass: campaign.current_pass,
      max_passes: campaign.max_passes,
      stop_reason_code: campaign.stop_reason_code,
      reason: campaign.reason,
      current_review_id: campaign.current_review_id,
      current_child_run_id: campaign.current_child_run_id,
      child_run: childRun,
      unresolved_at_or_above_threshold: countUnresolvedAtOrAboveThreshold(
        ledger,
        campaign.severity_threshold,
      ),
    };
  }

  async inspectCampaign(): Promise<ConvergeInspectProjection> {
    const campaign = await this.requireCampaign();
    const ledger = await this.requireCampaignLedger();
    const childRun = await this.passService.resolveChildRunProjection(campaign);
    const unresolved = listActiveFindings(ledger)
      .filter((finding) => isAtOrAboveSeverity(finding.severity, campaign.severity_threshold))
      .map((finding) => ({
        finding_id: finding.finding_id,
        title: finding.title,
        severity: finding.severity,
        status: finding.status,
        affected_paths: finding.affected_paths,
      }));

    const passIds = await this.listPassIds();
    return {
      campaign,
      target_spec_path: ".praxis/target-spec.md",
      pre_remediation_contracts: {
        "clarifying-intent": getConvergeStageContract("clarifying-intent"),
        "assessing-gaps": getConvergeStageContract("assessing-gaps"),
        "planning-remediation": getConvergeStageContract("planning-remediation"),
      },
      artifacts: {
        objective_file: this.repo.paths.objectiveFile,
        target_spec_file: this.repo.paths.targetSpecFile,
        gap_file: this.repo.paths.gapFile,
        gap_data_file: this.repo.paths.gapDataFile,
        remediation_map_file: this.repo.paths.remediationMapFile,
        remediation_map_data_file: this.repo.paths.remediationMapDataFile,
        campaign_file: this.repo.paths.campaignFile,
        campaign_ledger_file: this.repo.paths.campaignLedgerFile,
        child_run_slot_file: this.repo.paths.childRunSlotFile,
        reviews_dir: this.repo.paths.reviewsDir,
        clarifications_dir: this.repo.paths.clarificationsDir,
        passes_dir: this.repo.paths.passesDir,
      },
      unresolved_findings: unresolved,
      child_run: childRun,
      recent_pass_ids: passIds,
    };
  }

  private async progressCampaign(
    campaign: CampaignRecord,
    ledger: CampaignLedgerRecord,
    objectiveText: string,
  ): Promise<{ campaign: CampaignRecord; ledger: CampaignLedgerRecord }> {
    while (campaign.status === "running") {
      if (campaign.current_child_run_id) {
        const reconciled = await this.reconciler.reconcile(campaign, ledger);
        campaign = reconciled.campaign;
        ledger = reconciled.ledger;
        if (!reconciled.continueToPlanning) {
          return { campaign, ledger };
        }
        continue;
      }

      if (!campaign.current_review_id) {
        const assessed = await this.assessAndMerge(
          campaign,
          ledger,
          campaign.current_pass + 1,
          this.nextReviewId(campaign),
          objectiveText,
        );
        campaign = assessed.campaign;
        ledger = assessed.ledger;

        if (assessed.stageResult.route.kind === "done") {
          this.applyTerminalStop(campaign, "converged");
          return { campaign, ledger };
        }

        const decision = this.stopPolicy.decidePostAssessment(
          campaign,
          assessed.unresolvedAtThreshold,
        );
        if (decision !== "continue") {
          this.applyTerminalStop(campaign, decision);
          return { campaign, ledger };
        }
      }

      const nextPassNumber = campaign.current_pass + 1;
      if (this.stopPolicy.isBudgetExhausted(campaign, nextPassNumber)) {
        this.applyTerminalStop(campaign, "budget_exhausted");
        return { campaign, ledger };
      }

      const launched = await this.passService.planAndLaunchPass(campaign, ledger, nextPassNumber);
      campaign = launched.campaign;
      ledger = launched.ledger;
      return { campaign, ledger };
    }

    return { campaign, ledger };
  }

  private applyTerminalStop(
    campaign: CampaignRecord,
    code: "converged" | "stalled" | "budget_exhausted",
  ): void {
    campaign.status = "completed";
    campaign.stop_reason_code = code;
    campaign.reason = this.stopPolicy.stopReasonMessage(code);
    campaign.timestamps.updated_at = nowIsoUtc();
  }

  private async assessAndMerge(
    campaign: CampaignRecord,
    ledger: CampaignLedgerRecord,
    passNumber: number,
    reviewId: string,
    targetSpecText: string,
  ): Promise<{
    campaign: CampaignRecord;
    ledger: CampaignLedgerRecord;
    stageResult: ConvergeStageResultRecord & { stage: "assessing-gaps" };
    unresolvedAtThreshold: number;
  }> {
    const { gap, stageResult } = await this.preRemediation.runAssessingGaps(
      campaign,
      targetSpecText,
      reviewId,
    );

    const merged = mergeAssessmentIntoLedger(ledger, gap, passNumber, nowIsoUtc());
    applyWaivePolicy(campaign, merged.ledger);

    const unresolvedAtThreshold = countUnresolvedAtOrAboveThreshold(
      merged.ledger,
      campaign.severity_threshold,
    );
    const previousUnresolved = campaign.metrics.last_unresolved_at_or_above_threshold;
    if (previousUnresolved !== null && unresolvedAtThreshold >= previousUnresolved) {
      campaign.metrics.no_progress_passes += 1;
    } else {
      campaign.metrics.no_progress_passes = 0;
    }
    campaign.metrics.last_unresolved_at_or_above_threshold = unresolvedAtThreshold;
    campaign.current_review_id = reviewId;
    campaign.timestamps.updated_at = nowIsoUtc();

    return {
      campaign,
      ledger: merged.ledger,
      stageResult,
      unresolvedAtThreshold,
    };
  }

  private nextReviewId(campaign: CampaignRecord): string {
    return buildReviewId(parseReviewOrdinal(campaign.current_review_id) + 1);
  }

  private async requireCampaign(): Promise<CampaignRecord> {
    const campaign = await this.repo.loadCampaign();
    if (!campaign) {
      throw new BlockedStateError("No converge campaign found at .praxis/campaign.json.");
    }
    return campaign;
  }

  private async requireCampaignLedger(): Promise<CampaignLedgerRecord> {
    const ledger = await this.repo.loadCampaignLedger();
    if (!ledger) {
      throw new BlockedStateError(
        "No converge campaign ledger found at .praxis/campaign-ledger.json.",
      );
    }
    return ledger;
  }

  private async listPassIds(): Promise<string[]> {
    try {
      const entries = await readdir(this.repo.paths.passesDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
        .slice(-10);
    } catch {
      return [];
    }
  }

  private toOutcome(campaign: CampaignRecord): ConvergeActionOutcome {
    return {
      campaign_id: campaign.campaign_id,
      status: campaign.status,
      current_pass: campaign.current_pass,
      stop_reason_code: campaign.stop_reason_code,
      reason: campaign.reason,
    };
  }

  private async refreshTargetSpecFromObjective(
    campaign: CampaignRecord,
    objectiveTextOverride?: string,
  ): Promise<{
    targetSpecText: string;
    needsClarification: boolean;
    clarificationIssues: string[];
  }> {
    const objectiveText =
      objectiveTextOverride ??
      (await readFile(join(this.repo.paths.root, campaign.objective.normalized_path), "utf8"));
    const clarifying = await this.preRemediation.runClarifyingIntent(campaign, objectiveText);

    return {
      targetSpecText: clarifying.targetSpecText,
      needsClarification: clarifying.draft.needsClarification,
      clarificationIssues: clarifying.draft.clarificationIssues,
    };
  }
}
