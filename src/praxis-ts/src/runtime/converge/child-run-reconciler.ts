import { BlockedStateError } from "../../contracts/errors.js";
import { nowIsoUtc } from "../common/time.js";
import type {
  CampaignLedgerRecord,
  CampaignRecord,
  PassBatchRecord,
  PassSummaryRecord,
  RunRecord,
} from "../../contracts/model.js";
import type { PraxisStateRepository } from "../state/repository.js";
import type { ChildRunSlotService } from "./child-run-slot.js";
import type { ConvergePassService } from "./pass-service.js";
import { attachCommitRefsToFindings } from "./ledger.js";
import { buildPassId } from "./identity.js";
import { isRunTerminal, requiredCommitsForCompletion, stringifyError } from "./campaign-support.js";
import { CampaignStopPolicy } from "./stop-policy.js";

export interface ChildRunReconcileResult {
  continueToPlanning: boolean;
}

type AssessCallback = (
  campaign: CampaignRecord,
  ledger: CampaignLedgerRecord,
  passNumber: number,
) => Promise<{
  campaign: CampaignRecord;
  ledger: CampaignLedgerRecord;
  unresolvedAtThreshold: number;
}>;

interface PassArtifacts {
  batch: PassBatchRecord;
  summary: PassSummaryRecord;
}

// Per-child-run-status state machine for converge reconciliation. Separates "which
// step came next after the child run moved" from the rest of the campaign orchestration
// so that new child-run states (or stricter gates) can be added without editing the
// main progression loop.
export class ChildRunReconciler {
  constructor(
    private readonly repo: PraxisStateRepository,
    private readonly childRunSlot: ChildRunSlotService,
    private readonly passService: ConvergePassService,
    private readonly stopPolicy: CampaignStopPolicy,
    private readonly assess: AssessCallback,
  ) {}

  async reconcile(
    campaign: CampaignRecord,
    ledger: CampaignLedgerRecord,
  ): Promise<{
    campaign: CampaignRecord;
    ledger: CampaignLedgerRecord;
    continueToPlanning: boolean;
  }> {
    if (campaign.current_pass < 1 || !campaign.current_child_run_id) {
      throw new BlockedStateError("Campaign has no active pass to reconcile.");
    }

    const passId = buildPassId(campaign.current_pass);
    const artifacts = await this.loadPassArtifacts(passId);
    if (!artifacts) {
      this.markBlocked(
        campaign,
        `Pass ${passId} is missing batch/summary artifacts required for child reconciliation.`,
      );
      return { campaign, ledger, continueToPlanning: false };
    }

    const slotCheck = await this.assertSlotOwnership(campaign, passId);
    if (!slotCheck.ok) {
      this.markBlocked(
        campaign,
        `Pass ${passId} child-run slot validation failed: ${stringifyError(slotCheck.error)}`,
      );
      await this.patchChildRunRecord(passId, { status: "slot_mismatch" });
      return { campaign, ledger, continueToPlanning: false };
    }

    const childRun = await this.repo.loadRun();
    if (!childRun) {
      this.markBlocked(
        campaign,
        `Pass ${passId} expects child run ${campaign.current_child_run_id}, but no matching run state exists.`,
      );
      await this.patchChildRunRecord(passId, { status: "missing" });
      return { campaign, ledger, continueToPlanning: false };
    }

    await this.patchChildRunRecord(passId, {
      status: childRun.status,
      child_run_id: childRun.run_id,
      reason: childRun.routing.reason,
      next_action: childRun.routing.next_action,
      next_stage: childRun.routing.next_stage,
    });

    const transition = this.classifyTransition(childRun);
    switch (transition.kind) {
      case "still_running":
        campaign.status = campaign.auto_continue ? "running" : "waiting_for_user";
        campaign.stop_reason_code = campaign.auto_continue ? null : "needs_operator";
        campaign.reason = `Pass ${passId} is waiting for child run ${childRun.run_id} to finish (current status: ${childRun.status}).`;
        campaign.timestamps.updated_at = nowIsoUtc();
        return { campaign, ledger, continueToPlanning: false };

      case "needs_operator":
        campaign.status = "waiting_for_user";
        campaign.stop_reason_code = "needs_operator";
        campaign.reason = `Child run ${childRun.run_id} needs operator action before converge can reassess (${childRun.routing.reason}).`;
        campaign.timestamps.updated_at = nowIsoUtc();
        return { campaign, ledger, continueToPlanning: false };

      case "unsupported":
        this.markBlocked(
          campaign,
          `Child run ${childRun.run_id} is in unsupported state ${childRun.status}.`,
        );
        return { campaign, ledger, continueToPlanning: false };

      case "terminal_not_completed":
        campaign.status = "waiting_for_user";
        campaign.stop_reason_code = "needs_operator";
        campaign.reason = `Child run ${childRun.run_id} ended as ${childRun.status}; converge requires operator intervention before reassessment.`;
        campaign.timestamps.updated_at = nowIsoUtc();
        await this.repo.savePassSummary(passId, {
          ...artifacts.summary,
          outcome: "needs_operator",
          generated_at: nowIsoUtc(),
        });
        return { campaign, ledger, continueToPlanning: false };

      case "completed":
        return this.finalizeCompletedChildRun(campaign, ledger, passId, artifacts, childRun);
    }
  }

