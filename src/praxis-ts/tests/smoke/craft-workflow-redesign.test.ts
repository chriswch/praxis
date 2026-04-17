import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  runConvergeRunCommand,
  runDispatchCommand,
  runRunCommand,
  runSubmitStageResultCommand
} from "../../src/cli/commands/index.js";
import { EXIT_CODE } from "../../src/cli/exit-codes.js";
import { RunController } from "../../src/runtime/control/index.js";
import { PraxisStateRepository } from "../../src/runtime/state/index.js";
import type { CampaignRecord, RunRecord, StageName, StageResultRecord } from "../../src/contracts/model.js";
import { createTempRepo, readJson, writeStageResult } from "./helpers.js";

const execFileAsync = promisify(execFile);

async function prepareDispatch(repoRoot: string): Promise<string> {
  assert.equal(await runDispatchCommand(repoRoot, true), EXIT_CODE.OK);
  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.ok(run.active.dispatch_id);
  return run.active.dispatch_id;
}

async function submitStage(
  repoRoot: string,
  stage: StageName,
  artifactDir: string,
  outcomeCode: string,
  routeKind: StageResultRecord["route"]["kind"]
): Promise<void> {
  const path = await writeStageResult(repoRoot, stage, artifactDir, outcomeCode, routeKind, {
    dispatch_id: await prepareDispatch(repoRoot)
  });
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, path), EXIT_CODE.OK);
}

async function writeCraftSliceMap(repoRoot: string): Promise<void> {
  await writeFile(
    join(repoRoot, ".praxis", "slice-map.json"),
    JSON.stringify(
      {
        slices: [
          { id: "S-001", title: "First" },
          { id: "S-002", title: "Second" }
        ]
      },
      null,
      2
    )
  );
}

async function prepareConvergeObjective(repoRoot: string): Promise<string> {
  await mkdir(join(repoRoot, "docs"), { recursive: true });
  const objectivePath = join(repoRoot, "docs", "objective.md");
  await writeFile(
    objectivePath,
    [
      "# Objective",
      "",
      "- Keep runtime contracts coherent.",
      "- Keep run control behavior deterministic."
    ].join("\n"),
    "utf8"
  );
  return "docs/objective.md";
}

test("smoke: run initialization checkpoint policy gates manual and auto-runs autopilot", async () => {
  const manualRepo = await createTempRepo();
  assert.equal(
    await runRunCommand(
      manualRepo,
      true,
      {
        adapter: "codex",
        executionMode: "manual",
        entryTask: "manual init"
      },
      { orchestrate: true }
    ),
    EXIT_CODE.OK
  );
  const manualRun = await readJson<RunRecord>(join(manualRepo, ".praxis", "run.json"));
  assert.equal(manualRun.workflow, "craft");
  assert.equal(manualRun.status, "waiting_for_user");
  assert.equal(manualRun.routing.next_action, "confirm_then_run");
  assert.equal(manualRun.routing.next_stage, "clarifying-intent");
  assert.equal(manualRun.active.dispatch_id, null);

  const autopilotRepo = await createTempRepo();
  assert.equal(
    await runRunCommand(
      autopilotRepo,
      true,
      {
        adapter: "codex",
        executionMode: "autopilot",
        entryTask: "autopilot init"
      },
      { orchestrate: true }
    ),
    EXIT_CODE.OK
  );
  const autopilotRun = await readJson<RunRecord>(join(autopilotRepo, ".praxis", "run.json"));
  assert.equal(autopilotRun.workflow, "craft");
  assert.equal(autopilotRun.status, "running");
  assert.equal(autopilotRun.routing.next_action, "run_stage");
  assert.ok(autopilotRun.active.dispatch_id);
  assert.ok(autopilotRun.active.worker_id);
});

