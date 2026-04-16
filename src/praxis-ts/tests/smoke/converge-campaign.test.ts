import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  runConvergeCancelCommand,
  runConvergeContinueCommand,
  runConvergeInspectCommand,
  runConvergeResumeCommand,
  runConvergeRunCommand,
  runConvergeStatusCommand
} from "../../src/cli/commands/index.js";
import { EXIT_CODE } from "../../src/cli/exit-codes.js";
import type { CampaignLedgerRecord, CampaignRecord, PassSummaryRecord, RunRecord } from "../../src/contracts/model.js";
import { ConvergeCampaignService } from "../../src/runtime/converge/index.js";
import { PraxisStateRepository } from "../../src/runtime/state/index.js";
import { createTempRepo, readJson } from "./helpers.js";

const execFileAsync = promisify(execFile);

async function createObjective(repoRoot: string): Promise<string> {
  await mkdir(join(repoRoot, "docs"), { recursive: true });
  const objectivePath = join(repoRoot, "docs", "product-spec.md");
  await writeFile(
    objectivePath,
    [
      "# Product Objective",
      "",
      "## New Public CLI Surface",
      "- praxis converge run/status/inspect/resume/continue/cancel",
      "",
      "## Acceptance Criteria",
      "- Campaign artifacts are durable."
    ].join("\n"),
    "utf8"
  );
  return "docs/product-spec.md";
}

async function runGit(repoRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });
  return stdout.trim();
}

async function initializeGitRepo(repoRoot: string): Promise<void> {
  await runGit(repoRoot, ["init"]);
  await runGit(repoRoot, ["config", "user.name", "Praxis Smoke"]);
  await runGit(repoRoot, ["config", "user.email", "smoke@praxis.local"]);
  await runGit(repoRoot, ["config", "commit.gpgsign", "false"]);
  await runGit(repoRoot, ["add", "."]);
  await runGit(repoRoot, ["commit", "-m", "Initialize converge smoke repo"]);
}

async function markActiveChildRunCompleted(repoRoot: string): Promise<void> {
  const runPath = join(repoRoot, ".praxis", "run.json");
  const run = await readJson<RunRecord>(runPath);
  const completed: RunRecord = {
    ...run,
    status: "completed",
    current: {
      ...run.current,
      stage: null
    },
    routing: {
      ...run.routing,
      next_action: "finish",
      next_stage: null,
      stop_reason_code: null,
      reason: "Child run completed by smoke test harness."
    },
    active: {
      dispatch_id: null,
      worker_id: null,
      session_id: null,
      resumable: false
    },
    timestamps: {
      ...run.timestamps,
      updated_at: "2026-04-16T04:00:00.000Z"
    }
  };
  await writeFile(runPath, `${JSON.stringify(completed, null, 2)}\n`, "utf8");
}

test("smoke: commit-per-story blocks reassessment until remediation commits exist", async () => {
  const repoRoot = await createTempRepo();
  const objective = await createObjective(repoRoot);
  await initializeGitRepo(repoRoot);

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      objective,
      profile: "product-spec-gap",
      severityThreshold: "medium",
      maxPasses: 1,
      maxFindingsPerPass: 5,
      maxStoriesPerPass: 5,
      scope: [],
      commitPerStory: true,
      autoContinue: false,
      allowWaive: false
    }),
    EXIT_CODE.OK
  );

  await markActiveChildRunCompleted(repoRoot);
  assert.equal(await runConvergeContinueCommand(repoRoot, true), EXIT_CODE.OK);

  const blockedCampaign = await readJson<CampaignRecord>(join(repoRoot, ".praxis", "campaign.json"));
  assert.equal(blockedCampaign.status, "waiting_for_user");
  assert.equal(blockedCampaign.stop_reason_code, "needs_operator");
  assert.match(blockedCampaign.reason, /Commit-per-story is enabled/i);

  const blockedSummary = await readJson<PassSummaryRecord>(
    join(repoRoot, ".praxis", "passes", "P-001", "summary.json")
  );
  assert.equal(blockedSummary.reassessment_review_id, null);
  assert.equal(blockedSummary.outcome, "needs_operator");

  await writeFile(join(repoRoot, "followup.txt"), "commit-per-story followup\n", "utf8");
  await runGit(repoRoot, ["add", "followup.txt"]);
  await runGit(repoRoot, ["commit", "-m", "Add remediation commit required by converge policy"]);
  const followupCommit = await runGit(repoRoot, ["rev-parse", "HEAD"]);

  assert.equal(await runConvergeContinueCommand(repoRoot, true), EXIT_CODE.OK);

  const finalCampaign = await readJson<CampaignRecord>(join(repoRoot, ".praxis", "campaign.json"));
  assert.equal(finalCampaign.status, "completed");
  assert.equal(finalCampaign.stop_reason_code, "budget_exhausted");

  const finalSummary = await readJson<PassSummaryRecord>(
    join(repoRoot, ".praxis", "passes", "P-001", "summary.json")
  );
  assert.equal(finalSummary.reassessment_review_id, "R-002");
  assert.equal(finalSummary.produced_commits.includes(followupCommit), true);

  const ledger = await readJson<CampaignLedgerRecord>(join(repoRoot, ".praxis", "campaign-ledger.json"));
  for (const findingId of finalSummary.planned_finding_ids) {
    assert.equal(ledger.findings[findingId]?.commit_refs.includes(followupCommit), true);
  }
});

