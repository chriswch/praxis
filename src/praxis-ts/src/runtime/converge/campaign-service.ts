import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { InvalidInputError, BlockedStateError, RejectedProgressionError } from "../../contracts/errors.js";
import { nowIsoUtc } from "../common/time.js";
import type {
  CampaignLedgerRecord,
  CampaignRecord,
  ConvergeStageResultRecord,
  PassSummaryRecord
} from "../../contracts/model.js";
import type { PraxisStateRepository } from "../state/repository.js";
import { assessGaps } from "./assessment.js";
import { ChildRunSlotService } from "./child-run-slot.js";
import { buildPassId, buildReviewId } from "./identity.js";
import {
  attachCommitRefsToFindings,
  countUnresolvedAtOrAboveThreshold,
  createEmptyCampaignLedger,
  listActiveFindings,
  mergeAssessmentIntoLedger
} from "./ledger.js";
import { isAtOrAboveSeverity } from "./severity.js";
import type {
  ConvergeActionOutcome,
  ConvergeInspectProjection,
  ConvergeRunInput,
  ConvergeStatusProjection
} from "./types.js";
import {
  applyWaivePolicy,
  formatObjectiveMarkdown,
  formatTargetSpecMarkdown,
  isRunTerminal,
  normalizeRepoPath,
  parseReviewOrdinal,
  requiredCommitsForCompletion,
  stringifyError
} from "./campaign-support.js";
import { ConvergePassService } from "./pass-service.js";
import { buildConvergeStageResult, getConvergeStageContract } from "./stage-runtime.js";

export class ConvergeCampaignService {
  private readonly childRunSlot: ChildRunSlotService;
  private readonly passService: ConvergePassService;

