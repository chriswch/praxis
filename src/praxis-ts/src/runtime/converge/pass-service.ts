import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BlockedStateError } from "../../contracts/errors.js";
import { nowIsoUtc } from "../common/time.js";
import type { CampaignRecord, CampaignLedgerRecord, PassSummaryRecord, RemediationMapRecord, RunRecord } from "../../contracts/model.js";
import type { PraxisStateRepository } from "../state/repository.js";
import { RunController } from "../control/run-controller.js";
import { initializeStoryLedgerFromSliceMap } from "../control/story-boundary.js";
import { hasUncommittedChanges, listCommitRange, readHeadCommit } from "./git.js";
import {
  countUnresolvedAtOrAboveThreshold,
  markFindingsBatched,
  markFindingsInProgress
} from "./ledger.js";
import { planRemediation } from "./planner.js";
import { ChildRunSlotService } from "./child-run-slot.js";
import { buildConvergeClarifyingArtifacts, isRunTerminal, listCompletedStoryIds, readOptionalString, stringifyError } from "./campaign-support.js";
import { buildPassId } from "./identity.js";
import { buildConvergeStageResult } from "./stage-runtime.js";

const MIN_FINDING_CONFIDENCE_FOR_REMEDIATION = 0.65;

type ChildLaunchResult = {
  childRunId: string;
  childRunRecord: Record<string, unknown>;
};

type ChildCompletion = {
  completedStoryIds: string[];
  producedCommits: string[];
  worktreeDirty: boolean;
};

export class ConvergePassService {
  constructor(
    private readonly repo: PraxisStateRepository,
    private readonly childRunSlot: ChildRunSlotService
  ) {}

