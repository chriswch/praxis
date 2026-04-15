import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  runApproveCommand,
  runBuildWorkerLaunchCommand,
  runCancelCommand,
  runDispatchCommand,
  runDoctorCommand,
  runInspectCommand,
  runRegisterWorkerSessionCommand,
  runResumeCommand,
  runRunCommand,
  runStatusCommand,
  runSubmitStageResultCommand,
  runContinueCommand
} from "../../src/cli/commands/index.js";
import { EXIT_CODE } from "../../src/cli/exit-codes.js";
import type { RunRecord } from "../../src/contracts/model.js";
import { createTempRepo, readJson, writeStageResult } from "./helpers.js";

const execFileAsync = promisify(execFile);

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

test("smoke: public CLI run auto-launches the first worker", async () => {
  const repoRoot = await createTempRepo();
  const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

  const { stdout } = await execFileAsync(process.execPath, [
    tsxCli,
    "src/index.ts",
    "--repo-root",
    repoRoot,
    "--json",
    "run",
    "--workflow",
    "forge",
    "--adapter",
    "codex",
    "--execution-mode",
    "autopilot",
    "--entry-task",
    "CLI orchestration"
  ], {
    cwd: process.cwd()
  });

  const envelope = JSON.parse(stdout.trim()) as {
    ok: boolean;
    data: { launched: { dispatch_id: string; worker_id: string } | null };
  };
  assert.equal(envelope.ok, true);
  assert.ok(envelope.data.launched);
  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.ok(run.active.dispatch_id);
  assert.ok(run.active.worker_id);
  assert.ok(run.active.session_id);

  const sessionRecord = await readJson<{
    provider_details?: {
      command?: {
        binary?: string;
      };
    } | null;
  }>(join(repoRoot, ".praxis", "sessions", `${run.active.session_id}.json`));
  assert.equal(sessionRecord.provider_details?.command?.binary, "codex");
});

test("smoke: build-worker-launch exposes stage contract, policy, and repo instruction surfaces", async () => {
  const repoRoot = await createTempRepo();
  const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

  await writeFile(join(repoRoot, "AGENTS.md"), "repo instructions\n", "utf8");
  await mkdir(join(repoRoot, ".codex", "agents"), { recursive: true });
  await writeFile(join(repoRoot, ".codex", "config.toml"), "model = 'gpt-5'\n", "utf8");
  await writeFile(join(repoRoot, ".codex", "hooks.json"), "{}\n", "utf8");
  await mkdir(join(repoRoot, ".codex-plugin"), { recursive: true });

  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "Worker launch contract"
    }),
    0
  );
  const dispatchId = await prepareDispatch(repoRoot);

  const { stdout } = await execFileAsync(process.execPath, [
    tsxCli,
    "src/index.ts",
    "--repo-root",
    repoRoot,
    "--json",
    "build-worker-launch"
  ], {
    cwd: process.cwd()
  });

  const envelope = JSON.parse(stdout.trim()) as {
    ok: boolean;
    data: {
      dispatch_id: string;
      contract: {
        stage_goal: string;
        expected_output_artifacts: string[];
        primary_output: string | null;
      };
      context_manifest: {
        declared_inputs: string[];
        instruction_surfaces: Array<{
          path: string;
          exists: boolean;
          authoritative: boolean;
        }>;
      };
      policy: {
        profile: string;
        writable_roots: string[];
      };
      worker: {
        worker_class: string;
      };
      execution: {
        worktree_mode: string;
      };
    };
  };

  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.dispatch_id, dispatchId);
  assert.match(envelope.data.contract.stage_goal, /Clarify/);
  assert.equal(envelope.data.contract.primary_output, ".praxis/spec.md");
  assert.ok(envelope.data.contract.expected_output_artifacts.includes(".praxis/spec.md"));
  assert.deepEqual(envelope.data.context_manifest.declared_inputs, []);
  assert.deepEqual(envelope.data.policy.writable_roots, ["."]);
  assert.equal(envelope.data.policy.profile, "planning");
  assert.equal(envelope.data.worker.worker_class, "session_worker");
  assert.equal(envelope.data.execution.worktree_mode, "shared");

  const surfaceByPath = new Map(
    envelope.data.context_manifest.instruction_surfaces.map((surface) => [surface.path, surface])
  );
  assert.equal(surfaceByPath.get("AGENTS.md")?.exists, true);
  assert.equal(surfaceByPath.get(".codex/config.toml")?.exists, true);
  assert.equal(surfaceByPath.get(".codex/hooks.json")?.exists, true);
  assert.equal(surfaceByPath.get(".codex/agents")?.exists, true);
  assert.equal(surfaceByPath.get(".codex-plugin")?.exists, true);
  assert.equal(surfaceByPath.get(".codex-plugin")?.authoritative, false);
});

