import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  runCancelCommand,
  runContinueCommand,
  runDispatchCommand,
  runRegisterWorkerSessionCommand,
  runBuildWorkerLaunchCommand,
  runResumeCommand,
  runRunCommand,
  runSubmitStageResultCommand
} from "../../src/cli/commands/index.js";
import type { DispatchRecord, RunRecord } from "../../src/contracts/model.js";
import { createTempRepo, readJson, writeStageResult } from "./helpers.js";

async function prepareDispatch(repoRoot: string): Promise<string> {
  assert.equal(await runDispatchCommand(repoRoot, true), 0);
  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.ok(run.active.dispatch_id);
  return run.active.dispatch_id;
}

async function readActiveDispatch(repoRoot: string): Promise<DispatchRecord> {
  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.ok(run.active.dispatch_id);
  return readJson<DispatchRecord>(
    join(repoRoot, ".praxis", "dispatches", `${run.active.dispatch_id}.json`)
  );
}

test("smoke: register-worker-session persists resumable state and enables resume", async () => {
  const repoRoot = await createTempRepo();
  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "register session"
    }),
    0
  );

  const dispatchId = await prepareDispatch(repoRoot);
  assert.equal(await runBuildWorkerLaunchCommand(repoRoot, true), 0);
  assert.equal(
    await runRegisterWorkerSessionCommand(repoRoot, true, {
      dispatchId,
      workerId: "wrk_test_01",
      sessionId: "codex_session_test_01",
      startedAt: "2026-04-15T00:00:00.000Z",
      locator: "codex://test",
      resumable: true
    }),
    0
  );
  assert.equal(await runResumeCommand(repoRoot, true), 0);

  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(run.active.dispatch_id, dispatchId);
  assert.equal(run.active.worker_id, "wrk_test_01");
  assert.equal(run.active.session_id, "codex_session_test_01");
  assert.equal(run.active.resumable, true);

  const sessionFile = join(repoRoot, ".praxis", "sessions", "codex_session_test_01.json");
  assert.equal(existsSync(sessionFile), true);
});

test("smoke: cancel uses locator handle when session_id is unavailable", async () => {
  const repoRoot = await createTempRepo();
  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "cancel via locator"
    }),
    0
  );

  const dispatchId = await prepareDispatch(repoRoot);
  assert.equal(
    await runRegisterWorkerSessionCommand(repoRoot, true, {
      dispatchId,
      workerId: "wrk_locator_only",
      sessionId: null,
      startedAt: "2026-04-15T00:00:00.000Z",
      locator: "codex://locator-only",
      resumable: false
    }),
    0
  );

  assert.equal(await runCancelCommand(repoRoot, true, "stop via locator"), 0);

  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(run.status, "cancelled");
  assert.match(run.routing.reason, /Cancelled worker at codex:\/\/locator-only/);
});

test("smoke: cancel fails closed when active worker has no cancellable handle", async () => {
  const repoRoot = await createTempRepo();
  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "cancel blocked without handle"
    }),
    0
  );

  const dispatchId = await prepareDispatch(repoRoot);
  assert.equal(
    await runRegisterWorkerSessionCommand(repoRoot, true, {
      dispatchId,
      workerId: "wrk_no_handle",
      sessionId: null,
      startedAt: "2026-04-15T00:00:00.000Z",
      locator: null,
      resumable: false
    }),
    0
  );

  assert.equal(await runCancelCommand(repoRoot, true, "stop blocked"), 3);
  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(run.status, "running");
});

test("smoke: submit-stage-result rejects missing required booleans", async () => {
  const repoRoot = await createTempRepo();
  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "strict result payload"
    }),
    0
  );

  const dispatchId = await prepareDispatch(repoRoot);
  const resultPath = await writeStageResult(
    repoRoot,
    "clarifying-intent",
    ".praxis",
    "story_spec_ready",
    "proceed",
    {
      dispatch_id: dispatchId,
      needs_confirmation: true
    }
  );

  const fullPath = join(repoRoot, resultPath);
  const payload = JSON.parse(await readFile(fullPath, "utf8")) as Record<string, unknown>;
  delete payload.needs_user_input;
  await writeFile(fullPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  assert.equal(await runSubmitStageResultCommand(repoRoot, true, resultPath), 2);
});

