import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BlockedStateError } from "../../contracts/errors.js";
import { nowIsoUtc } from "../common/time.js";
import type {
  CampaignRecord,
  CampaignLedgerRecord,
  GapAssessmentResult,
  PassSummaryRecord,
  RemediationMapRecord,
  RunRecord,
} from "../../contracts/model.js";
import type { PraxisStateRepository } from "../state/repository.js";
import { RunController } from "../control/run-controller.js";
import { initializeStoryLedgerFromSliceMap } from "../control/story-boundary.js";
import { hasUncommittedChanges, listCommitRange, readHeadCommit } from "./git.js";
import {
  countUnresolvedAtOrAboveThreshold,
  markFindingsBatched,
  markFindingsInProgress,
} from "./ledger.js";
import { planRemediation } from "./planner.js";
import { ChildRunSlotService } from "./child-run-slot.js";
import {
  buildConvergeClarifyingArtifacts,
  isRunTerminal,
  listCompletedStoryIds,
  readOptionalString,
  stringifyError,
} from "./campaign-support.js";
import { buildPassId } from "./identity.js";
import { buildConvergeStageResult } from "./stage-runtime.js";

type ChildLaunchResult = {
  childRunId: string;
  childRunRecord: Record<string, unknown>;
};

type ChildCompletion = {
  completedStoryIds: string[];
  producedCommits: string[];
  worktreeDirty: boolean;
};

type PassPlan = {
  passId: string;
  passNumber: number;
  remediationMap: RemediationMapRecord;
  remediationMarkdown: string;
  planningStageResult: ReturnType<typeof buildConvergeStageResult>;
  selectedLedgerFindingIds: string[];
};

type ChildLaunchOutcome = { ok: true; value: ChildLaunchResult } | { ok: false; error: unknown };

export class ConvergePassService {
  constructor(
    private readonly repo: PraxisStateRepository,
    private readonly childRunSlot: ChildRunSlotService,
  ) {}

  async planAndLaunchPass(
    campaign: CampaignRecord,
    ledger: CampaignLedgerRecord,
    passNumber: number,
  ): Promise<{ campaign: CampaignRecord; ledger: CampaignLedgerRecord }> {
    const latestAssessment = await this.loadLatestAssessmentOrThrow(campaign);
    const plan = this.planPass(campaign, ledger, passNumber, latestAssessment);
    await this.persistPlanArtifacts(plan, ledger);

    if (plan.remediationMap.selected_finding_ids.length === 0) {
      await this.applyNoSelectionOutcome(campaign, ledger, plan, latestAssessment);
      return { campaign, ledger };
    }

    const launchOutcome = await this.tryLaunchChildRun(campaign, plan);
    if (!launchOutcome.ok) {
      await this.applyLaunchFailedOutcome(campaign, ledger, plan, launchOutcome.error);
      return { campaign, ledger };
    }

    await this.applyLaunchedOutcome(campaign, ledger, plan, launchOutcome.value);
    return { campaign, ledger };
  }

  private async loadLatestAssessmentOrThrow(
    campaign: CampaignRecord,
  ): Promise<GapAssessmentResult> {
    if (!campaign.current_review_id) {
      throw new BlockedStateError("Cannot plan remediation without an assessment review id.");
    }
    const latestAssessment = await this.repo.loadGapAssessment();
    if (!latestAssessment) {
      throw new BlockedStateError(
        "Cannot plan remediation without .praxis/gap.json from assessing-gaps.",
      );
    }
    return latestAssessment;
  }

  private planPass(
    campaign: CampaignRecord,
    ledger: CampaignLedgerRecord,
    passNumber: number,
    latestAssessment: GapAssessmentResult,
  ): PassPlan {
    const reviewId = campaign.current_review_id;
    if (!reviewId) {
      throw new BlockedStateError("Cannot plan remediation without an assessment review id.");
    }
    const batchPlan = planRemediation({
      campaignId: campaign.campaign_id,
      passNumber,
      reviewId,
      latestAssessment,
      severityThreshold: campaign.severity_threshold,
      maxFindingsPerPass: campaign.max_findings_per_pass,
      maxStoriesPerPass: campaign.max_stories_per_pass,
      generatedAt: nowIsoUtc(),
    });
    const selectedLedgerFindingIds = this.resolveLedgerFindingIds(
      latestAssessment,
      ledger,
      batchPlan.remediationMap.selected_finding_ids,
    );
    const planningStageResult = buildConvergeStageResult({
      stage: "planning-remediation",
      outcomeCode:
        batchPlan.remediationMap.slices.length === 0 ? "no_selection" : "remediation_map_ready",
      data: {
        selected_findings_count: batchPlan.remediationMap.selected_finding_ids.length,
        deferred_findings_count: batchPlan.remediationMap.deferred_finding_ids.length,
        slices_count: batchPlan.remediationMap.slices.length,
      },
    });
    return {
      passId: batchPlan.passId,
      passNumber,
      remediationMap: batchPlan.remediationMap,
      remediationMarkdown: batchPlan.remediationMarkdown,
      planningStageResult,
      selectedLedgerFindingIds,
    };
  }