test("smoke: converge run launches real child forge linkage with durable artifacts", async () => {
  const repoRoot = await createTempRepo();
  const objective = await createObjective(repoRoot);

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      objective,
      profile: "product-spec-gap",
      severityThreshold: "medium",
      maxPasses: 4,
      maxFindingsPerPass: 5,
      maxStoriesPerPass: 5,
      scope: [],
      commitPerStory: false,
      autoContinue: false,
      allowWaive: false
    }),
    EXIT_CODE.OK
  );

  assert.equal(await runConvergeStatusCommand(repoRoot, true), EXIT_CODE.OK);
  assert.equal(await runConvergeInspectCommand(repoRoot, true), EXIT_CODE.OK);

  const campaign = await readJson<CampaignRecord>(join(repoRoot, ".praxis", "campaign.json"));
  assert.equal(campaign.status, "waiting_for_user");
  assert.equal(campaign.stop_reason_code, "needs_operator");
  assert.equal(campaign.current_pass, 1);
  assert.ok(campaign.current_child_run_id);

  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(run.run_id, campaign.current_child_run_id);
  assert.equal(run.status, "running");

  const passSummary = await readJson<PassSummaryRecord>(
    join(repoRoot, ".praxis", "passes", "P-001", "summary.json")
  );
  assert.equal(passSummary.assessment_review_id, "R-001");
  assert.equal(passSummary.reassessment_review_id, null);
  assert.deepEqual(passSummary.completed_story_ids, []);
  assert.equal(passSummary.outcome, "needs_operator");

  const service = new ConvergeCampaignService(new PraxisStateRepository(repoRoot));
  const status = await service.getStatus();
  assert.equal(status.child_run?.run_id, campaign.current_child_run_id);
  assert.equal(status.child_run?.status, "running");
  assert.equal(status.child_run?.completion_state, "pending");

  assert.equal(existsSync(join(repoRoot, ".praxis", "objective.md")), true);
  assert.equal(existsSync(join(repoRoot, ".praxis", "reviews", "R-001", "findings.json")), true);
  assert.equal(existsSync(join(repoRoot, ".praxis", "passes", "P-001", "batch.json")), true);
  assert.equal(existsSync(join(repoRoot, ".praxis", "passes", "P-001", "child-run.json")), true);
  assert.equal(existsSync(join(repoRoot, ".praxis", "passes", "P-001", "summary.json")), true);
});