  private async loadPassArtifacts(passId: string): Promise<PassArtifacts | null> {
    const [batch, summary] = await Promise.all([
      this.repo.loadPassBatch(passId),
      this.repo.loadPassSummary(passId),
    ]);
    if (!batch || !summary) {
      return null;
    }
    return { batch, summary };
  }

  private async assertSlotOwnership(
    campaign: CampaignRecord,
    passId: string,
  ): Promise<{ ok: true } | { ok: false; error: unknown }> {
    const currentChildRunId = campaign.current_child_run_id;
    if (!currentChildRunId) {
      return {
        ok: false,
        error: new Error(`Campaign ${campaign.campaign_id} has no active child_run_id.`),
      };
    }
    const childRun = await this.repo.loadRun();
    try {
      await this.childRunSlot.assertOwnedRun(
        campaign.campaign_id,
        passId,
        currentChildRunId,
        childRun,
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }

  private classifyTransition(
    childRun: RunRecord,
  ):
    | { kind: "still_running" }
    | { kind: "needs_operator" }
    | { kind: "unsupported" }
    | { kind: "terminal_not_completed" }
    | { kind: "completed" } {
    if (childRun.status === "running" || childRun.status === "cancelling") {
      return { kind: "still_running" };
    }
    if (childRun.status === "waiting_for_user" || childRun.status === "blocked") {
      return { kind: "needs_operator" };
    }
    if (!isRunTerminal(childRun.status)) {
      return { kind: "unsupported" };
    }
    if (childRun.status !== "completed") {
      return { kind: "terminal_not_completed" };
    }
    return { kind: "completed" };
  }

  private async finalizeCompletedChildRun(
    campaign: CampaignRecord,
    ledger: CampaignLedgerRecord,
    passId: string,
    artifacts: PassArtifacts,
    childRun: RunRecord,
  ): Promise<{
    campaign: CampaignRecord;
    ledger: CampaignLedgerRecord;
    continueToPlanning: boolean;
  }> {
    const completion = await this.passService.collectChildCompletion(passId);
    if (completion.producedCommits.length > 0) {
      attachCommitRefsToFindings(
        ledger,
        artifacts.batch.selected_finding_ids,
        completion.producedCommits,
      );
    }

    if (campaign.commit_per_story) {
      const requiredCommits = requiredCommitsForCompletion(completion.completedStoryIds);
      if (completion.worktreeDirty || completion.producedCommits.length < requiredCommits) {
        campaign.status = "waiting_for_user";
        campaign.stop_reason_code = "needs_operator";
        campaign.reason = completion.worktreeDirty
          ? `Child run ${childRun.run_id} completed, but commit-per-story is enabled and the worktree still has uncommitted changes. Commit each completed story and run \`praxis converge continue\`.`
          : `Child run ${childRun.run_id} completed ${String(completion.completedStoryIds.length)} stor${completion.completedStoryIds.length === 1 ? "y" : "ies"} but produced ${String(completion.producedCommits.length)} commit(s). Commit-per-story is enabled, so each completed story must have a corresponding commit before reassessment.`;
        campaign.timestamps.updated_at = nowIsoUtc();
        await this.repo.savePassSummary(passId, {
          ...artifacts.summary,
          completed_story_ids: completion.completedStoryIds,
          produced_commits: completion.producedCommits,
          outcome: "needs_operator",
          generated_at: nowIsoUtc(),
        });
        await this.patchChildRunRecord(passId, {
          status: "completed",
          commit_policy: {
            commit_per_story: true,
            required_commits: requiredCommits,
            produced_commits: completion.producedCommits.length,
            worktree_dirty: completion.worktreeDirty,
          },
        });
        return { campaign, ledger, continueToPlanning: false };
      }
    }

    const reassessment = await this.assess(campaign, ledger, campaign.current_pass + 1);
    campaign = reassessment.campaign;
    ledger = reassessment.ledger;

    const postAssessmentDecision = this.stopPolicy.decidePostAssessment(
      campaign,
      reassessment.unresolvedAtThreshold,
    );
    const budgetExhausted =
      postAssessmentDecision === "continue" &&
      this.stopPolicy.isBudgetExhausted(campaign, campaign.current_pass + 1);
    const summaryOutcome = budgetExhausted ? "budget_exhausted" : postAssessmentDecision;

    const updatedSummary: PassSummaryRecord = {
      ...artifacts.summary,
      completed_story_ids: completion.completedStoryIds,
      produced_commits: completion.producedCommits,
      reassessment_review_id: campaign.current_review_id,
      unresolved_at_or_above_threshold: reassessment.unresolvedAtThreshold,
      outcome: summaryOutcome,
      generated_at: nowIsoUtc(),
    };
    await this.repo.savePassSummary(passId, updatedSummary);
    await this.patchChildRunRecord(passId, {
      status: "completed",
      completed_at: nowIsoUtc(),
      produced_commits: completion.producedCommits,
      completed_story_ids: completion.completedStoryIds,
      reassessment_review_id: campaign.current_review_id,
      unresolved_at_or_above_threshold: reassessment.unresolvedAtThreshold,
    });

    campaign.current_child_run_id = null;
    await this.childRunSlot.release(campaign.campaign_id, passId, "Child run reconciled.");

    if (summaryOutcome !== "continue") {
      campaign.status = "completed";
      campaign.stop_reason_code = summaryOutcome;
      campaign.reason = this.stopPolicy.stopReasonMessage(summaryOutcome);
      campaign.timestamps.updated_at = nowIsoUtc();
      return { campaign, ledger, continueToPlanning: false };
    }

    campaign.status = "running";
    campaign.stop_reason_code = null;
    campaign.reason = `Pass ${passId} child remediation completed and reassessment is recorded as ${campaign.current_review_id ?? "(none)"}.`;
    campaign.timestamps.updated_at = nowIsoUtc();
    return { campaign, ledger, continueToPlanning: true };
  }

  private markBlocked(campaign: CampaignRecord, reason: string): void {
    campaign.status = "blocked";
    campaign.stop_reason_code = "blocked";
    campaign.reason = reason;
    campaign.timestamps.updated_at = nowIsoUtc();
  }

  private async patchChildRunRecord(passId: string, patch: Record<string, unknown>): Promise<void> {
    const existing = (await this.repo.loadPassChildRun(passId)) ?? {};
    await this.repo.savePassChildRun(passId, {
      ...existing,
      ...patch,
      updated_at: nowIsoUtc(),
    });
  }
}
