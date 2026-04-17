import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BlockedStateError } from "../../contracts/errors.js";
import { nowIsoUtc } from "../common/time.js";
import type {
  CampaignRecord,
  RemediationMapRecord,
  RunRecord,
} from "../../contracts/model.js";
import type { PraxisStateRepository } from "../state/repository.js";
import { RunController } from "../control/run-controller.js";
import { initializeStoryLedgerFromSliceMap } from "../control/story-boundary.js";
import { readHeadCommit } from "./git.js";
import { buildConvergeClarifyingArtifacts, isRunTerminal } from "./campaign-support.js";
import { ChildRunSlotService } from "./child-run-slot.js";

export interface ChildCraftRunSeedResult {
  childRunId: string;
  childRunRecord: Record<string, unknown>;
}

// Orchestrates the "spawn a bounded craft child run for this pass" sequence. Owns the
// brief write, the initializeRun call, the story-ledger seed, the launch, and the slot
// claim — the same choreography ConvergePassService used to inline in launchChildCraftRun.
export class ChildCraftRunSeeder {
  constructor(
    private readonly repo: PraxisStateRepository,
    private readonly childRunSlot: ChildRunSlotService,
  ) {}

  async launch(
    campaign: CampaignRecord,
    passId: string,
    remediationMap: RemediationMapRecord,
  ): Promise<ChildCraftRunSeedResult> {
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
    const brief = await this.writeBrief(campaign, passId, remediationMap);
    const run = await controller.initializeRun({
      adapter: campaign.adapter,
      executionMode: "autopilot",
      entryTask: `Converge remediation for ${passId} with authoritative scope in ${brief.markdownPath}`,
    });
    await this.seedBoundedStories(run, campaign, passId, remediationMap, brief.markdownPath, beforeHead);

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

  private async writeBrief(
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

  private async seedBoundedStories(
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
    run.workflow_constraints = {
      workflow: "converge-pre-remediation",
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