  private async persistPlanArtifacts(plan: PassPlan, ledger: CampaignLedgerRecord): Promise<void> {
    markFindingsBatched(ledger, plan.selectedLedgerFindingIds);
    await this.repo.saveRemediationMap(
      plan.remediationMarkdown,
      plan.remediationMap,
      plan.planningStageResult,
    );
    await this.repo.savePassBatch(plan.passId, plan.remediationMarkdown, {
      ...plan.remediationMap,
      stories: plan.remediationMap.slices.map((slice) => ({
        story_id: slice.slice_id,
        title: slice.title,
        finding_ids: slice.finding_ids,
        objective_context: slice.objective,
        non_goals: slice.non_goals,
      })),
    });
  }

  private async applyNoSelectionOutcome(
    campaign: CampaignRecord,
    ledger: CampaignLedgerRecord,
    plan: PassPlan,
    latestAssessment: GapAssessmentResult,
  ): Promise<void> {
    const reviewId = campaign.current_review_id!;
    const severityByFindingId = new Map(
      latestAssessment.findings.map((finding) => [finding.finding_id, finding.severity]),
    );
    const highOrCriticalDeferred = plan.remediationMap.deferred_finding_ids.filter((findingId) => {
      const severity = severityByFindingId.get(findingId);
      return severity === "critical" || severity === "high";
    });
    campaign.status = "waiting_for_user";
    campaign.stop_reason_code = "needs_operator";
    campaign.reason =
      highOrCriticalDeferred.length > 0
        ? `Pass ${plan.passId} selected no findings under current severity and story limits; ${highOrCriticalDeferred.length} high-severity finding(s) were deferred by planning budget policy. Review .praxis/remediation-map.md and continue after policy adjustment.`
        : `Pass ${plan.passId} selected no findings under the current severity and story limits. ${String(plan.planningStageResult.data.routing_reason ?? "Review .praxis/gap.md and continue when ready.")}`;
    campaign.timestamps.updated_at = nowIsoUtc();

    await this.persistPassSummary(campaign, ledger, plan, {
      childRunId: null,
      plannedFindingIds: [],
      outcome: "needs_operator",
    });
    await this.repo.savePassChildRun(plan.passId, {
      version: 2,
      child_run_id: null,
      workflow: campaign.workflow,
      adapter: campaign.adapter,
      status: "not_launched",
      reason: campaign.reason,
      generated_at: nowIsoUtc(),
    });
  }