test("smoke: auto-continue campaigns relaunch the next pass immediately after reassessment", async () => {
  const repoRoot = await createTempRepo();
  const objective = await createObjective(repoRoot);

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      objective,
      profile: "product-spec-gap",
      severityThreshold: "medium",
      maxPasses: 2,
      maxFindingsPerPass: 4,
      maxStoriesPerPass: 4,
      scope: [],
      commitPerStory: false,
      autoContinue: true,
      allowWaive: false
    }),
    EXIT_CODE.OK
  );

  const passOneCampaign = await readJson<CampaignRecord>(join(repoRoot, ".praxis", "campaign.json"));
  assert.equal(passOneCampaign.current_pass, 1);
  assert.equal(passOneCampaign.status, "running");
  const passOneChild = passOneCampaign.current_child_run_id;
  assert.ok(passOneChild);

  await markActiveChildRunCompleted(repoRoot);
  assert.equal(await runConvergeResumeCommand(repoRoot, true), EXIT_CODE.OK);

  const passTwoCampaign = await readJson<CampaignRecord>(join(repoRoot, ".praxis", "campaign.json"));
  assert.equal(passTwoCampaign.current_pass, 2);
  assert.equal(passTwoCampaign.status, "running");
  assert.ok(passTwoCampaign.current_child_run_id);
  assert.notEqual(passTwoCampaign.current_child_run_id, passOneChild);
  assert.match(passTwoCampaign.reason, /Waiting for child completion before reassessment/i);

  const passOneSummary = await readJson<PassSummaryRecord>(
    join(repoRoot, ".praxis", "passes", "P-001", "summary.json")
  );
  assert.equal(passOneSummary.reassessment_review_id, "R-002");
  assert.equal(passOneSummary.outcome, "continue");
  assert.equal(existsSync(join(repoRoot, ".praxis", "passes", "P-002", "batch.json")), true);
});

test("smoke: converge continue is gated until the active child run reaches completion", async () => {
  const repoRoot = await createTempRepo();
  const objective = await createObjective(repoRoot);

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      objective,
      profile: "product-spec-gap",
      severityThreshold: "medium",
      maxPasses: 4,
      maxFindingsPerPass: 4,
      maxStoriesPerPass: 4,
      scope: [],
      commitPerStory: false,
      autoContinue: false,
      allowWaive: false
    }),
    EXIT_CODE.OK
  );

  assert.equal(await runConvergeContinueCommand(repoRoot, true), EXIT_CODE.OK);
  const campaignAfterContinue = await readJson<CampaignRecord>(join(repoRoot, ".praxis", "campaign.json"));
  assert.equal(campaignAfterContinue.current_pass, 1);
  assert.equal(campaignAfterContinue.status, "waiting_for_user");
  assert.match(campaignAfterContinue.reason, /waiting for child run/);

  assert.equal(await runConvergeCancelCommand(repoRoot, true, "operator stop"), EXIT_CODE.OK);
  const campaignAfterCancel = await readJson<CampaignRecord>(join(repoRoot, ".praxis", "campaign.json"));
  assert.equal(campaignAfterCancel.status, "cancelled");
  assert.equal(campaignAfterCancel.stop_reason_code, "cancelled");
});

test("smoke: child completion triggers immediate reassessment and closes pass summary from real results", async () => {
  const repoRoot = await createTempRepo();
  const objective = await createObjective(repoRoot);

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      objective,
      profile: "product-spec-gap",
      severityThreshold: "medium",
      maxPasses: 1,
      maxFindingsPerPass: 5,
      maxStoriesPerPass: 5,
      scope: [],
      commitPerStory: false,
      autoContinue: false,
      allowWaive: false
    }),
    EXIT_CODE.OK
  );

  await markActiveChildRunCompleted(repoRoot);
  assert.equal(await runConvergeContinueCommand(repoRoot, true), EXIT_CODE.OK);

  const campaign = await readJson<CampaignRecord>(join(repoRoot, ".praxis", "campaign.json"));
  assert.equal(campaign.status, "completed");
  assert.equal(campaign.stop_reason_code, "budget_exhausted");
  assert.equal(campaign.current_pass, 1);
  assert.equal(campaign.current_child_run_id, null);

  const passSummary = await readJson<PassSummaryRecord>(
    join(repoRoot, ".praxis", "passes", "P-001", "summary.json")
  );
  assert.equal(passSummary.assessment_review_id, "R-001");
  assert.equal(passSummary.reassessment_review_id, "R-002");
  assert.equal(passSummary.outcome, "budget_exhausted");
  assert.deepEqual(passSummary.completed_story_ids, []);
  assert.equal(passSummary.unresolved_at_or_above_threshold > 0, true);

  assert.equal(existsSync(join(repoRoot, ".praxis", "reviews", "R-002", "findings.json")), true);
});
