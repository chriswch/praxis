import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  runCancelCommand,
  runContinueCommand,
  runDispatchCommand,
  runRegisterWorkerSessionCommand,
  runBuildWorkerLaunchCommand,
  runResumeCommand,
  runRunCommand,
  runStatusCommand,
  runSubmitStageResultCommand
} from "../../src/cli/commands/index.js";
import type { DispatchRecord, RunRecord, StoryLedgerRecord } from "../../src/contracts/model.js";
import { createTempRepo, readJson, writeStageResult } from "./helpers.js";

const execFileAsync = promisify(execFile);

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

async function advanceForgeToCodeReviewing(repoRoot: string): Promise<DispatchRecord> {
  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "advance to review"
    }),
    0
  );
  assert.equal(
    await runSubmitStageResultCommand(
      repoRoot,
      true,
      await writeStageResult(repoRoot, "clarifying-intent", ".praxis", "story_spec_ready", "proceed", {
        dispatch_id: await prepareDispatch(repoRoot),
        needs_confirmation: true
      })
    ),
    0
  );
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
      await writeStageResult(repoRoot, "rapid-implementing", ".praxis", "implementation_complete", "proceed", {
        dispatch_id: await prepareDispatch(repoRoot)
      })
    ),
    0
  );
  await prepareDispatch(repoRoot);
  return readActiveDispatch(repoRoot);
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
  assert.match(run.routing.reason, /Cancelled worker via opaque locator codex:\/\/locator-only/);
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