  async planAndLaunchPass(
    campaign: CampaignRecord,
    ledger: CampaignLedgerRecord,
    passNumber: number
  ): Promise<{ campaign: CampaignRecord; ledger: CampaignLedgerRecord }> {
    if (!campaign.current_review_id) {
      throw new BlockedStateError("Cannot plan remediation without an assessment review id.");
    }
    const latestAssessment = await this.repo.loadGapAssessment();
    if (!latestAssessment) {
      throw new BlockedStateError("Cannot plan remediation without .praxis/gap.json from assessing-gaps.");
    }

    const passId = buildPassId(passNumber);
    const batchPlan = planRemediation({
      campaignId: campaign.campaign_id,
      passNumber,
      reviewId: campaign.current_review_id,
      latestAssessment,
      ledger,
      severityThreshold: campaign.severity_threshold,
      maxFindingsPerPass: campaign.max_findings_per_pass,
      maxStoriesPerPass: campaign.max_stories_per_pass,
      minimumConfidence: MIN_FINDING_CONFIDENCE_FOR_REMEDIATION,
      generatedAt: nowIsoUtc()
    });
    const planningStageResult = buildConvergeStageResult({
      stage: "planning-remediation",
      outcomeCode: batchPlan.remediationMap.slices.length === 0
        ? "no_selection"
        : "remediation_map_ready",
      data: {
        selected_findings_count: batchPlan.remediationMap.selected_finding_ids.length,
        deferred_findings_count: batchPlan.remediationMap.deferred_finding_ids.length,
        slices_count: batchPlan.remediationMap.slices.length
      }
    });

    markFindingsBatched(ledger, batchPlan.remediationMap.selected_finding_ids);
    await this.repo.saveRemediationMap(
      batchPlan.remediationMarkdown,
      batchPlan.remediationMap,
      planningStageResult
    );
    await this.repo.savePassBatch(batchPlan.passId, batchPlan.remediationMarkdown, {
      ...batchPlan.remediationMap,
      stories: batchPlan.remediationMap.slices.map((slice) => ({
        story_id: slice.slice_id,
        title: slice.title,
        finding_ids: slice.finding_ids,
        objective_context: slice.objective,
        non_goals: slice.non_goals
      }))
    });

    if (batchPlan.remediationMap.selected_finding_ids.length === 0) {
      const confidenceGatedCount = batchPlan.confidenceDeferredFindingIds.length;
      campaign.status = "waiting_for_user";
      campaign.stop_reason_code = "needs_operator";
      campaign.reason = confidenceGatedCount > 0
        ? `Pass ${passId} selected no findings because ${confidenceGatedCount} finding(s) did not meet the confidence gate (${batchPlan.confidenceGate.toFixed(2)}). Review .praxis/gap.md and continue after objective clarification.`
        : `Pass ${passId} selected no findings under the current severity and story limits. ${String(planningStageResult.data.routing_reason ?? "Review .praxis/gap.md and continue when ready.")}`;
      campaign.timestamps.updated_at = nowIsoUtc();

      await this.repo.savePassSummary(passId, {
        version: 1,
        campaign_id: campaign.campaign_id,
        pass_id: passId,
        pass_number: passNumber,
        child_run_id: null,
        assessment_review_id: campaign.current_review_id,
        reassessment_review_id: null,
        planned_finding_ids: [],
        completed_story_ids: [],
        produced_commits: [],
        unresolved_at_or_above_threshold: countUnresolvedAtOrAboveThreshold(ledger, campaign.severity_threshold),
        outcome: "needs_operator",
        generated_at: nowIsoUtc()
      });
      await this.repo.savePassChildRun(passId, {
        version: 2,
        child_run_id: null,
        workflow: campaign.workflow,
        adapter: campaign.adapter,
        status: "not_launched",
        reason: campaign.reason,
        confidence_gate: batchPlan.confidenceGate,
        confidence_deferred_finding_ids: batchPlan.confidenceDeferredFindingIds,
        generated_at: nowIsoUtc()
      });
      return { campaign, ledger };
    }

    let launchResult: ChildLaunchResult;
    try {
      launchResult = await this.launchChildCraftRun(campaign, passId, batchPlan.remediationMap);
    } catch (error) {
      campaign.status = "blocked";
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
        planned_finding_ids: batchPlan.remediationMap.selected_finding_ids,
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

    const plannedStoryIds = batchPlan.remediationMap.slices.map((slice) => slice.slice_id);
    markFindingsInProgress(
      ledger,
      batchPlan.remediationMap.selected_finding_ids,
      launchResult.childRunId,
      plannedStoryIds
    );
    await this.repo.savePassChildRun(passId, launchResult.childRunRecord);

    const summary: PassSummaryRecord = {
      version: 1,
      campaign_id: campaign.campaign_id,
      pass_id: passId,
      pass_number: passNumber,
      child_run_id: launchResult.childRunId,
      assessment_review_id: campaign.current_review_id,
      reassessment_review_id: null,
      planned_finding_ids: batchPlan.remediationMap.selected_finding_ids,
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

  async resolveChildRunProjection(campaign: CampaignRecord): Promise<{
    run_id: string;
    status: string;
    completion_state: "pending" | "completed" | "escalated";
    reason: string | null;
    next_action: string | null;
    next_stage: string | null;
    updated_at: string | null;
  } | null> {
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

    const completionState: "pending" | "completed" | "escalated" =
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

  async collectChildCompletion(passId: string): Promise<ChildCompletion> {
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

  private async launchChildCraftRun(
    campaign: CampaignRecord,
    passId: string,
    remediationMap: RemediationMapRecord
  ): Promise<ChildLaunchResult> {
    await this.childRunSlot.assertCanClaim(campaign.campaign_id, passId);

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
    const brief = await this.writeConvergePassBrief(campaign, passId, remediationMap);
    const run = await controller.initializeRun({
      adapter: campaign.adapter,
      executionMode: "autopilot",
      entryTask: `Converge remediation for ${passId} with authoritative scope in ${brief.markdownPath}`
    });
    await this.seedChildRunBoundedStories(
      run,
      campaign,
      passId,
      remediationMap,
      brief.markdownPath,
      beforeHead
    );

    const launch = await controller.launchReadyStage();
    await this.childRunSlot.claim(
      campaign.campaign_id,
      passId,
      run.run_id,
      `Child run ${run.run_id} launched for pass ${passId}.`
    );
    const launchCommand =
      `praxis run --adapter ${campaign.adapter} --execution-mode autopilot --entry-task "Converge remediation for ${passId} with authoritative scope in ${brief.markdownPath}"`;
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
          path: brief.markdownPath,
          json_path: brief.jsonPath,
          pass_id: passId,
          finding_ids: remediationMap.selected_finding_ids,
          target_spec_path: ".praxis/target-spec.md",
          objective_context: remediationMap.slices.map((slice) => ({
            story_id: slice.slice_id,
            title: slice.title,
            finding_ids: slice.finding_ids,
            non_goals: slice.non_goals
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

  private async writeConvergePassBrief(
    campaign: CampaignRecord,
    passId: string,
    remediationMap: RemediationMapRecord
  ): Promise<{ markdownPath: string; jsonPath: string }> {
    const passDir = join(this.repo.paths.passesDir, passId);
    await mkdir(passDir, { recursive: true });

    const markdownPath = `.praxis/passes/${passId}/remediation-brief.md`;
    const jsonPath = `.praxis/passes/${passId}/remediation-brief.json`;

    const payload = {
      version: 1,
      campaign_id: campaign.campaign_id,
      pass_id: passId,
      target_spec_path: ".praxis/target-spec.md",
      finding_ids: remediationMap.selected_finding_ids,
      story_ids: remediationMap.slices.map((slice) => slice.slice_id),
      commit_policy: {
        commit_per_story: campaign.commit_per_story
      },
      non_goals: [
        "Do not widen remediation beyond selected finding IDs for this pass.",
        "Record newly discovered out-of-scope findings for reassessment instead of implementing them now."
      ],
      generated_at: nowIsoUtc()
    };

    const markdown = [
      "# Converge Remediation Brief",
      "",
      `- Campaign: ${campaign.campaign_id}`,
      `- Pass: ${passId}`,
      "- Target spec: .praxis/target-spec.md",
      "- Gap assessment: .praxis/gap.md",
      "- Remediation map: .praxis/remediation-map.md",
      `- Selected findings: ${remediationMap.selected_finding_ids.join(", ") || "(none)"}`,
      `- Commit per story: ${campaign.commit_per_story ? "required" : "optional"}`,
      "",
      "## Scope",
      "",
      "This brief is authoritative for the active pass. Remediation must stay bounded to these stories and finding IDs.",
      ""
    ];
    for (const slice of remediationMap.slices) {
      markdown.push(`### ${slice.slice_id} ${slice.title}`);
      markdown.push(`- Finding IDs: ${slice.finding_ids.join(", ")}`);
      markdown.push(`- Objective: ${slice.objective}`);
      markdown.push(`- Scope: ${slice.scope.join(", ")}`);
      markdown.push(`- Dependencies: ${slice.dependencies.length > 0 ? slice.dependencies.join(", ") : "(none)"}`);
      markdown.push(`- Done condition: ${slice.done_condition}`);
      markdown.push(`- Non-goals: ${slice.non_goals.join(" ")}`);
      markdown.push("");
    }
    markdown.push("## Pass Non-Goals");
    markdown.push("");
    markdown.push("- Do not expand scope beyond listed finding IDs.");
    markdown.push("- Escalate high-risk out-of-scope gaps to reassessment.");
    markdown.push("");

    await writeFile(join(this.repo.paths.root, markdownPath), `${markdown.join("\n").trimEnd()}\n`, "utf8");
    await writeFile(join(this.repo.paths.root, jsonPath), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    return { markdownPath, jsonPath };
  }

  private async seedChildRunBoundedStories(
    run: RunRecord,
    campaign: CampaignRecord,
    passId: string,
    remediationMap: RemediationMapRecord,
    briefPath: string,
    beforeHead: string | null
  ): Promise<void> {
    const sliceMap = {
      slices: remediationMap.slices.map((slice) => ({
        id: slice.slice_id,
        title: slice.title
      }))
    };
    const sliceMapMarkdown = [
      "# Pass Slice Map",
      "",
      `- Source pass: ${passId}`,
      `- Objective: ${campaign.objective.normalized_path}`,
      "",
      "## Stories",
      "",
      ...remediationMap.slices.map((slice) => `- ${slice.slice_id}: ${slice.title}`),
      ""
    ].join("\n");

    await writeFile(join(this.repo.paths.root, ".praxis", "slice-map.json"), `${JSON.stringify(sliceMap, null, 2)}\n`, "utf8");
    await writeFile(join(this.repo.paths.root, ".praxis", "slice-map.md"), `${sliceMapMarkdown.trimEnd()}\n`, "utf8");

    const storyLedger = await initializeStoryLedgerFromSliceMap(
      this.repo.paths.root,
      run,
      run.execution.mode
    );
    const clarifyingArtifacts = buildConvergeClarifyingArtifacts(briefPath);
    run.constraints = {
      clarifying_required_artifacts: clarifyingArtifacts,
      clarifying_allowed_outcomes: ["story_spec_ready", "bug_fix_ready", "clarification_needed"],
      bounded_scope: {
        kind: "converge_pass",
        pass_id: passId,
        objective_path: ".praxis/target-spec.md",
        finding_ids: remediationMap.selected_finding_ids,
        story_ids: remediationMap.slices.map((slice) => slice.slice_id),
        brief_path: briefPath
      },
      commit_per_story: {
        enabled: campaign.commit_per_story,
        last_verified_head: beforeHead,
        pending_story_id: null
      }
    };
    run.routing.reason = `Converge pass ${passId} bounded to remediation brief ${briefPath}.`;
    run.timestamps.updated_at = nowIsoUtc();
    await this.repo.saveRunAndStoryLedger(run, storyLedger);
  }
}