test("smoke: boundary activation reuses the shared checkpoint policy", async () => {
  const repoRoot = await createTempRepo();
  assert.equal(
    await runRunCommand(repoRoot, true, {
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "boundary gating"
    }),
    EXIT_CODE.OK
  );

  await submitStage(repoRoot, "clarifying-intent", ".praxis", "feature_brief_ready", "proceed");
  await writeCraftSliceMap(repoRoot);
  await submitStage(repoRoot, "slicing-stories", ".praxis", "slice_map_ready", "proceed");
  await submitStage(repoRoot, "clarifying-intent", ".praxis/slices/S-001", "story_spec_ready", "proceed");
  await submitStage(repoRoot, "sketching-design", ".praxis/slices/S-001", "sketch_skipped", "proceed");
  await submitStage(repoRoot, "driving-tdd", ".praxis/slices/S-001", "tdd_complete", "proceed");
  await submitStage(repoRoot, "code-reviewing", ".praxis/slices/S-001", "review_skipped", "proceed");

  // Flip to manual before the boundary transition to validate policy reuse.
  const runPath = join(repoRoot, ".praxis", "run.json");
  const runBeforeBoundary = await readJson<RunRecord>(runPath);
  runBeforeBoundary.execution.mode = "manual";
  await writeFile(runPath, `${JSON.stringify(runBeforeBoundary, null, 2)}\n`, "utf8");

  await submitStage(
    repoRoot,
    "verifying-and-adapting",
    ".praxis/slices/S-001",
    "next_slice",
    "next_slice"
  );

  const runAfterBoundary = await readJson<RunRecord>(runPath);
  assert.equal(runAfterBoundary.current.slice_id, "S-002");
  assert.equal(runAfterBoundary.current.stage, "clarifying-intent");
  assert.equal(runAfterBoundary.routing.next_action, "confirm_then_run");
  assert.equal(runAfterBoundary.status, "waiting_for_user");
});

test("smoke: stage-result acceptance stays successful when post-commit audit append degrades", async () => {
  const repoRoot = await createTempRepo();
  assert.equal(
    await runRunCommand(repoRoot, true, {
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "audit degradation probe"
    }),
    EXIT_CODE.OK
  );

  await mkdir(join(repoRoot, ".praxis", "stage-history.jsonl"), { recursive: true });
  const stageResultPath = await writeStageResult(
    repoRoot,
    "clarifying-intent",
    ".praxis",
    "bug_fix_ready",
    "proceed",
    { dispatch_id: await prepareDispatch(repoRoot) }
  );

  const controller = new RunController(new PraxisStateRepository(repoRoot));
  const outcome = await controller.submitStageResult(stageResultPath);
  assert.ok(
    outcome.audit_warnings?.some((warning) => warning.includes("stage_history_append_failed")),
    "expected degraded audit warning when stage-history append fails"
  );

  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(run.current.stage, "driving-tdd");
  assert.equal(run.status, "running");

  const warningLog = await readFile(join(repoRoot, ".praxis", "audit-warnings.jsonl"), "utf8");
  assert.match(warningLog, /stage_history_append_failed/);
  assert.match(warningLog, /submit-stage-result/);
});