  constructor(private readonly repo: PraxisStateRepository) {
    this.childRunSlot = new ChildRunSlotService(repo);
    this.passService = new ConvergePassService(repo, this.childRunSlot);
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
        `Campaign ${existing.campaign_id} is ${existing.status}. Use converge status/continue/resume/cancel.`
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
      campaign_id: `campaign_${Date.now()}`,
      workflow: "craft",
      adapter: input.adapter,
      objective: {
        source_path: input.objective,
        normalized_path: normalizedObjectivePath,
        profile: input.profile,
        scope: [...input.scope],
        created_at: now
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
        no_progress_passes: 0
      },
      timestamps: {
        created_at: now,
        updated_at: now
      }
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
        campaign.severity_threshold
      )
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
        affected_paths: finding.affected_paths
      }));

    const passIds = await this.listPassIds();
    return {
      campaign,
      target_spec_path: ".praxis/target-spec.md",
      pre_remediation_contracts: {
        "clarifying-intent": getConvergeStageContract("clarifying-intent"),
        "assessing-gaps": getConvergeStageContract("assessing-gaps"),
        "planning-remediation": getConvergeStageContract("planning-remediation")
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
        passes_dir: this.repo.paths.passesDir
      },
      unresolved_findings: unresolved,
      child_run: childRun,
      recent_pass_ids: passIds
    };
  }

  private async progressCampaign(
    campaign: CampaignRecord,
    ledger: CampaignLedgerRecord,
    objectiveText: string
  ): Promise<{ campaign: CampaignRecord; ledger: CampaignLedgerRecord }> {
    while (campaign.status === "running") {
      if (campaign.current_child_run_id) {
        const progressedChild = await this.handlePendingChildRun(campaign, ledger, objectiveText);
        campaign = progressedChild.campaign;
        ledger = progressedChild.ledger;
        if (!progressedChild.continueToPlanning) {
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
          objectiveText
        );
        campaign = assessed.campaign;
        ledger = assessed.ledger;

        if (assessed.stageResult.route.kind === "done") {
          campaign.status = "completed";
          campaign.stop_reason_code = "converged";
          campaign.reason = this.stopReasonMessage("converged");
          campaign.timestamps.updated_at = nowIsoUtc();
          return { campaign, ledger };
        }

        const decision = this.decidePostAssessmentOutcome(campaign, assessed.unresolvedAtThreshold);
        if (decision !== "continue") {
          campaign.status = "completed";
          campaign.stop_reason_code = decision;
          campaign.reason = this.stopReasonMessage(decision);
          campaign.timestamps.updated_at = nowIsoUtc();
          return { campaign, ledger };
        }
      }

      const nextPassNumber = campaign.current_pass + 1;
      if (nextPassNumber > campaign.max_passes) {
        campaign.status = "completed";
        campaign.stop_reason_code = "budget_exhausted";
        campaign.reason = "Campaign reached the configured max pass budget.";
        campaign.timestamps.updated_at = nowIsoUtc();
        return { campaign, ledger };
      }

      const launched = await this.passService.planAndLaunchPass(campaign, ledger, nextPassNumber);
      campaign = launched.campaign;
      ledger = launched.ledger;
      return { campaign, ledger };
    }

    return { campaign, ledger };
  }

  private async assessAndMerge(
    campaign: CampaignRecord,
    ledger: CampaignLedgerRecord,
    passNumber: number,
    reviewId: string,
    targetSpecText: string
  ): Promise<{
    campaign: CampaignRecord;
    ledger: CampaignLedgerRecord;
    stageResult: ConvergeStageResultRecord & { stage: "assessing-gaps" };
    unresolvedAtThreshold: number;
  }> {
    const generatedAt = nowIsoUtc();
    const { gap, gapMarkdown } = await assessGaps({
      repoRoot: this.repo.paths.root,
      profile: campaign.profile,
      targetSpecPath: ".praxis/target-spec.md",
      targetSpecText,
      scope: campaign.objective.scope,
      reviewId,
      generatedAt
    });

    const stageResult = buildConvergeStageResult({
      stage: "assessing-gaps",
      profile: campaign.profile,
      reviewId,
      outcomeCode: gap.findings.length === 0 ? "no_gaps" : "findings_recorded",
      data: {
        findings_count: gap.findings.length
      }
    });
    await this.repo.saveGapArtifacts({ gapMarkdown, gap, stageResult });

    const merged = mergeAssessmentIntoLedger(ledger, gap, passNumber, nowIsoUtc());
    applyWaivePolicy(campaign, merged.ledger);

    const unresolvedAtThreshold = countUnresolvedAtOrAboveThreshold(merged.ledger, campaign.severity_threshold);
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
      unresolvedAtThreshold
    };
  }

  private decidePostAssessmentOutcome(
    campaign: CampaignRecord,
    unresolvedAtThreshold: number
  ): "continue" | "converged" | "stalled" {
    if (unresolvedAtThreshold === 0) {
      return "converged";
    }
    if (campaign.metrics.no_progress_passes >= 2) {
      return "stalled";
    }
    return "continue";
  }

  private stopReasonMessage(reason: Exclude<PassSummaryRecord["outcome"], "continue" | "needs_operator">): string {
    if (reason === "converged") {
      return "No unresolved findings remain at or above the configured threshold.";
    }
    if (reason === "stalled") {
      return "Campaign stalled: repeated passes did not reduce unresolved findings.";
    }
    return "Campaign reached the configured max pass budget.";
  }

  private async handlePendingChildRun(
    campaign: CampaignRecord,
    ledger: CampaignLedgerRecord,
    objectiveText: string
  ): Promise<{ campaign: CampaignRecord; ledger: CampaignLedgerRecord; continueToPlanning: boolean }> {
    if (campaign.current_pass < 1 || !campaign.current_child_run_id) {
      throw new BlockedStateError("Campaign has no active pass to reconcile.");
    }

    const passId = buildPassId(campaign.current_pass);
    const batch = await this.repo.loadPassBatch(passId);
    const summary = await this.repo.loadPassSummary(passId);
    if (!batch || !summary) {
      campaign.status = "blocked";
      campaign.stop_reason_code = "blocked";
      campaign.reason = `Pass ${passId} is missing batch/summary artifacts required for child reconciliation.`;
      campaign.timestamps.updated_at = nowIsoUtc();
      return { campaign, ledger, continueToPlanning: false };
    }

    const childRun = await this.repo.loadRun();
    try {
      await this.childRunSlot.assertOwnedRun(
        campaign.campaign_id,
        passId,
        campaign.current_child_run_id,
        childRun
      );
    } catch (error) {
      campaign.status = "blocked";
      campaign.stop_reason_code = "blocked";
      campaign.reason = `Pass ${passId} child-run slot validation failed: ${stringifyError(error)}`;
      campaign.timestamps.updated_at = nowIsoUtc();
      await this.repo.savePassChildRun(passId, {
        ...(await this.repo.loadPassChildRun(passId) ?? {}),
        status: "slot_mismatch",
        updated_at: nowIsoUtc()
      });
      return { campaign, ledger, continueToPlanning: false };
    }

    if (!childRun) {
      campaign.status = "blocked";
      campaign.stop_reason_code = "blocked";
      campaign.reason =
        `Pass ${passId} expects child run ${campaign.current_child_run_id}, but no matching run state exists.`;
      campaign.timestamps.updated_at = nowIsoUtc();
      await this.repo.savePassChildRun(passId, {
        ...(await this.repo.loadPassChildRun(passId) ?? {}),
        status: "missing",
        updated_at: nowIsoUtc()
      });
      return { campaign, ledger, continueToPlanning: false };
    }

    await this.repo.savePassChildRun(passId, {
      ...(await this.repo.loadPassChildRun(passId) ?? {}),
      status: childRun.status,
      child_run_id: childRun.run_id,
      reason: childRun.routing.reason,
      next_action: childRun.routing.next_action,
      next_stage: childRun.routing.next_stage,
      updated_at: nowIsoUtc()
    });

    if (childRun.status === "running" || childRun.status === "cancelling") {
      campaign.status = campaign.auto_continue ? "running" : "waiting_for_user";
      campaign.stop_reason_code = campaign.auto_continue ? null : "needs_operator";
      campaign.reason =
        `Pass ${passId} is waiting for child run ${childRun.run_id} to finish (current status: ${childRun.status}).`;
      campaign.timestamps.updated_at = nowIsoUtc();
      return { campaign, ledger, continueToPlanning: false };
    }

    if (childRun.status === "waiting_for_user" || childRun.status === "blocked") {
      campaign.status = "waiting_for_user";
      campaign.stop_reason_code = "needs_operator";
      campaign.reason =
        `Child run ${childRun.run_id} needs operator action before converge can reassess (${childRun.routing.reason}).`;
      campaign.timestamps.updated_at = nowIsoUtc();
      return { campaign, ledger, continueToPlanning: false };
    }

    if (!isRunTerminal(childRun.status)) {
      campaign.status = "blocked";
      campaign.stop_reason_code = "blocked";
      campaign.reason =
        `Child run ${childRun.run_id} is in unsupported state ${childRun.status}.`;
      campaign.timestamps.updated_at = nowIsoUtc();
      return { campaign, ledger, continueToPlanning: false };
    }

    if (childRun.status !== "completed") {
      campaign.status = "waiting_for_user";
      campaign.stop_reason_code = "needs_operator";
      campaign.reason =
        `Child run ${childRun.run_id} ended as ${childRun.status}; converge requires operator intervention before reassessment.`;
      campaign.timestamps.updated_at = nowIsoUtc();
      await this.repo.savePassSummary(passId, {
        ...summary,
        outcome: "needs_operator",
        generated_at: nowIsoUtc()
      });
      return { campaign, ledger, continueToPlanning: false };
    }

    const completion = await this.passService.collectChildCompletion(passId);
    if (completion.producedCommits.length > 0) {
      attachCommitRefsToFindings(ledger, batch.selected_finding_ids, completion.producedCommits);
    }

    if (campaign.commit_per_story) {
      const requiredCommits = requiredCommitsForCompletion(completion.completedStoryIds);
      if (completion.worktreeDirty || completion.producedCommits.length < requiredCommits) {
        campaign.status = "waiting_for_user";
        campaign.stop_reason_code = "needs_operator";
        campaign.reason = completion.worktreeDirty
          ? `Child run ${childRun.run_id} completed, but commit-per-story is enabled and the worktree still has uncommitted changes. Commit each completed story and run \`praxis converge continue\`.`
          : `Child run ${childRun.run_id} completed ${completion.completedStoryIds.length} stor${completion.completedStoryIds.length === 1 ? "y" : "ies"} but produced ${completion.producedCommits.length} commit(s). Commit-per-story is enabled, so each completed story must have a corresponding commit before reassessment.`;
        campaign.timestamps.updated_at = nowIsoUtc();
        await this.repo.savePassSummary(passId, {
          ...summary,
          completed_story_ids: completion.completedStoryIds,
          produced_commits: completion.producedCommits,
          outcome: "needs_operator",
          generated_at: nowIsoUtc()
        });
        await this.repo.savePassChildRun(passId, {
          ...(await this.repo.loadPassChildRun(passId) ?? {}),
          status: "completed",
          commit_policy: {
            commit_per_story: true,
            required_commits: requiredCommits,
            produced_commits: completion.producedCommits.length,
            worktree_dirty: completion.worktreeDirty
          },
          updated_at: nowIsoUtc()
        });
        return { campaign, ledger, continueToPlanning: false };
      }
    }

    const reassessment = await this.assessAndMerge(
      campaign,
      ledger,
      campaign.current_pass + 1,
      this.nextReviewId(campaign),
      objectiveText
    );
    campaign = reassessment.campaign;
    ledger = reassessment.ledger;

    const postAssessmentDecision = this.decidePostAssessmentOutcome(campaign, reassessment.unresolvedAtThreshold);
    const budgetExhausted =
      postAssessmentDecision === "continue" && (campaign.current_pass + 1 > campaign.max_passes);
    const summaryOutcome = budgetExhausted ? "budget_exhausted" : postAssessmentDecision;

    const updatedSummary: PassSummaryRecord = {
      ...summary,
      completed_story_ids: completion.completedStoryIds,
      produced_commits: completion.producedCommits,
      reassessment_review_id: campaign.current_review_id,
      unresolved_at_or_above_threshold: reassessment.unresolvedAtThreshold,
      outcome: summaryOutcome,
      generated_at: nowIsoUtc()
    };
    await this.repo.savePassSummary(passId, updatedSummary);
    await this.repo.savePassChildRun(passId, {
      ...(await this.repo.loadPassChildRun(passId) ?? {}),
      status: "completed",
      completed_at: nowIsoUtc(),
      produced_commits: completion.producedCommits,
      completed_story_ids: completion.completedStoryIds,
      reassessment_review_id: campaign.current_review_id,
      unresolved_at_or_above_threshold: reassessment.unresolvedAtThreshold
    });

    campaign.current_child_run_id = null;
    await this.childRunSlot.release(campaign.campaign_id, passId, "Child run reconciled.");

    if (summaryOutcome === "converged") {
      campaign.status = "completed";
      campaign.stop_reason_code = "converged";
      campaign.reason = this.stopReasonMessage("converged");
      campaign.timestamps.updated_at = nowIsoUtc();
      return { campaign, ledger, continueToPlanning: false };
    }
    if (summaryOutcome === "stalled") {
      campaign.status = "completed";
      campaign.stop_reason_code = "stalled";
      campaign.reason = this.stopReasonMessage("stalled");
      campaign.timestamps.updated_at = nowIsoUtc();
      return { campaign, ledger, continueToPlanning: false };
    }
    if (summaryOutcome === "budget_exhausted") {
      campaign.status = "completed";
      campaign.stop_reason_code = "budget_exhausted";
      campaign.reason = this.stopReasonMessage("budget_exhausted");
      campaign.timestamps.updated_at = nowIsoUtc();
      return { campaign, ledger, continueToPlanning: false };
    }

    campaign.status = "running";
    campaign.stop_reason_code = null;
    campaign.reason =
      `Pass ${passId} child remediation completed and reassessment is recorded as ${campaign.current_review_id}.`;
    campaign.timestamps.updated_at = nowIsoUtc();
    return { campaign, ledger, continueToPlanning: true };
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
      throw new BlockedStateError("No converge campaign ledger found at .praxis/campaign-ledger.json.");
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
      reason: campaign.reason
    };
  }

  private async refreshTargetSpecFromObjective(
    campaign: CampaignRecord,
    objectiveTextOverride?: string
  ): Promise<{
    targetSpecText: string;
    needsClarification: boolean;
    clarificationIssues: string[];
  }> {
    const objectiveText = objectiveTextOverride
      ?? await readFile(join(this.repo.paths.root, campaign.objective.normalized_path), "utf8");
    const draft = formatTargetSpecMarkdown(campaign, objectiveText);
    const outcomeCode = draft.needsClarification ? "clarification_needed" : "target_spec_ready";
    await this.repo.saveTargetSpecArtifacts({
      targetSpecMarkdown: draft.markdown,
      stageResult: buildConvergeStageResult({
        stage: "clarifying-intent",
        profile: campaign.profile,
        outcomeCode,
        data: {
          clarification_issues: draft.clarificationIssues,
          acceptance_criteria_count: draft.acceptanceCriteriaCount
        }
      })
    });

    return {
      targetSpecText: draft.markdown,
      needsClarification: draft.needsClarification,
      clarificationIssues: draft.clarificationIssues
    };
  }

}
