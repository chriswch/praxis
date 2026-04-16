import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  runConvergeCancelCommand,
  runConvergeContinueCommand,
  runConvergeInspectCommand,
  runConvergeRunCommand,
  runConvergeStatusCommand
} from "../../src/cli/commands/index.js";
import { EXIT_CODE } from "../../src/cli/exit-codes.js";
import type { CampaignRecord, PassSummaryRecord } from "../../src/contracts/model.js";
import { createTempRepo, readJson } from "./helpers.js";

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

test("smoke: converge run produces waiting campaign with durable pass and review artifacts", async () => {
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

  assert.equal(existsSync(join(repoRoot, ".praxis", "objective.md")), true);
  assert.equal(existsSync(join(repoRoot, ".praxis", "reviews", "R-001", "findings.json")), true);
  assert.equal(existsSync(join(repoRoot, ".praxis", "passes", "P-001", "batch.json")), true);
  assert.equal(existsSync(join(repoRoot, ".praxis", "passes", "P-001", "child-run.json")), true);
  assert.equal(existsSync(join(repoRoot, ".praxis", "passes", "P-001", "summary.json")), true);
});

test("smoke: converge continue advances pass and cancel sets terminal status", async () => {
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
  assert.equal(campaignAfterContinue.current_pass, 2);
  assert.equal(campaignAfterContinue.status, "waiting_for_user");

  assert.equal(await runConvergeCancelCommand(repoRoot, true, "operator stop"), EXIT_CODE.OK);
  const campaignAfterCancel = await readJson<CampaignRecord>(join(repoRoot, ".praxis", "campaign.json"));
  assert.equal(campaignAfterCancel.status, "cancelled");
  assert.equal(campaignAfterCancel.stop_reason_code, "cancelled");
});

test("smoke: converge auto-continue stops on stall guard and records pass summary", async () => {
  const repoRoot = await createTempRepo();
  const objective = await createObjective(repoRoot);

  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      objective,
      profile: "product-spec-gap",
      severityThreshold: "medium",
      maxPasses: 5,
      maxFindingsPerPass: 5,
      maxStoriesPerPass: 5,
      scope: [],
      commitPerStory: false,
      autoContinue: true,
      allowWaive: false
    }),
    EXIT_CODE.OK
  );

  const campaign = await readJson<CampaignRecord>(join(repoRoot, ".praxis", "campaign.json"));
  assert.equal(campaign.status, "completed");
  assert.equal(campaign.stop_reason_code, "stalled");
  assert.equal(campaign.current_pass >= 3, true);

  const passSummary = await readJson<PassSummaryRecord>(
    join(repoRoot, ".praxis", "passes", "P-003", "summary.json")
  );
  assert.equal(passSummary.outcome, "stalled");
  assert.equal(passSummary.unresolved_at_or_above_threshold > 0, true);
});
