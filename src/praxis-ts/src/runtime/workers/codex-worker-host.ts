import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { nowIsoUtc } from "../common/time.js";
import { writeJsonFile } from "../state/store.js";
import { PraxisStateRepository } from "../state/index.js";
import { RunController } from "../control/index.js";
import type { WorkerLaunchPayload } from "../control/types.js";

export type WorkerHostMode = "launch" | "resume";

export type RunCodexWorkerHostInput = {
  repoRoot: string;
  dispatchId: string;
  workerId: string;
  handshakePath: string;
  mode: WorkerHostMode;
  expectedSessionId: string | null;
};

type WorkerHostHandshake =
  | {
      version: 1;
      status: "ready";
      dispatch_id: string;
      worker_id: string;
      session_id: string;
      started_at: string;
      locator: string;
      provider_details: {
        command: {
          binary: string;
          args: string[];
          cwd: string;
        };
        mode: WorkerHostMode;
      };
    }
  | {
      version: 1;
      status: "error";
      dispatch_id: string;
      worker_id: string;
      error: string;
      emitted_at: string;
    };

type SpawnedCodexCommand = {
  binary: string;
  args: string[];
  cwd: string;
};

const SESSION_ID_KEYS = [
  "session_id",
  "sessionId",
  "thread_id",
  "threadId",
  "conversation_id",
  "conversationId"
] as const;

