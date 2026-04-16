import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { InvalidInputError, BlockedStateError, RejectedProgressionError } from "../../contracts/errors.js";
import { nowIsoUtc } from "../common/time.js";
import type {
  CampaignLedgerRecord,
  CampaignRecord,
  FindingStatus,
  PassSummaryRecord
} from "../../contracts/model.js";
import type { PraxisStateRepository } from "../state/repository.js";
import { assessObjective } from "./assessment.js";
import { buildChildRunId, buildPassId, buildReviewId } from "./identity.js";
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
import { listCommitRange, readHeadCommit } from "./git.js";
import { isAtOrAboveSeverity } from "./severity.js";
import type {
  ConvergeActionOutcome,
  ConvergeInspectProjection,
  ConvergeRunInput,
  ConvergeStatusProjection
} from "./types.js";

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
      workflow: input.workflow,
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
      unresolved_at_or_above_threshold: countUnresolvedAtOrAboveThreshold(
        ledger,
        campaign.severity_threshold
      )
    };
  }

  async inspectCampaign(): Promise<ConvergeInspectProjection> {
    const campaign = await this.requireCampaign();
    const ledger = await this.requireCampaignLedger();
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
      recent_pass_ids: passIds
    };
  }

  private async progressCampaign(
    campaign: CampaignRecord,
    ledger: CampaignLedgerRecord,
    objectiveText: string
  ): Promise<{ campaign: CampaignRecord; ledger: CampaignLedgerRecord }> {
    while (campaign.status === "running") {
      const passNumber = campaign.current_pass + 1;
      const passId = buildPassId(passNumber);
      const reviewId = buildReviewId(passNumber);
      const now = nowIsoUtc();

      const { assessment, assessmentMarkdown } = await assessObjective({
        repoRoot: this.repo.paths.root,
        profile: campaign.profile,
        objectivePath: campaign.objective.normalized_path,
        objectiveText,
        scope: campaign.objective.scope,
        reviewId,
        generatedAt: now
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

      campaign.current_pass = passNumber;
      campaign.current_review_id = reviewId;

      const unresolvedAtThreshold = countUnresolvedAtOrAboveThreshold(merged.ledger, campaign.severity_threshold);
      const previousUnresolved = campaign.metrics.last_unresolved_at_or_above_threshold;
      if (previousUnresolved !== null && unresolvedAtThreshold >= previousUnresolved) {
        campaign.metrics.no_progress_passes += 1;
      } else {
        campaign.metrics.no_progress_passes = 0;
      }
      campaign.metrics.last_unresolved_at_or_above_threshold = unresolvedAtThreshold;

      let outcome: PassSummaryRecord["outcome"];
      let plannedFindingIds: string[] = [];
      let completedStoryIds: string[] = [];
      let childRunId: string | null = null;
      let producedCommits: string[] = [];

      if (unresolvedAtThreshold === 0) {
        campaign.status = "completed";
        campaign.stop_reason_code = "converged";
        campaign.reason = "No unresolved findings remain at or above the configured threshold.";
        outcome = "converged";
      } else if (campaign.metrics.no_progress_passes >= 2) {
        campaign.status = "completed";
        campaign.stop_reason_code = "stalled";
        campaign.reason = "Campaign stalled: repeated passes did not reduce unresolved findings.";
        outcome = "stalled";
      } else if (passNumber >= campaign.max_passes) {
        campaign.status = "completed";
        campaign.stop_reason_code = "budget_exhausted";
        campaign.reason = "Campaign reached the configured max pass budget.";
        outcome = "budget_exhausted";
      } else {
        const beforeHead = await readHeadCommit(this.repo.paths.root);
        const batchPlan = planPassBatch({
          campaignId: campaign.campaign_id,
          passNumber,
          reviewId,
          ledger: merged.ledger,
          severityThreshold: campaign.severity_threshold,
          maxFindingsPerPass: campaign.max_findings_per_pass,
          maxStoriesPerPass: campaign.max_stories_per_pass,
          generatedAt: nowIsoUtc()
        });
        plannedFindingIds = batchPlan.batch.selected_finding_ids;
        completedStoryIds = batchPlan.batch.stories.map((story) => story.story_id);
        childRunId = buildChildRunId(passNumber);
        markFindingsBatched(merged.ledger, plannedFindingIds);
        markFindingsInProgress(merged.ledger, plannedFindingIds, childRunId, completedStoryIds);
        await this.repo.savePassBatch(batchPlan.passId, batchPlan.batchMarkdown, batchPlan.batch);

        const afterHead = await readHeadCommit(this.repo.paths.root);
        if (campaign.commit_per_story) {
          producedCommits = await listCommitRange(this.repo.paths.root, beforeHead, afterHead);
          attachCommitRefsToFindings(merged.ledger, plannedFindingIds, producedCommits);
        }

        if (campaign.auto_continue) {
          campaign.status = "running";
          campaign.stop_reason_code = null;
          campaign.reason = `Pass ${passId} planned remediation. Auto-continue enabled for next reassessment pass.`;
          outcome = "continue";
        } else {
          campaign.status = "waiting_for_user";
          campaign.stop_reason_code = "needs_operator";
          campaign.reason = `Pass ${passId} planned child forge remediation (${childRunId}). Run remediation and execute \`praxis converge continue\`.`;
          outcome = "needs_operator";
        }
      }

      campaign.current_child_run_id = childRunId;
      campaign.timestamps.updated_at = nowIsoUtc();

      const summary: PassSummaryRecord = {
        version: 1,
        campaign_id: campaign.campaign_id,
        pass_id: passId,
        pass_number: passNumber,
        child_run_id: childRunId,
        planned_finding_ids: plannedFindingIds,
        completed_story_ids: completedStoryIds,
        produced_commits: producedCommits,
        reassessment_review_id: reviewId,
        unresolved_at_or_above_threshold: unresolvedAtThreshold,
        outcome,
        generated_at: nowIsoUtc()
      };
      await this.repo.savePassSummary(passId, summary);

      if (campaign.status !== "running") {
        return { campaign, ledger: merged.ledger };
      }
    }

    return { campaign, ledger };
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
}
