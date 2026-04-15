import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
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

async function prepareDispatch(repoRoot: string): Promise<string> {
  assert.equal(await runDispatchCommand(repoRoot, true), 0);
  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.ok(run.active.dispatch_id);
  return run.active.dispatch_id;
}

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
    {
      dispatch_id: await prepareDispatch(repoRoot),
      needs_confirmation: true
    }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, clarifyPath), 0);
  assert.equal(await runContinueCommand(repoRoot, true), 0);

  const sketchPath = await writeStageResult(
    repoRoot,
    "sketching-design",
    ".praxis",
    "sketch_skipped",
    "proceed",
    {
      dispatch_id: await prepareDispatch(repoRoot)
    }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, sketchPath), 0);

  const implPath = await writeStageResult(
    repoRoot,
    "rapid-implementing",
    ".praxis",
    "implementation_complete",
    "proceed",
    {
      dispatch_id: await prepareDispatch(repoRoot)
    }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, implPath), 0);

  const reviewPath = await writeStageResult(
    repoRoot,
    "code-reviewing",
    ".praxis",
    "review_ready",
    "proceed",
    {
      dispatch_id: await prepareDispatch(repoRoot)
    }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, reviewPath), 0);

  const improvePath = await writeStageResult(
    repoRoot,
    "code-improving",
    ".praxis",
    "improvement_ready",
    "proceed",
    {
      dispatch_id: await prepareDispatch(repoRoot)
    }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, improvePath), 0);

  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(run.status, "completed");
  assert.equal(run.routing.next_action, "finish");
  assert.equal(run.current.stage, null);
  assert.equal(run.active.dispatch_id, null);
});

test("smoke: submit rejects result without active dispatch", async () => {
  const repoRoot = await createTempRepo();

  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "Dispatch ownership"
    }),
    0
  );

  const clarifyPath = await writeStageResult(
    repoRoot,
    "clarifying-intent",
    ".praxis",
    "story_spec_ready",
    "proceed"
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, clarifyPath), 4);
});

test("smoke: submit rejects result with forged dispatch ownership", async () => {
  const repoRoot = await createTempRepo();

  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "Dispatch mismatch"
    }),
    0
  );

  await prepareDispatch(repoRoot);
  const clarifyPath = await writeStageResult(
    repoRoot,
    "clarifying-intent",
    ".praxis",
    "story_spec_ready",
    "proceed",
    {
      dispatch_id: "dsp_forged",
      needs_confirmation: true
    }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, clarifyPath), 4);
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
    {
      dispatch_id: await prepareDispatch(repoRoot),
      needs_confirmation: true
    }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, clarifyPath), 0);

  // Launch/dispatch gates fail closed while waiting for user input.
  assert.equal(await runDispatchCommand(repoRoot, true), 4);
  assert.equal(await runBuildWorkerLaunchCommand(repoRoot, true), 4);

  const resumeCode = await runResumeCommand(repoRoot, true);
  assert.equal(resumeCode, 4);

  assert.equal(await runApproveCommand(repoRoot, true, "approved"), 0);
  assert.equal(await runCancelCommand(repoRoot, true, "operator stop"), 0);
  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(run.status, "cancelled");
});

test("smoke: ask_user routes to workflow-resolved next stage", async () => {
  const repoRoot = await createTempRepo();

  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "Ask user routing"
    }),
    0
  );

  const clarifyPath = await writeStageResult(
    repoRoot,
    "clarifying-intent",
    ".praxis",
    "story_spec_ready",
    "proceed",
    {
      dispatch_id: await prepareDispatch(repoRoot),
      needs_confirmation: true
    }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, clarifyPath), 0);
  assert.equal(await runContinueCommand(repoRoot, true), 0);

  const sketchPath = await writeStageResult(
    repoRoot,
    "sketching-design",
    ".praxis",
    "sketch_skipped",
    "proceed",
    {
      dispatch_id: await prepareDispatch(repoRoot)
    }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, sketchPath), 0);

  const implFeedbackPath = await writeStageResult(
    repoRoot,
    "rapid-implementing",
    ".praxis",
    "spec_feedback",
    "ask_user",
    {
      dispatch_id: await prepareDispatch(repoRoot),
      needs_user_input: true
    }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, implFeedbackPath), 0);

  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(run.routing.next_action, "ask_user");
  assert.equal(run.routing.next_stage, "clarifying-intent");
  assert.equal(run.current.stage, "clarifying-intent");
});

test("smoke: corrupted story ledger is rejected at read boundaries", async () => {
  const repoRoot = await createTempRepo();

  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "Ledger validation"
    }),
    0
  );

  await writeFile(
    join(repoRoot, ".praxis", "story-ledger.json"),
    JSON.stringify(
      {
        version: 1,
        run_id: "run_bad",
        workflow: "forge",
        execution_mode: "autopilot",
        stories: {
          order: ["S-001"],
          active: "S-999",
          last_completed: null,
          items: {}
        }
      },
      null,
      2
    )
  );

  assert.equal(await runStatusCommand(repoRoot, true), 2);
});