test("smoke: submit-stage-result requires session provenance when active session exists", async () => {
  const repoRoot = await createTempRepo();
  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "session provenance required"
    }),
    0
  );

  const dispatchId = await prepareDispatch(repoRoot);
  assert.equal(
    await runRegisterWorkerSessionCommand(repoRoot, true, {
      dispatchId,
      workerId: "wrk_provenance",
      sessionId: "codex_session_provenance",
      startedAt: "2026-04-15T00:00:00.000Z",
      locator: "codex://provenance",
      resumable: true
    }),
    0
  );

  // Missing top-level session_id must fail closed when run.active.session_id is set.
  const missingSessionResult = await writeStageResult(
    repoRoot,
    "clarifying-intent",
    ".praxis",
    "story_spec_ready",
    "proceed",
    {
      dispatch_id: dispatchId,
      needs_confirmation: true
    }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, missingSessionResult), 4);

  const matchingSessionResult = await writeStageResult(
    repoRoot,
    "clarifying-intent",
    ".praxis",
    "story_spec_ready",
    "proceed",
    {
      dispatch_id: dispatchId,
      session_id: "codex_session_provenance",
      needs_confirmation: true
    }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, matchingSessionResult), 0);
});

test("smoke: dispatch creation rejects replacing an already active dispatch", async () => {
  const repoRoot = await createTempRepo();
  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "single active dispatch invariant"
    }),
    0
  );

  const firstDispatch = await prepareDispatch(repoRoot);
  assert.equal(await runDispatchCommand(repoRoot, true), 4);

  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(run.active.dispatch_id, firstDispatch);
});

test("smoke: duplicate slice IDs and traversal stage-result paths fail closed", async () => {
  const repoRoot = await createTempRepo();
  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "duplicate slices and traversal"
    }),
    0
  );

  const rootClarify = await writeStageResult(
    repoRoot,
    "clarifying-intent",
    ".praxis",
    "feature_brief_ready",
    "proceed",
    {
      dispatch_id: await prepareDispatch(repoRoot),
      needs_confirmation: true
    }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, rootClarify), 0);
  assert.equal(await runContinueCommand(repoRoot, true), 0);

  await writeFile(
    join(repoRoot, ".praxis", "slice-map.json"),
    JSON.stringify(
      {
        slices: [
          { id: "S-001", title: "First" },
          { id: "S-001", title: "Duplicate" }
        ]
      },
      null,
      2
    )
  );

  const slicingPath = await writeStageResult(
    repoRoot,
    "slicing-stories",
    ".praxis",
    "slice_map_ready",
    "proceed",
    {
      dispatch_id: await prepareDispatch(repoRoot)
    }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, slicingPath), 2);

  // A traversal input must be rejected before file read or transition logic.
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, "../outside.json"), 2);
});

test("smoke: missing boundary handoff blocks dispatch and emits explicit blocked reason", async () => {
  const repoRoot = await createTempRepo();
  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "boundary handoff invariant"
    }),
    0
  );

  const runPath = join(repoRoot, ".praxis", "run.json");
  const run = await readJson<RunRecord>(runPath);
  run.current.scope = "slice";
  run.current.slice_id = "S-002";
  run.current.artifact_dir = ".praxis/slices/S-002";
  run.current.stage = "clarifying-intent";
  run.routing.next_action = "run_stage";
  run.routing.next_stage = "clarifying-intent";
  run.routing.boundary_handoff_path = ".praxis/slices/S-001/handoff.json";
  await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");

  assert.equal(await runDispatchCommand(repoRoot, true), 3);

  const blocked = await readJson<RunRecord>(runPath);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.routing.stop_reason_code, "boundary_handoff_load_failed");
  assert.match(blocked.routing.reason, /Boundary handoff load failed/);
  assert.match(blocked.routing.reason, /retry dispatch/);
});