test("smoke: run/ledger transaction marker recovers coherent state after interrupted write", async () => {
  const repoRoot = await createTempRepo();
  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "run-ledger transactional recovery"
    }),
    0
  );

  const runPath = join(repoRoot, ".praxis", "run.json");
  const ledgerPath = join(repoRoot, ".praxis", "story-ledger.json");
  const txnPath = join(repoRoot, ".praxis", "run-ledger-transaction.json");

  const staleRun = await readJson<RunRecord>(runPath);
  const staleLedger: StoryLedgerRecord = {
    version: 1,
    run_id: staleRun.run_id,
    workflow: staleRun.workflow,
    execution_mode: staleRun.execution.mode,
    stories: {
      order: ["S-001"],
      active: "S-001",
      last_completed: null,
      items: {
        "S-001": {
          id: "S-001",
          title: "Old",
          artifact_dir: ".praxis/slices/S-001",
          status: "active",
          carry_forward_from: null,
          handoff_path: null
        }
      }
    }
  };
  await writeFile(ledgerPath, `${JSON.stringify(staleLedger, null, 2)}\n`, "utf8");

  const recoveredRun: RunRecord = {
    ...staleRun,
    mode: "multi_slice",
    current: {
      ...staleRun.current,
      scope: "slice",
      slice_id: "S-002",
      artifact_dir: ".praxis/slices/S-002",
      stage: "clarifying-intent"
    },
    routing: {
      ...staleRun.routing,
      next_action: "run_stage",
      next_stage: "clarifying-intent",
      reason: "Recovered from transaction marker."
    }
  };
  const recoveredLedger: StoryLedgerRecord = {
    ...staleLedger,
    stories: {
      order: ["S-001", "S-002"],
      active: "S-002",
      last_completed: "S-001",
      items: {
        "S-001": {
          ...staleLedger.stories.items["S-001"],
          status: "completed",
          handoff_path: ".praxis/slices/S-001/handoff.json"
        },
        "S-002": {
          id: "S-002",
          title: "Next",
          artifact_dir: ".praxis/slices/S-002",
          status: "active",
          carry_forward_from: "S-001",
          handoff_path: null
        }
      }
    }
  };

  await writeFile(
    txnPath,
    `${JSON.stringify(
      {
        version: 1,
        run: recoveredRun,
        ledger: recoveredLedger
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  assert.equal(await runStatusCommand(repoRoot, true), 0);
  const runAfterRecovery = await readJson<RunRecord>(runPath);
  const ledgerAfterRecovery = await readJson<StoryLedgerRecord>(ledgerPath);
  assert.equal(runAfterRecovery.mode, "multi_slice");
  assert.equal(runAfterRecovery.current.slice_id, "S-002");
  assert.equal(ledgerAfterRecovery.stories.active, "S-002");
  assert.equal(ledgerAfterRecovery.stories.last_completed, "S-001");
  assert.equal(existsSync(txnPath), false);
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

test("smoke: missing required stage artifacts block dispatch and emit explicit blocked reason", async () => {
  const repoRoot = await createTempRepo();
  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "required artifact gate"
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
  await unlink(join(repoRoot, ".praxis", "spec.md"));
  assert.equal(await runDispatchCommand(repoRoot, true), 3);

  const blocked = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.routing.stop_reason_code, "missing_required_artifacts");
  assert.match(blocked.routing.reason, /Missing required artifacts/);
  assert.match(blocked.routing.reason, /\.praxis\/spec\.md/);
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

test("smoke: code-reviewing dispatch prepares an isolated workspace", async () => {
  const repoRoot = await createTempRepo();
  await writeFile(join(repoRoot, "README.md"), "isolated workspace fixture\n", "utf8");
  await execFileAsync("git", ["init"], { cwd: repoRoot });
  await execFileAsync("git", ["config", "user.email", "smoke@example.com"], { cwd: repoRoot });
  await execFileAsync("git", ["config", "user.name", "Smoke Test"], { cwd: repoRoot });
  await execFileAsync("git", ["add", "README.md"], { cwd: repoRoot });
  await execFileAsync("git", ["-c", "commit.gpgSign=false", "commit", "-m", "init"], { cwd: repoRoot });

  const reviewDispatch = await advanceForgeToCodeReviewing(repoRoot);
  assert.equal(reviewDispatch.stage, "code-reviewing");
  assert.equal(reviewDispatch.worker.mode, "isolated_worktree");
  assert.equal(reviewDispatch.worker.worker_class, "worktree_worker");
  assert.equal(reviewDispatch.execution.worktree_mode, "isolated");
  assert.equal(reviewDispatch.execution.workspace_origin, "git_worktree");
  assert.equal(existsSync(reviewDispatch.execution.workspace_root), true);

  const worktreeRecord = await readJson<Record<string, unknown>>(
    join(repoRoot, ".praxis", "worktrees", `${reviewDispatch.dispatch_id}.json`)
  );
  assert.equal(worktreeRecord.workspace_origin, "git_worktree");
  assert.equal(worktreeRecord.workspace_root, reviewDispatch.execution.workspace_root);
});

test("smoke: review-stage results reject granted network access and record denied tool usage", async () => {
  const repoRoot = await createTempRepo();
  const reviewDispatch = await advanceForgeToCodeReviewing(repoRoot);
  assert.equal(reviewDispatch.tool_policy.network, "restricted");

  const grantedNetworkResult = await writeStageResult(
    repoRoot,
    "code-reviewing",
    ".praxis",
    "review_ready",
    "proceed",
    {
      dispatch_id: reviewDispatch.dispatch_id,
      tool_uses: [
        {
          tool: "fetch",
          kind: "network",
          status: "granted",
          reason: "downloaded remote context"
        }
      ]
    }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, grantedNetworkResult), 2);

  const deniedNetworkResult = await writeStageResult(
    repoRoot,
    "code-reviewing",
    ".praxis",
    "review_ready",
    "proceed",
    {
      dispatch_id: reviewDispatch.dispatch_id,
      tool_uses: [
        {
          tool: "fetch",
          kind: "network",
          status: "denied",
          reason: "policy blocked"
        }
      ]
    }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, deniedNetworkResult), 0);

  const policyLog = (await readFile(join(repoRoot, ".praxis", "policy", "tool-records.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { tool?: string; status?: string; type?: string });
  assert.equal(
    policyLog.some((entry) => entry.type === "tool_use" && entry.tool === "fetch" && entry.status === "denied"),
    true
  );
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