test("smoke: inspect exposes active dispatch, session, and artifact status", async () => {
  const repoRoot = await createTempRepo();
  const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "Inspect detail"
    }),
    0
  );
  const dispatchId = await prepareDispatch(repoRoot);
  await writeFile(join(repoRoot, ".praxis", "spec.md"), "spec\n", "utf8");
  assert.equal(
    await runRegisterWorkerSessionCommand(repoRoot, true, {
      dispatchId,
      workerId: "wrk_inspect",
      sessionId: "codex_session_inspect",
      startedAt: "2026-04-15T00:00:00.000Z",
      locator: "codex://inspect",
      resumable: true
    }),
    0
  );

  const { stdout } = await execFileAsync(process.execPath, [
    tsxCli,
    "src/index.ts",
    "--repo-root",
    repoRoot,
    "--json",
    "inspect"
  ], {
    cwd: process.cwd()
  });

  const envelope = JSON.parse(stdout.trim()) as {
    ok: boolean;
    data: {
      active_dispatch: { dispatch_id: string } | null;
      active_session: { worker_id: string } | null;
      active_worktree: Record<string, unknown> | null;
      artifact_inspection: {
        expected_outputs: Array<{ path: string; exists: boolean }>;
      } | null;
      state_paths: {
        worktrees_dir: string;
      };
    };
  };

  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.active_dispatch?.dispatch_id, dispatchId);
  assert.equal(envelope.data.active_session?.worker_id, "wrk_inspect");
  assert.equal(envelope.data.active_worktree, null);
  assert.ok(envelope.data.state_paths.worktrees_dir.endsWith("/.praxis/worktrees"));
  assert.equal(
    envelope.data.artifact_inspection?.expected_outputs.some(
      (artifact) => artifact.path === ".praxis/spec.md" && artifact.exists
    ),
    true
  );
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

test("smoke: doctor returns a health-specific exit code when an adapter is unhealthy", async () => {
  const repoRoot = await createTempRepo();
  const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

  let failure: Error & { code?: number; stdout?: string } | null = null;
  try {
    await execFileAsync(
      process.execPath,
      [tsxCli, "src/index.ts", "--repo-root", repoRoot, "--json", "doctor"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          HOME: ""
        }
      }
    );
  } catch (error) {
    failure = error as Error & { code?: number; stdout?: string };
  }

  assert.ok(failure);
  assert.equal(failure.code, EXIT_CODE.HEALTH_FAILED);

  const envelope = JSON.parse((failure.stdout ?? "").trim()) as {
    ok: boolean;
    code: number;
    data: {
      summary: {
        healthy: boolean;
        exit_code: number;
        reasons: string[];
      };
      adapters: Array<{ adapter: string; healthy: boolean; version: string | null }>;
    };
  };

  assert.equal(envelope.ok, false);
  assert.equal(envelope.code, EXIT_CODE.HEALTH_FAILED);
  assert.equal(envelope.data.summary.healthy, false);
  assert.equal(envelope.data.summary.exit_code, EXIT_CODE.HEALTH_FAILED);
  assert.equal(
    envelope.data.adapters.some((adapter) => adapter.adapter === "claude" && adapter.healthy === false),
    true
  );
  assert.equal(
    envelope.data.adapters.some((adapter) => adapter.adapter === "codex" && typeof adapter.version === "string"),
    true
  );
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

test("smoke: orchestrated resume re-issues adapter resume against the active session", async () => {
  const repoRoot = await createTempRepo();

  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "Resume orchestration"
    }),
    0
  );

  const dispatchId = await prepareDispatch(repoRoot);
  assert.equal(
    await runRegisterWorkerSessionCommand(repoRoot, true, {
      dispatchId,
      workerId: "wrk_resume_seed",
      sessionId: "codex_session_resume_seed",
      startedAt: "2026-04-15T00:00:00.000Z",
      locator: "codex://resume-seed",
      resumable: true
    }),
    0
  );

  assert.equal(await runResumeCommand(repoRoot, true, { orchestrate: true }), 0);
  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  assert.equal(run.active.dispatch_id, dispatchId);
  assert.equal(run.active.session_id, "codex_session_resume_seed");
  assert.notEqual(run.active.worker_id, "wrk_resume_seed");
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
  assert.equal(await runApproveCommand(repoRoot, true, "should fail"), 4);
  assert.equal(await runContinueCommand(repoRoot, true), 0);
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
