import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  runApproveCommand,
  runBuildWorkerLaunchCommand,
  runCancelCommand,
  runDispatchCommand,
  runDoctorCommand,
  runInspectCommand,
  runResumeCommand,
  runRunCommand,
  runStatusCommand,
  runSubmitStageResultCommand,
  runContinueCommand
} from "../../src/cli/commands/index.js";
import type { RunRecord } from "../../src/contracts/model.js";
import { createTempRepo, readJson, writeStageResult } from "./helpers.js";

test("smoke: run, status, inspect, dispatch, launch, and doctor", async () => {
  const repoRoot = await createTempRepo();

  const runCode = await runRunCommand(repoRoot, true, {
    workflow: "forge",
    adapter: "codex",
    executionMode: "autopilot",
    entryTask: "Smoke bootstrap"
  });
  assert.equal(runCode, 0);

  assert.equal(await runStatusCommand(repoRoot, true), 0);
  assert.equal(await runDispatchCommand(repoRoot, true), 0);
  assert.equal(await runBuildWorkerLaunchCommand(repoRoot, true), 0);
  assert.equal(await runInspectCommand(repoRoot, true), 0);
  assert.equal(await runDoctorCommand(repoRoot, true), 0);

  assert.equal(existsSync(join(repoRoot, ".praxis", "run.json")), true);
  assert.equal(existsSync(join(repoRoot, ".praxis", "dispatches")), true);
});

test("smoke: forge single-story progression completes run", async () => {
  const repoRoot = await createTempRepo();

  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "Single story progression"
    }),
    0
  );

  const clarifyPath = await writeStageResult(
    repoRoot,
    "clarifying-intent",
    ".praxis",
    "story_spec_ready",
    "proceed",
    { needs_confirmation: true }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, clarifyPath), 0);
  assert.equal(await runContinueCommand(repoRoot, true), 0);

  const sketchPath = await writeStageResult(
    repoRoot,
    "sketching-design",
    ".praxis",
    "sketch_skipped",
    "proceed"
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, sketchPath), 0);

  const implPath = await writeStageResult(
    repoRoot,
    "rapid-implementing",
    ".praxis",
    "implementation_complete",
    "proceed"
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, implPath), 0);

  const reviewPath = await writeStageResult(
    repoRoot,
    "code-reviewing",
    ".praxis",
    "review_ready",
    "proceed"
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, reviewPath), 0);

  const improvePath = await writeStageResult(
    repoRoot,
    "code-improving",
    ".praxis",
    "improvement_ready",
    "proceed"
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, improvePath), 0);

  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(run.status, "completed");
  assert.equal(run.routing.next_action, "finish");
  assert.equal(run.current.stage, null);
});

test("smoke: approve, resume rejection, and cancel lifecycle actions", async () => {
  const repoRoot = await createTempRepo();

  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "manual",
      entryTask: "Lifecycle actions"
    }),
    0
  );

  const clarifyPath = await writeStageResult(
    repoRoot,
    "clarifying-intent",
    ".praxis",
    "story_spec_ready",
    "proceed",
    { needs_confirmation: true }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, clarifyPath), 0);

  const resumeCode = await runResumeCommand(repoRoot, true);
  assert.equal(resumeCode, 4);

  assert.equal(await runApproveCommand(repoRoot, true, "approved"), 0);
  assert.equal(await runCancelCommand(repoRoot, true, "operator stop"), 0);
  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(run.status, "cancelled");
});
