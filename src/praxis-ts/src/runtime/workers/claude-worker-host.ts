import { spawn } from "node:child_process";
import { mkdir, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { nowIsoUtc } from "../common/time.js";
import { writeJsonFile } from "../state/store.js";
import { PraxisStateRepository } from "../state/index.js";
import { RunController } from "../control/index.js";
import type { WorkerLaunchPayload } from "../control/types.js";
import { resolveStageSkillCommand } from "./stage-skill-command.js";
import {
  composeStageResult,
  readRoutingPayload,
  routingScratchPathFor,
} from "./stage-result-composer.js";
import {
  buildWorkerLocator,
  parsePositiveInt,
  type WorkerHostHandshake,
  type WorkerHostMode,
} from "./worker-host-protocol.js";

export type { WorkerHostMode } from "./worker-host-protocol.js";

export interface RunClaudeWorkerHostInput {
  repoRoot: string;
  dispatchId: string;
  workerId: string;
  handshakePath: string;
  mode: WorkerHostMode;
  expectedSessionId: string | null;
}

interface SpawnedClaudeCommand {
  binary: string;
  args: string[];
  cwd: string;
  sessionId: string;
}

export async function runClaudeWorkerHost(input: RunClaudeWorkerHostInput): Promise<void> {
  const repo = new PraxisStateRepository(input.repoRoot);
  const controller = new RunController(repo);
  const launch = await controller.buildWorkerLaunch();
  if (launch.dispatch_id !== input.dispatchId) {
    throw new Error(
      `run-claude-worker dispatch mismatch. Expected ${input.dispatchId}, found ${launch.dispatch_id}.`,
    );
  }
  if (launch.worker.adapter !== "claude") {
    throw new Error(
      `run-claude-worker only supports claude adapter (found ${launch.worker.adapter}).`,
    );
  }

  const handshakeAbsolutePath = resolve(input.repoRoot, input.handshakePath);
  await mkdir(dirname(handshakeAbsolutePath), { recursive: true });

  const spawned = buildClaudeCommand(input.mode, launch, input.expectedSessionId);
  const child = spawn(spawned.binary, spawned.args, {
    cwd: spawned.cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const startupTimestamp = nowIsoUtc();
  const state: {
    handshakeWritten: boolean;
    startupError: string | null;
  } = { handshakeWritten: false, startupError: null };

  const failHandshake = async (message: string): Promise<void> => {
    if (state.handshakeWritten) {
      return;
    }
    await writeJsonFile(handshakeAbsolutePath, {
      version: 1,
      status: "error",
      dispatch_id: input.dispatchId,
      worker_id: input.workerId,
      error: message,
      emitted_at: nowIsoUtc(),
    } satisfies WorkerHostHandshake);
    state.handshakeWritten = true;
  };

  // Claude's session_id is host-assigned via --session-id/--resume, so we can
  // emit the ready handshake once we know the child is alive. A short grace
  // window after spawn lets us catch early non-zero exits (e.g. `--resume`
  // against an unknown session) so the adapter sees an error handshake
  // instead of a ready handshake for a dead process.
  const emitReadyHandshake = async (): Promise<void> => {
    if (state.handshakeWritten) {
      return;
    }
    await writeJsonFile(handshakeAbsolutePath, {
      version: 1,
      status: "ready",
      dispatch_id: input.dispatchId,
      worker_id: input.workerId,
      session_id: spawned.sessionId,
      started_at: startupTimestamp,
      locator: buildWorkerLocator(process.pid),
      provider_details: {
        command: {
          binary: spawned.binary,
          args: spawned.args,
          cwd: spawned.cwd,
        },
        mode: input.mode,
      },
    } satisfies WorkerHostHandshake);
    state.handshakeWritten = true;
  };

  const stderrBuffer: string[] = [];
  const stderrReader = createInterface({ input: child.stderr });
  stderrReader.on("line", (line) => {
    if (stderrBuffer.length >= 80) {
      stderrBuffer.shift();
    }
    stderrBuffer.push(line);
  });
  // stdout is drained but not consumed — claude's plain-text output is informational.
  child.stdout.on("data", () => {
    // no-op
  });

  const forwardSignal = (signal: NodeJS.Signals): void => {
    if (child.exitCode === null && !child.killed) {
      child.kill(signal);
    }
  };
  process.on("SIGTERM", () => {
    forwardSignal("SIGTERM");
  });
  process.on("SIGINT", () => {
    forwardSignal("SIGINT");
  });

  const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolveExit) => {
      child.once("exit", (code, signal) => {
        resolveExit({ code, signal });
      });
    },
  );

  const spawnErrorPromise = new Promise<string | null>((resolveSpawn) => {
    child.once("error", (error) => {
      resolveSpawn(error instanceof Error ? error.message : String(error));
    });
    child.once("spawn", () => {
      resolveSpawn(null);
    });
  });

  const spawnError = await spawnErrorPromise;
  if (spawnError) {
    state.startupError = spawnError;
    await failHandshake(`Failed to start claude process: ${spawnError}`);
    return;
  }

  // Grace window: if the child exits non-zero within this window, emit an
  // error handshake so the adapter sees a resume/launch failure rather than
  // a ready handshake for a dead session.
  const graceWindowMs = parsePositiveInt(process.env.PRAXIS_CLAUDE_STARTUP_GRACE_MS, 750);
  const earlyExit = await raceEarlyExit(exitPromise, graceWindowMs);

  if (earlyExit && earlyExit.code !== 0) {
    const stderrSummary = stderrBuffer.slice(-12).join("\n");
    const exitLabel = earlyExit.signal
      ? `signal ${earlyExit.signal}`
      : `exit code ${String(earlyExit.code)}`;
    await failHandshake(
      [
        `Claude ${input.mode} exited with ${exitLabel} within startup grace window.`,
        stderrSummary ? `stderr:\n${stderrSummary}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return;
  }

  await emitReadyHandshake();

  const exitResult = earlyExit ?? (await exitPromise);

  if (exitResult.code !== 0) {
    await writeWorkerTrace(input.repoRoot, input.workerId, {
      version: 1,
      type: "runtime_failed",
      dispatch_id: input.dispatchId,
      worker_id: input.workerId,
      session_id: spawned.sessionId,
      mode: input.mode,
      exit_code: exitResult.code,
      exit_signal: exitResult.signal,
      recorded_at: nowIsoUtc(),
      stderr_tail: stderrBuffer.slice(-40),
    });
    return;
  }

  const stageResultAbsolutePath = resolve(input.repoRoot, launch.stage_result_path);
  const scratchRelativePath = routingScratchPathFor(launch.stage_result_path);
  const scratchAbsolutePath = resolve(input.repoRoot, scratchRelativePath);

  try {
    const routingPayload = await readRoutingPayload(scratchAbsolutePath);
    const stageResult = composeStageResult(launch, spawned.sessionId, routingPayload);
    await writeJsonFile(stageResultAbsolutePath, stageResult);
    await unlink(scratchAbsolutePath).catch(() => {
      /* scratch cleanup is best-effort */
    });
  } catch (error) {
    await writeWorkerTrace(input.repoRoot, input.workerId, {
      version: 1,
      type: "missing_stage_result",
      dispatch_id: input.dispatchId,
      worker_id: input.workerId,
      session_id: spawned.sessionId,
      stage_result_path: launch.stage_result_path,
      scratch_path: scratchRelativePath,
      recorded_at: nowIsoUtc(),
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  try {
    await controller.submitStageResult(launch.stage_result_path);
  } catch (error) {
    await writeWorkerTrace(input.repoRoot, input.workerId, {
      version: 1,
      type: "submit_stage_result_failed",
      dispatch_id: input.dispatchId,
      worker_id: input.workerId,
      session_id: spawned.sessionId,
      stage_result_path: launch.stage_result_path,
      recorded_at: nowIsoUtc(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildClaudeCommand(
  mode: WorkerHostMode,
  launch: WorkerLaunchPayload,
  expectedSessionId: string | null,
): SpawnedClaudeCommand {
  const binaryOverride = process.env.PRAXIS_CLAUDE_BIN?.trim();
  const binary = binaryOverride && binaryOverride.length > 0 ? binaryOverride : "claude";
  const workspaceRoot = launch.execution.workspace_root;
  const prompt = buildStagePrompt(launch);

  if (mode === "resume") {
    const resumeSessionId = expectedSessionId ?? launch.worker.resume_session_id;
    if (!resumeSessionId) {
      throw new Error("Claude resume requested without a provider session_id.");
    }
    return {
      binary,
      args: [
        "-p",
        "--resume",
        resumeSessionId,
        "--permission-mode",
        "acceptEdits",
        "--add-dir",
        workspaceRoot,
        prompt,
      ],
      cwd: workspaceRoot,
      sessionId: resumeSessionId,
    };
  }

  const sessionId = randomUUID();
  return {
    binary,
    args: [
      "-p",
      "--session-id",
      sessionId,
      "--permission-mode",
      "acceptEdits",
      "--add-dir",
      workspaceRoot,
      prompt,
    ],
    cwd: workspaceRoot,
    sessionId,
  };
}

export function buildStagePrompt(launch: WorkerLaunchPayload): string {
  const slashCommand = resolveStageSkillCommand(launch.stage);
  const lines: string[] = [];
  if (slashCommand !== null) {
    lines.push(slashCommand);
  }
  const scratchPath = routingScratchPathFor(launch.stage_result_path);
  const inputList = launch.inputs.required_artifacts.length > 0
    ? launch.inputs.required_artifacts.join(", ")
    : "none";
  lines.push(
    `Stage: ${launch.stage}`,
    `Artifact dir: ${launch.artifact_dir}`,
    `Goal: ${launch.contract.stage_goal}`,
    `Instructions: ${launch.contract.stage_instructions.join(" | ")}`,
    `Read inputs from: ${inputList}`,
    `Primary output: ${launch.contract.primary_output ?? "none"}`,
    `Routing payload: write to ${scratchPath}`,
    `Dispatch: ${launch.dispatch_id}`,
    `Run: ${launch.run_id}`,
    `Worker mode: ${launch.worker.mode}`,
    `Trace: ${randomUUID()}`,
    "",
    "Run the skill, produce the stage's primary output, then use the Write",
    "tool to write a JSON object to the `Routing payload` path with keys:",
    "outcome_code (string), status (completed|blocked|failed|skipped),",
    "summary_path (optional string), artifacts_written (optional string",
    "array), data (optional object). Exit when the routing payload is on",
    "disk. The host will translate it into the stage-result contract.",
  );
  return lines.join("\n");
}

async function writeWorkerTrace(
  repoRoot: string,
  workerId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const tracePath = resolve(repoRoot, ".praxis", "traces", `${workerId}.json`);
  await mkdir(dirname(tracePath), { recursive: true });
  await writeJsonFile(tracePath, payload);
}

async function raceEarlyExit(
  exitPromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }>,
  graceWindowMs: number,
): Promise<{ code: number | null; signal: NodeJS.Signals | null } | null> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<null>((resolveTimeout) => {
    timer = setTimeout(() => {
      resolveTimeout(null);
    }, graceWindowMs);
  });
  try {
    return await Promise.race([exitPromise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
