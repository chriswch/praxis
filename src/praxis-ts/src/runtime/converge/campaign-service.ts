import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { InvalidInputError, BlockedStateError, RejectedProgressionError } from "../../contracts/errors.js";
import { nowIsoUtc } from "../common/time.js";
import type {
  CampaignLedgerRecord,
  CampaignRecord,
  FindingStatus,
  PassBatchRecord,
  PassSummaryRecord,
  RunRecord,
  StoryLedgerRecord
} from "../../contracts/model.js";
import type { PraxisStateRepository } from "../state/repository.js";
import { RunController } from "../control/run-controller.js";
import { assessObjective } from "./assessment.js";
import { buildPassId, buildReviewId } from "./identity.js";
import {
  attachCommitRefsToFindings,
  countUnresolvedAtOrAboveThreshold,
  createEmptyCampaignLedger,
  listActiveFindings,
  markFindingsBatched,
  markFindingsInProgress,
  mergeAssessmentIntoLedger
} from "./ledger.js";
import { planPassBatch } from "./planner.js";
import { hasUncommittedChanges, listCommitRange, readHeadCommit } from "./git.js";
import { isAtOrAboveSeverity } from "./severity.js";
import type {
  ConvergeActionOutcome,
  ConvergeChildRunProjection,
  ConvergeInspectProjection,
  ConvergeRunInput,
  ConvergeStatusProjection
} from "./types.js";

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled"]);

function normalizeRepoPath(repoRoot: string, candidatePath: string): string {
  const absolute = isAbsolute(candidatePath)
    ? candidatePath
    : join(repoRoot, candidatePath);
  const normalized = relative(repoRoot, absolute).replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("../")) {
    throw new InvalidInputError(`Objective path must be inside repo root: ${candidatePath}`);
  }
  return normalized;
}

function findingIsActive(status: FindingStatus): boolean {
  return ["open", "batched", "in_progress", "still_open", "regressed", "escalated"].includes(status);
}

function applyWaivePolicy(campaign: CampaignRecord, ledger: CampaignLedgerRecord): void {
  if (!campaign.allow_waive) {
    return;
  }

  for (const findingId of ledger.finding_order) {
    const finding = ledger.findings[findingId];
    if (!findingIsActive(finding.status)) {
      continue;
    }
    if (finding.severity !== "low") {
      continue;
    }
    if (finding.confidence >= 0.4) {
      continue;
    }
    finding.status = "waived";
  }
}

function formatObjectiveMarkdown(campaign: CampaignRecord): string {
  return [
    "# Converge Objective",
    "",
    `- Campaign: ${campaign.campaign_id}`,
    `- Workflow: ${campaign.workflow}`,
    `- Adapter: ${campaign.adapter}`,
    `- Objective path: ${campaign.objective.normalized_path}`,
    `- Profile: ${campaign.profile}`,
    `- Severity threshold: ${campaign.severity_threshold}`,
    `- Max passes: ${campaign.max_passes}`,
    `- Max findings per pass: ${campaign.max_findings_per_pass}`,
    `- Max stories per pass: ${campaign.max_stories_per_pass}`,
    `- Commit per story: ${campaign.commit_per_story ? "enabled" : "disabled"}`,
    `- Auto continue: ${campaign.auto_continue ? "enabled" : "disabled"}`,
    `- Allow waive: ${campaign.allow_waive ? "enabled" : "disabled"}`,
    `- Scope: ${campaign.objective.scope.length > 0 ? campaign.objective.scope.join(", ") : "(repo root)"}`,
    ""
  ].join("\n");
}