test("smoke: transition-aware contracts set verifying artifacts by predecessor path", async () => {
  const repoRoot = await createTempRepo();
  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "craft",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "transition-aware contracts"
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

  assert.equal(
    await runSubmitStageResultCommand(
      repoRoot,
      true,
      await writeStageResult(repoRoot, "sketching-design", ".praxis", "sketch_skipped", "proceed", {
        dispatch_id: await prepareDispatch(repoRoot)
      })
    ),
    0
  );
  assert.equal(
    await runSubmitStageResultCommand(
      repoRoot,
      true,
      await writeStageResult(repoRoot, "driving-tdd", ".praxis", "tdd_complete", "proceed", {
        dispatch_id: await prepareDispatch(repoRoot)
      })
    ),
    0
  );

  assert.equal(
    await runSubmitStageResultCommand(
      repoRoot,
      true,
      await writeStageResult(repoRoot, "code-reviewing", ".praxis", "review_skipped", "proceed", {
        dispatch_id: await prepareDispatch(repoRoot)
      })
    ),
    0
  );
  await prepareDispatch(repoRoot);
  const verifyFromReview = await readActiveDispatch(repoRoot);
  assert.deepEqual(verifyFromReview.inputs.required_artifacts, [".praxis/review.md"]);

  // Run a second craft flow through code-improving -> verifying-and-adapting.
  const repoRoot2 = await createTempRepo();
  assert.equal(
    await runRunCommand(repoRoot2, true, {
      workflow: "craft",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "transition-aware contracts (improvement path)"
    }),
    0
  );
  assert.equal(
    await runSubmitStageResultCommand(
      repoRoot2,
      true,
      await writeStageResult(repoRoot2, "clarifying-intent", ".praxis", "story_spec_ready", "proceed", {
        dispatch_id: await prepareDispatch(repoRoot2),
        needs_confirmation: true
      })
    ),
    0
  );
  assert.equal(await runContinueCommand(repoRoot2, true), 0);
  assert.equal(
    await runSubmitStageResultCommand(
      repoRoot2,
      true,
      await writeStageResult(repoRoot2, "sketching-design", ".praxis", "sketch_skipped", "proceed", {
        dispatch_id: await prepareDispatch(repoRoot2)
      })
    ),
    0
  );
  assert.equal(
    await runSubmitStageResultCommand(
      repoRoot2,
      true,
      await writeStageResult(repoRoot2, "driving-tdd", ".praxis", "tdd_complete", "proceed", {
        dispatch_id: await prepareDispatch(repoRoot2)
      })
    ),
    0
  );
  assert.equal(
    await runSubmitStageResultCommand(
      repoRoot2,
      true,
      await writeStageResult(repoRoot2, "code-reviewing", ".praxis", "review_ready", "proceed", {
        dispatch_id: await prepareDispatch(repoRoot2)
      })
    ),
    0
  );
  assert.equal(
    await runSubmitStageResultCommand(
      repoRoot2,
      true,
      await writeStageResult(repoRoot2, "code-improving", ".praxis", "improvement_ready", "proceed", {
        dispatch_id: await prepareDispatch(repoRoot2)
      })
    ),
    0
  );
  await prepareDispatch(repoRoot2);
  const verifyFromImprove = await readActiveDispatch(repoRoot2);
  assert.deepEqual(verifyFromImprove.inputs.required_artifacts, [".praxis/improvement.md"]);
});

test("smoke: submit-stage-result rejects non-derived route metadata", async () => {
  const repoRoot = await createTempRepo();
  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "route metadata coherence"
    }),
    0
  );

  const resultPath = await writeStageResult(
    repoRoot,
    "clarifying-intent",
    ".praxis",
    "story_spec_ready",
    "proceed",
    {
      dispatch_id: await prepareDispatch(repoRoot),
      needs_confirmation: true,
      route: {
        kind: "proceed",
        next_stage: "sketching-design",
        next_slice_id: null,
        reason: "worker-supplied"
      }
    }
  );

  assert.equal(await runSubmitStageResultCommand(repoRoot, true, resultPath), 2);
});