  private async tryLaunchChildRun(
    campaign: CampaignRecord,
    plan: PassPlan,
  ): Promise<ChildLaunchOutcome> {
    try {
      const value = await this.launchChildCraftRun(campaign, plan.passId, plan.remediationMap);
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error };
    }
  }

  private async applyLaunchFailedOutcome(
    campaign: CampaignRecord,
    ledger: CampaignLedgerRecord,
    plan: PassPlan,
    error: unknown,
  ): Promise<void> {
    campaign.status = "blocked";
    campaign.stop_reason_code = "blocked";
    campaign.reason = `Pass ${plan.passId} batch planned but child craft launch failed: ${stringifyError(error)}`;
    campaign.timestamps.updated_at = nowIsoUtc();

    await this.persistPassSummary(campaign, ledger, plan, {
      childRunId: null,
      plannedFindingIds: plan.remediationMap.selected_finding_ids,
      outcome: "needs_operator",
    });
    await this.repo.savePassChildRun(plan.passId, {
      version: 2,
      child_run_id: null,
      workflow: campaign.workflow,
      adapter: campaign.adapter,
      status: "launch_failed",
      launch_error: stringifyError(error),
      generated_at: nowIsoUtc(),
    });
  }

  private async applyLaunchedOutcome(
    campaign: CampaignRecord,
    ledger: CampaignLedgerRecord,
    plan: PassPlan,
    launchResult: ChildLaunchResult,
  ): Promise<void> {
    const plannedStoryIds = plan.remediationMap.slices.map((slice) => slice.slice_id);
    markFindingsInProgress(
      ledger,
      plan.selectedLedgerFindingIds,
      launchResult.childRunId,
      plannedStoryIds,
    );
    await this.repo.savePassChildRun(plan.passId, launchResult.childRunRecord);
    await this.persistPassSummary(campaign, ledger, plan, {
      childRunId: launchResult.childRunId,
      plannedFindingIds: plan.remediationMap.selected_finding_ids,
      outcome: campaign.auto_continue ? "continue" : "needs_operator",
    });

    campaign.current_pass = plan.passNumber;
    campaign.current_child_run_id = launchResult.childRunId;
    if (campaign.auto_continue) {
      campaign.status = "running";
      campaign.stop_reason_code = null;
      campaign.reason = `Pass ${plan.passId} launched child craft run ${launchResult.childRunId}. Waiting for child completion before reassessment.`;
    } else {
      campaign.status = "waiting_for_user";
      campaign.stop_reason_code = "needs_operator";
      campaign.reason = `Pass ${plan.passId} launched child craft remediation (${launchResult.childRunId}). Complete the child run and execute \`praxis converge continue\`.`;
    }
    campaign.timestamps.updated_at = nowIsoUtc();
  }

  private async persistPassSummary(
    campaign: CampaignRecord,
    ledger: CampaignLedgerRecord,
    plan: PassPlan,
    fields: {
      childRunId: string | null;
      plannedFindingIds: string[];
      outcome: PassSummaryRecord["outcome"];
    },
  ): Promise<void> {
    const summary: PassSummaryRecord = {
      version: 1,
      campaign_id: campaign.campaign_id,
      pass_id: plan.passId,
      pass_number: plan.passNumber,
      child_run_id: fields.childRunId,
      assessment_review_id: campaign.current_review_id!,
      reassessment_review_id: null,
      planned_finding_ids: fields.plannedFindingIds,
      completed_story_ids: [],
      produced_commits: [],
      unresolved_at_or_above_threshold: countUnresolvedAtOrAboveThreshold(
        ledger,
        campaign.severity_threshold,
      ),
      outcome: fields.outcome,
      generated_at: nowIsoUtc(),
    };
    await this.repo.savePassSummary(plan.passId, summary);
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

    let status = childRecord ? (readOptionalString(childRecord, "status") ?? "unknown") : "unknown";
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
      updated_at: updatedAt,
    };
  }

  async collectChildCompletion(passId: string): Promise<ChildCompletion> {
    const childRecord = (await this.repo.loadPassChildRun(passId)) ?? {};
    const beforeHead = readOptionalString(childRecord, "before_head");
    const afterHead = await readHeadCommit(this.repo.paths.root);
    const producedCommits = await listCommitRange(this.repo.paths.root, beforeHead, afterHead);
    const worktreeDirty = await hasUncommittedChanges(this.repo.paths.root);

    const storyLedger = await this.repo.loadStoryLedger();
    const completedStoryIds = listCompletedStoryIds(storyLedger);

    return {
      completedStoryIds,
      producedCommits,
      worktreeDirty,
    };
  }

  private resolveLedgerFindingIds(
    assessment: GapAssessmentResult,
    ledger: CampaignLedgerRecord,
    selectedAssessmentFindingIds: string[],
  ): string[] {
    const selectedAssessment = new Map(
      assessment.findings.map((finding) => [finding.finding_id, finding]),
    );
    const ledgerByFingerprint = new Map(
      ledger.finding_order.map((findingId) => {
        const finding = ledger.findings[findingId];
        return [finding.fingerprint, finding.finding_id] as const;
      }),
    );

    const resolved: string[] = [];
    for (const assessedFindingId of selectedAssessmentFindingIds) {
      const assessedFinding = selectedAssessment.get(assessedFindingId);
      if (!assessedFinding) {
        continue;
      }
      const ledgerFindingId = ledgerByFingerprint.get(assessedFinding.fingerprint);
      if (!ledgerFindingId || resolved.includes(ledgerFindingId)) {
        continue;
      }
      resolved.push(ledgerFindingId);
    }
    return resolved;
  }

  private async launchChildCraftRun(
    campaign: CampaignRecord,
    passId: string,
    remediationMap: RemediationMapRecord,
  ): Promise<ChildLaunchResult> {
    await this.childRunSlot.assertCanClaim(campaign.campaign_id, passId);

    const existingRun = await this.repo.loadRun();
    if (existingRun) {
      if (!isRunTerminal(existingRun.status)) {
        throw new BlockedStateError(
          `Cannot launch child craft run while run ${existingRun.run_id} is ${existingRun.status}.`,
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
      entryTask: `Converge remediation for ${passId} with authoritative scope in ${brief.markdownPath}`,
    });
    await this.seedChildRunBoundedStories(
      run,
      campaign,
      passId,
      remediationMap,
      brief.markdownPath,
      beforeHead,
    );

    const launch = await controller.launchReadyStage();
    await this.childRunSlot.claim(
      campaign.campaign_id,
      passId,
      run.run_id,
      `Child run ${run.run_id} launched for pass ${passId}.`,
    );
    const launchCommand = `praxis run --adapter ${campaign.adapter} --execution-mode autopilot --entry-task "Converge remediation for ${passId} with authoritative scope in ${brief.markdownPath}"`;
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
            non_goals: slice.non_goals,
          })),
          scope: campaign.objective.scope,
          non_goals: [
            "Do not expand remediation beyond selected finding IDs in this pass.",
            "Escalate newly discovered out-of-scope high-risk issues to next reassessment.",
          ],
        },
        commit_policy: {
          commit_per_story: campaign.commit_per_story,
        },
        generated_at: nowIsoUtc(),
      },
    };
  }

  private async writeConvergePassBrief(
    campaign: CampaignRecord,
    passId: string,
    remediationMap: RemediationMapRecord,
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
        commit_per_story: campaign.commit_per_story,
      },
      non_goals: [
        "Do not widen remediation beyond selected finding IDs for this pass.",
        "Record newly discovered out-of-scope findings for reassessment instead of implementing them now.",
      ],
      generated_at: nowIsoUtc(),
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
      "",
    ];
    for (const slice of remediationMap.slices) {
      markdown.push(`### ${slice.slice_id} ${slice.title}`);
      markdown.push(`- Finding IDs: ${slice.finding_ids.join(", ")}`);
      markdown.push(`- Objective: ${slice.objective}`);
      markdown.push(`- Scope: ${slice.scope.join(", ")}`);
      markdown.push(
        `- Dependencies: ${slice.dependencies.length > 0 ? slice.dependencies.join(", ") : "(none)"}`,
      );
      markdown.push(`- Done condition: ${slice.done_condition}`);
      markdown.push(`- Non-goals: ${slice.non_goals.join(" ")}`);
      markdown.push("");
    }
    markdown.push("## Pass Non-Goals");
    markdown.push("");
    markdown.push("- Do not expand scope beyond listed finding IDs.");
    markdown.push("- Escalate high-risk out-of-scope gaps to reassessment.");
    markdown.push("");

    await writeFile(
      join(this.repo.paths.root, markdownPath),
      `${markdown.join("\n").trimEnd()}\n`,
      "utf8",
    );
    await writeFile(
      join(this.repo.paths.root, jsonPath),
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8",
    );

    return { markdownPath, jsonPath };
  }

  private async seedChildRunBoundedStories(
    run: RunRecord,
    campaign: CampaignRecord,
    passId: string,
    remediationMap: RemediationMapRecord,
    briefPath: string,
    beforeHead: string | null,
  ): Promise<void> {
    const sliceMap = {
      slices: remediationMap.slices.map((slice) => ({
        id: slice.slice_id,
        title: slice.title,
      })),
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
      "",
    ].join("\n");

    await writeFile(
      join(this.repo.paths.root, ".praxis", "slice-map.json"),
      `${JSON.stringify(sliceMap, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(this.repo.paths.root, ".praxis", "slice-map.md"),
      `${sliceMapMarkdown.trimEnd()}\n`,
      "utf8",
    );

    const storyLedger = await initializeStoryLedgerFromSliceMap(
      this.repo.paths.root,
      run,
      run.execution.mode,
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
        brief_path: briefPath,
      },
      commit_per_story: {
        enabled: campaign.commit_per_story,
        last_verified_head: beforeHead,
        pending_story_id: null,
      },
    };
    run.routing.reason = `Converge pass ${passId} bounded to remediation brief ${briefPath}.`;
    run.timestamps.updated_at = nowIsoUtc();
    await this.repo.saveRunAndStoryLedger(run, storyLedger);
  }
}