function parseReviewOrdinal(reviewId: string | null): number {
  if (!reviewId) {
    return 0;
  }
  const match = /^R-(\d+)$/.exec(reviewId);
  if (!match) {
    return 0;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isNaN(value) ? 0 : value;
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRunTerminal(status: RunRecord["status"]): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

function readOptionalString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function listCompletedStoryIds(ledger: StoryLedgerRecord | null): string[] {
  if (!ledger) {
    return [];
  }
  return ledger.stories.order.filter((storyId) => ledger.stories.items[storyId]?.status === "completed");
}

function requiredCommitsForCompletion(completedStoryIds: string[]): number {
  return completedStoryIds.length > 0 ? completedStoryIds.length : 1;
}

export class ConvergeCampaignService {
  constructor(private readonly repo: PraxisStateRepository) {}

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

    const progressed = await this.progressCampaign(campaign, ledger, objectiveText);
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
    const objectiveText = await readFile(
      join(this.repo.paths.root, campaign.objective.normalized_path),
      "utf8"
    );
    campaign.status = "running";
    campaign.stop_reason_code = null;
    campaign.reason = "Campaign continued by operator.";
    campaign.timestamps.updated_at = nowIsoUtc();

    const progressed = await this.progressCampaign(campaign, ledger, objectiveText);
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
    const objectiveText = await readFile(
      join(this.repo.paths.root, campaign.objective.normalized_path),
      "utf8"
    );
    const progressed = await this.progressCampaign(campaign, ledger, objectiveText);
    await this.repo.saveCampaign(progressed.campaign);
    await this.repo.saveCampaignLedger(progressed.ledger);
    return this.toOutcome(progressed.campaign);
  }

  async cancelCampaign(note: string | null): Promise<ConvergeActionOutcome> {
    const campaign = await this.requireCampaign();
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
    const childRun = await this.resolveChildRunProjection(campaign);
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
    const childRun = await this.resolveChildRunProjection(campaign);
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
      objective_path: campaign.objective.normalized_path,
      artifacts: {
        objective_file: this.repo.paths.objectiveFile,
        campaign_file: this.repo.paths.campaignFile,
        campaign_ledger_file: this.repo.paths.campaignLedgerFile,
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

      const launched = await this.planAndLaunchPass(campaign, ledger, nextPassNumber);
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
    objectiveText: string
  ): Promise<{ campaign: CampaignRecord; ledger: CampaignLedgerRecord; unresolvedAtThreshold: number }> {
    const generatedAt = nowIsoUtc();
    const { assessment, assessmentMarkdown } = await assessObjective({
      repoRoot: this.repo.paths.root,
      profile: campaign.profile,
      objectivePath: campaign.objective.normalized_path,
      objectiveText,
      scope: campaign.objective.scope,
      reviewId,
      generatedAt
    });

    await this.repo.saveReviewArtifacts(reviewId, {
      assessmentMarkdown,
      findings: assessment,
      stageResult: {
        version: 1,
        stage: "objective-assessing",
        status: "completed",
        profile: campaign.profile,
        review_id: reviewId,
        route: {
          kind: "proceed"
        },
        data: {
          outcome_code: assessment.findings.length === 0 ? "no_gaps" : "findings_recorded",
          findings_count: assessment.findings.length
        }
      }
    });

    const merged = mergeAssessmentIntoLedger(ledger, assessment, passNumber, nowIsoUtc());
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

  private async planAndLaunchPass(
    campaign: CampaignRecord,
    ledger: CampaignLedgerRecord,
    passNumber: number
  ): Promise<{ campaign: CampaignRecord; ledger: CampaignLedgerRecord }> {
    if (!campaign.current_review_id) {
      throw new BlockedStateError("Cannot plan remediation without an assessment review id.");
    }

    const passId = buildPassId(passNumber);
    const batchPlan = planPassBatch({
      campaignId: campaign.campaign_id,
      passNumber,
      reviewId: campaign.current_review_id,
      ledger,
      severityThreshold: campaign.severity_threshold,
      maxFindingsPerPass: campaign.max_findings_per_pass,
      maxStoriesPerPass: campaign.max_stories_per_pass,
      generatedAt: nowIsoUtc()
    });

    markFindingsBatched(ledger, batchPlan.batch.selected_finding_ids);
    await this.repo.savePassBatch(batchPlan.passId, batchPlan.batchMarkdown, batchPlan.batch);

    let launchResult: {
      childRunId: string;
      childRunRecord: Record<string, unknown>;
    };
    try {
      launchResult = await this.launchChildCraftRun(campaign, passId, batchPlan.batch);
    } catch (error) {
      campaign.status = "waiting_for_user";
      campaign.stop_reason_code = "blocked";
      campaign.reason =
        `Pass ${passId} batch planned but child craft launch failed: ${stringifyError(error)}`;
      campaign.timestamps.updated_at = nowIsoUtc();

      const summary: PassSummaryRecord = {
        version: 1,
        campaign_id: campaign.campaign_id,
        pass_id: passId,
        pass_number: passNumber,
        child_run_id: null,
        assessment_review_id: campaign.current_review_id,
        reassessment_review_id: null,
        planned_finding_ids: batchPlan.batch.selected_finding_ids,
        completed_story_ids: [],
        produced_commits: [],
        unresolved_at_or_above_threshold: countUnresolvedAtOrAboveThreshold(ledger, campaign.severity_threshold),
        outcome: "needs_operator",
        generated_at: nowIsoUtc()
      };
      await this.repo.savePassSummary(passId, summary);
      await this.repo.savePassChildRun(passId, {
        version: 2,
        child_run_id: null,
        workflow: campaign.workflow,
        adapter: campaign.adapter,
        status: "launch_failed",
        launch_error: stringifyError(error),
        generated_at: nowIsoUtc()
      });
      return { campaign, ledger };
    }

    const plannedStoryIds = batchPlan.batch.stories.map((story) => story.story_id);
    markFindingsInProgress(ledger, batchPlan.batch.selected_finding_ids, launchResult.childRunId, plannedStoryIds);
    await this.repo.savePassChildRun(passId, launchResult.childRunRecord);

    const summary: PassSummaryRecord = {
      version: 1,
      campaign_id: campaign.campaign_id,
      pass_id: passId,
      pass_number: passNumber,
      child_run_id: launchResult.childRunId,
      assessment_review_id: campaign.current_review_id,
      reassessment_review_id: null,
      planned_finding_ids: batchPlan.batch.selected_finding_ids,
      completed_story_ids: [],
      produced_commits: [],
      unresolved_at_or_above_threshold: countUnresolvedAtOrAboveThreshold(ledger, campaign.severity_threshold),
      outcome: campaign.auto_continue ? "continue" : "needs_operator",
      generated_at: nowIsoUtc()
    };
    await this.repo.savePassSummary(passId, summary);

    campaign.current_pass = passNumber;
    campaign.current_child_run_id = launchResult.childRunId;
    if (campaign.auto_continue) {
      campaign.status = "running";
      campaign.stop_reason_code = null;
      campaign.reason =
        `Pass ${passId} launched child craft run ${launchResult.childRunId}. Waiting for child completion before reassessment.`;
    } else {
      campaign.status = "waiting_for_user";
      campaign.stop_reason_code = "needs_operator";
      campaign.reason =
        `Pass ${passId} launched child craft remediation (${launchResult.childRunId}). Complete the child run and execute \`praxis converge continue\`.`;
    }
    campaign.timestamps.updated_at = nowIsoUtc();

    return { campaign, ledger };
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
      campaign.status = "waiting_for_user";
      campaign.stop_reason_code = "blocked";
      campaign.reason = `Pass ${passId} is missing batch/summary artifacts required for child reconciliation.`;
      campaign.timestamps.updated_at = nowIsoUtc();
      return { campaign, ledger, continueToPlanning: false };
    }

    const childRun = await this.repo.loadRun();
    if (!childRun || childRun.run_id !== campaign.current_child_run_id) {
      campaign.status = "waiting_for_user";
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
      campaign.status = "waiting_for_user";
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

    const completion = await this.collectChildCompletion(passId, childRun, batch);
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

  private async collectChildCompletion(
    passId: string,
    childRun: RunRecord,
    batch: PassBatchRecord
  ): Promise<{ completedStoryIds: string[]; producedCommits: string[]; worktreeDirty: boolean }> {
    const childRecord = await this.repo.loadPassChildRun(passId) ?? {};
    const beforeHead = readOptionalString(childRecord, "before_head");
    const afterHead = await readHeadCommit(this.repo.paths.root);
    const producedCommits = await listCommitRange(this.repo.paths.root, beforeHead, afterHead);
    const worktreeDirty = await hasUncommittedChanges(this.repo.paths.root);

    const storyLedger = await this.repo.loadStoryLedger();
    const completedStoryIds = listCompletedStoryIds(storyLedger);

    return {
      completedStoryIds,
      producedCommits,
      worktreeDirty
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

  private async resolveChildRunProjection(campaign: CampaignRecord): Promise<ConvergeChildRunProjection | null> {
    if (!campaign.current_child_run_id) {
      return null;
    }

    const passId = campaign.current_pass > 0 ? buildPassId(campaign.current_pass) : null;
    const childRecord = passId ? await this.repo.loadPassChildRun(passId) : null;
    const activeRun = await this.repo.loadRun();

    let status = childRecord ? readOptionalString(childRecord, "status") ?? "unknown" : "unknown";
    let reason = childRecord ? readOptionalString(childRecord, "reason") : null;
    let nextAction = childRecord ? readOptionalString(childRecord, "next_action") : null;
    let nextStage = childRecord ? readOptionalString(childRecord, "next_stage") : null;
    let updatedAt = childRecord ? readOptionalString(childRecord, "updated_at") : null;

    if (activeRun && activeRun.run_id === campaign.current_child_run_id) {
      status = activeRun.status;
      reason = activeRun.routing.reason;
      nextAction = activeRun.routing.next_action;
      nextStage = activeRun.routing.next_stage;
      updatedAt = activeRun.timestamps.updated_at;
    }

    const completionState: ConvergeChildRunProjection["completion_state"] =
      status === "completed"
        ? "completed"
        : ["failed", "cancelled", "blocked", "launch_failed", "missing"].includes(status)
          ? "escalated"
          : "pending";

    return {
      run_id: campaign.current_child_run_id,
      status,
      completion_state: completionState,
      reason,
      next_action: nextAction,
      next_stage: nextStage,
      updated_at: updatedAt
    };
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

  private async launchChildCraftRun(
    campaign: CampaignRecord,
    passId: string,
    batch: PassBatchRecord
  ): Promise<{
    childRunId: string;
    childRunRecord: Record<string, unknown>;
  }> {
    const existingRun = await this.repo.loadRun();
    if (existingRun) {
      if (!isRunTerminal(existingRun.status)) {
        throw new BlockedStateError(
          `Cannot launch child craft run while run ${existingRun.run_id} is ${existingRun.status}.`
        );
      }
      await this.repo.clearRunControlState();
    }

    const beforeHead = await readHeadCommit(this.repo.paths.root);

    const controller = new RunController(this.repo);
    const run = await controller.initializeRun({
      adapter: campaign.adapter,
      executionMode: "autopilot",
      entryTask: `Converge remediation for ${passId}`
    });
    const launch = await controller.launchReadyStage();
    const launchCommand =
      `praxis run --adapter ${campaign.adapter} --execution-mode autopilot --entry-task "Converge remediation for ${passId}"`;
    return {
      childRunId: run.run_id,
      childRunRecord: {
        version: 2,
        child_run_id: run.run_id,
        workflow: campaign.workflow,
        adapter: campaign.adapter,
        status: "running",
        before_head: beforeHead,
        launch_command: launchCommand,
        dispatch_id: launch.dispatch_id,
        worker_id: launch.worker_id,
        session_id: launch.session_id,
        locator: launch.locator,
        brief: {
          pass_id: passId,
          finding_ids: batch.selected_finding_ids,
          objective_path: campaign.objective.normalized_path,
          objective_context: batch.stories.map((story) => ({
            story_id: story.story_id,
            title: story.title,
            finding_ids: story.finding_ids,
            non_goals: story.non_goals
          })),
          scope: campaign.objective.scope,
          non_goals: [
            "Do not expand remediation beyond selected finding IDs in this pass.",
            "Escalate newly discovered out-of-scope high-risk issues to next reassessment."
          ]
        },
        commit_policy: {
          commit_per_story: campaign.commit_per_story
        },
        generated_at: nowIsoUtc()
      }
    };
  }
}