export async function runCodexWorkerHost(input: RunCodexWorkerHostInput): Promise<void> {
  const repo = new PraxisStateRepository(input.repoRoot);
  const controller = new RunController(repo);
  const launch = await controller.buildWorkerLaunch();
  if (launch.dispatch_id !== input.dispatchId) {
    throw new Error(
      `run-codex-worker dispatch mismatch. Expected ${input.dispatchId}, found ${launch.dispatch_id}.`
    );
  }
  if (launch.worker.adapter !== "codex") {
    throw new Error(`run-codex-worker only supports codex adapter (found ${launch.worker.adapter}).`);
  }

  const handshakeAbsolutePath = resolve(input.repoRoot, input.handshakePath);
  await mkdir(dirname(handshakeAbsolutePath), { recursive: true });

  const spawned = buildCodexCommand(input.mode, launch, input.expectedSessionId);
  const child = spawn(spawned.binary, spawned.args, {
    cwd: spawned.cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const startupTimestamp = nowIsoUtc();
  let handshakeWritten = false;
  let sessionId: string | null = null;
  let startupError: string | null = null;

  const failHandshake = async (message: string): Promise<void> => {
    if (handshakeWritten) {
      return;
    }
    await writeWorkerHandshake(handshakeAbsolutePath, {
      version: 1,
      status: "error",
      dispatch_id: input.dispatchId,
      worker_id: input.workerId,
      error: message,
      emitted_at: nowIsoUtc()
    });
    handshakeWritten = true;
  };

  const tryEmitReadyHandshake = async (candidateSessionId: string): Promise<void> => {
    if (handshakeWritten) {
      return;
    }
    if (input.mode === "resume" && input.expectedSessionId && candidateSessionId !== input.expectedSessionId) {
      await failHandshake(
        `Codex resumed a different session_id. Expected ${input.expectedSessionId}, received ${candidateSessionId}.`
      );
      child.kill("SIGTERM");
      return;
    }

    sessionId = candidateSessionId;
    await writeWorkerHandshake(handshakeAbsolutePath, {
      version: 1,
      status: "ready",
      dispatch_id: input.dispatchId,
      worker_id: input.workerId,
      session_id: candidateSessionId,
      started_at: startupTimestamp,
      locator: buildWorkerLocator(process.pid),
      provider_details: {
        command: {
          binary: spawned.binary,
          args: spawned.args,
          cwd: spawned.cwd
        },
        mode: input.mode
      }
    });
    handshakeWritten = true;
  };

  const stdoutReader = createInterface({ input: child.stdout });
  stdoutReader.on("line", (line) => {
    const parsed = tryParseJson(line);
    if (!parsed) {
      return;
    }
    const emittedSession = extractSessionId(parsed);
    if (emittedSession) {
      void tryEmitReadyHandshake(emittedSession);
    }
  });

  const stderrBuffer: string[] = [];
  const stderrReader = createInterface({ input: child.stderr });
  stderrReader.on("line", (line) => {
    if (stderrBuffer.length >= 80) {
      stderrBuffer.shift();
    }
    stderrBuffer.push(line);
  });

  const forwardSignal = (signal: NodeJS.Signals): void => {
    if (child.exitCode === null && !child.killed) {
      child.kill(signal);
    }
  };
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));
  process.on("SIGINT", () => forwardSignal("SIGINT"));
  child.once("error", (error) => {
    startupError = error instanceof Error ? error.message : String(error);
    void failHandshake(`Failed to start codex process: ${startupError}`);
  });

  const exitResult = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveExit) => {
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });

  if (!handshakeWritten) {
    const stderrSummary = stderrBuffer.slice(-12).join("\n");
    await failHandshake(
      [
        startupError
          ? `Codex failed during startup: ${startupError}`
          : "Codex exited before emitting a provider session_id.",
        stderrSummary ? `stderr:\n${stderrSummary}` : null
      ]
        .filter(Boolean)
        .join("\n")
    );
    return;
  }

  if (exitResult.code !== 0) {
    await writeWorkerTrace(input.repoRoot, input.workerId, {
      version: 1,
      type: "runtime_failed",
      dispatch_id: input.dispatchId,
      worker_id: input.workerId,
      session_id: sessionId,
      mode: input.mode,
      exit_code: exitResult.code,
      exit_signal: exitResult.signal,
      recorded_at: nowIsoUtc(),
      stderr_tail: stderrBuffer.slice(-40)
    });
    return;
  }

  const stageResultAbsolutePath = resolve(input.repoRoot, launch.stage_result_path);
  if (!existsSync(stageResultAbsolutePath)) {
    await writeWorkerTrace(input.repoRoot, input.workerId, {
      version: 1,
      type: "missing_stage_result",
      dispatch_id: input.dispatchId,
      worker_id: input.workerId,
      session_id: sessionId,
      stage_result_path: launch.stage_result_path,
      recorded_at: nowIsoUtc()
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
      session_id: sessionId,
      stage_result_path: launch.stage_result_path,
      recorded_at: nowIsoUtc(),
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function buildCodexCommand(
  mode: WorkerHostMode,
  launch: WorkerLaunchPayload,
  expectedSessionId: string | null
): SpawnedCodexCommand {
  const binary = process.env.PRAXIS_CODEX_BIN?.trim() || "codex";
  const stageResultAbsolutePath = resolve(launch.execution.workspace_root, launch.stage_result_path);
  const prompt = buildStagePrompt(launch);
  const sandboxMode = process.env.PRAXIS_CODEX_SANDBOX?.trim() || "workspace-write";

  if (mode === "resume") {
    const resumeSessionId = expectedSessionId ?? launch.worker.resume_session_id;
    if (!resumeSessionId) {
      throw new Error("Codex resume requested without a provider session_id.");
    }
    return {
      binary,
      args: [
        "resume",
        resumeSessionId,
        "-C",
        launch.execution.workspace_root,
        "-a",
        "never",
        "--json",
        "-o",
        stageResultAbsolutePath,
        prompt
      ],
      cwd: launch.execution.workspace_root
    };
  }

  return {
    binary,
    args: [
      "exec",
      "-C",
      launch.execution.workspace_root,
      "-a",
      "never",
      "-s",
      sandboxMode,
      "--json",
      "-o",
      stageResultAbsolutePath,
      prompt
    ],
    cwd: launch.execution.workspace_root
  };
}

function buildStagePrompt(launch: WorkerLaunchPayload): string {
  return [
    `Stage: ${launch.stage}`,
    `Goal: ${launch.contract.stage_goal}`,
    `Instructions: ${launch.contract.stage_instructions.join(" | ")}`,
    `Required inputs: ${launch.inputs.required_artifacts.join(", ") || "none"}`,
    `Primary output: ${launch.contract.primary_output ?? "none"}`,
    `Stage result: ${launch.stage_result_path}`,
    `Dispatch: ${launch.dispatch_id}`,
    `Run: ${launch.run_id}`,
    `Worker mode: ${launch.worker.mode}`,
    `Trace: ${randomUUID()}`
  ].join("\n");
}

function tryParseJson(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractSessionId(payload: unknown): string | null {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = extractSessionId(item);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  if (typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  for (const key of SESSION_ID_KEYS) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  for (const value of Object.values(record)) {
    if (typeof value !== "object" || value === null) {
      continue;
    }
    const nested = extractSessionId(value);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function buildWorkerLocator(pid: number): string {
  return `worker-host://pid/${pid}`;
}

async function writeWorkerHandshake(path: string, payload: WorkerHostHandshake): Promise<void> {
  await writeJsonFile(path, payload);
}

async function writeWorkerTrace(
  repoRoot: string,
  workerId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const tracePath = resolve(repoRoot, ".praxis", "traces", `${workerId}.json`);
  await mkdir(dirname(tracePath), { recursive: true });
  await writeJsonFile(tracePath, payload);
}