test("smoke: persisted forge run and campaign state is rejected with actionable errors", async () => {
  const repoRoot = await createTempRepo();
  assert.equal(
    await runRunCommand(repoRoot, true, {
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "reject forge state"
    }),
    EXIT_CODE.OK
  );

  const runPath = join(repoRoot, ".praxis", "run.json");
  const run = await readJson<RunRecord>(runPath);
  const forgedRun = { ...run, workflow: "forge" };
  await writeFile(runPath, `${JSON.stringify(forgedRun, null, 2)}\n`, "utf8");

  const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  let runStatusFailure: Error & { code?: number; stdout?: string } | null = null;
  try {
    await execFileAsync(process.execPath, [
      tsxCli,
      "src/index.ts",
      "--repo-root",
      repoRoot,
      "--json",
      "status"
    ], { cwd: process.cwd() });
  } catch (error) {
    runStatusFailure = error as Error & { code?: number; stdout?: string };
  }
  assert.ok(runStatusFailure);
  assert.equal(runStatusFailure.code, EXIT_CODE.INVALID_INPUT);
  assert.match(runStatusFailure.stdout ?? "", /Legacy forge state is not supported/);
  assert.match(runStatusFailure.stdout ?? "", /start a fresh run/i);

  // Seed a converge campaign, then force a stale forge workflow in campaign state.
  const objective = await prepareConvergeObjective(repoRoot);
  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      adapter: "codex",
      objective,
      profile: "product-spec-gap",
      severityThreshold: "medium",
      maxPasses: 1,
      maxFindingsPerPass: 2,
      maxStoriesPerPass: 2,
      scope: [],
      commitPerStory: false,
      autoContinue: false,
      allowWaive: false
    }),
    EXIT_CODE.OK
  );

  const campaignPath = join(repoRoot, ".praxis", "campaign.json");
  const campaign = await readJson<CampaignRecord>(campaignPath);
  const forgedCampaign = { ...campaign, workflow: "forge" };
  await writeFile(campaignPath, `${JSON.stringify(forgedCampaign, null, 2)}\n`, "utf8");

  let campaignStatusFailure: Error & { code?: number; stdout?: string } | null = null;
  try {
    await execFileAsync(process.execPath, [
      tsxCli,
      "src/index.ts",
      "--repo-root",
      repoRoot,
      "--json",
      "converge",
      "status"
    ], { cwd: process.cwd() });
  } catch (error) {
    campaignStatusFailure = error as Error & { code?: number; stdout?: string };
  }
  assert.ok(campaignStatusFailure);
  assert.equal(campaignStatusFailure.code, EXIT_CODE.INVALID_INPUT);
  assert.match(campaignStatusFailure.stdout ?? "", /Legacy forge campaigns are unsupported/);
  assert.match(campaignStatusFailure.stdout ?? "", /fresh campaign/i);
});

test("smoke: public CLI no longer accepts workflow selection and converge runs child craft runs", async () => {
  const repoRoot = await createTempRepo();
  const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

  let runFlagFailure: Error & { code?: number; stderr?: string } | null = null;
  try {
    await execFileAsync(process.execPath, [
      tsxCli,
      "src/index.ts",
      "--repo-root",
      repoRoot,
      "run",
      "--workflow",
      "craft",
      "--entry-task",
      "should fail"
    ], { cwd: process.cwd() });
  } catch (error) {
    runFlagFailure = error as Error & { code?: number; stderr?: string };
  }
  assert.ok(runFlagFailure);
  assert.notEqual(runFlagFailure.code, 0);
  assert.match(runFlagFailure.stderr ?? "", /unknown option '--workflow'/i);

  let convergeFlagFailure: Error & { code?: number; stderr?: string } | null = null;
  try {
    await execFileAsync(process.execPath, [
      tsxCli,
      "src/index.ts",
      "--repo-root",
      repoRoot,
      "converge",
      "run",
      "--objective",
      "docs/missing.md",
      "--workflow",
      "craft"
    ], { cwd: process.cwd() });
  } catch (error) {
    convergeFlagFailure = error as Error & { code?: number; stderr?: string };
  }
  assert.ok(convergeFlagFailure);
  assert.notEqual(convergeFlagFailure.code, 0);
  assert.match(convergeFlagFailure.stderr ?? "", /unknown option '--workflow'/i);

  const objective = await prepareConvergeObjective(repoRoot);
  assert.equal(
    await runConvergeRunCommand(repoRoot, true, {
      adapter: "codex",
      objective,
      profile: "product-spec-gap",
      severityThreshold: "medium",
      maxPasses: 1,
      maxFindingsPerPass: 2,
      maxStoriesPerPass: 2,
      scope: [],
      commitPerStory: false,
      autoContinue: false,
      allowWaive: false
    }),
    EXIT_CODE.OK
  );

  const campaign = await readJson<CampaignRecord>(join(repoRoot, ".praxis", "campaign.json"));
  const activeRun = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(campaign.workflow, "craft");
  assert.equal(activeRun.workflow, "craft");
});
