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
  type WorkerHostHandshake,
  type WorkerHostMode,
} from "./worker-host-protocol.js";

export type { WorkerHostMode } from "./worker-host-protocol.js";

export interface RunCodexWorkerHostInput {
  repoRoot: string;
  dispatchId: string;
  workerId: string;
  handshakePath: string;
  mode: WorkerHostMode;
  expectedSessionId: string | null;
}

interface SpawnedCodexCommand {
  binary: string;
  args: string[];
  cwd: string;
}

const SESSION_ID_KEYS = [
  "session_id",
  "sessionId",
  "thread_id",
  "threadId",
  "conversation_id",
  "conversationId",
] as const;

export async function runCodexWorkerHost(input: RunCodexWorkerHostInput): Promise<void> {
  const repo = new PraxisStateRepository(input.repoRoot);
  const controller = new RunController(repo);
  const launch = await controller.buildWorkerLaunch();
  if (launch.dispatch_id !== input.dispatchId) {
    throw new Error(
      `run-codex-worker dispatch mismatch. Expected ${input.dispatchId}, found ${launch.dispatch_id}.`,
    );
  }
  if (launch.worker.adapter !== "codex") {
    throw new Error(
      `run-codex-worker only supports codex adapter (found ${launch.worker.adapter}).`,
    );
  }

  const handshakeAbsolutePath = resolve(input.repoRoot, input.handshakePath);
  await mkdir(dirname(handshakeAbsolutePath), { recursive: true });

  const spawned = buildCodexCommand(input.mode, launch, input.expectedSessionId);
  const child = spawn(spawned.binary, spawned.args, {
    cwd: spawned.cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const startupTimestamp = nowIsoUtc();
  const state: {
    handshakeWritten: boolean;
    sessionId: string | null;
    startupError: string | null;
  } = { handshakeWritten: false, sessionId: null, startupError: null };

  const failHandshake = async (message: string): Promise<void> => {
    if (state.handshakeWritten) {
      return;
    }
    await writeWorkerHandshake(handshakeAbsolutePath, {
      version: 1,
      status: "error",
      dispatch_id: input.dispatchId,
      worker_id: input.workerId,
      error: message,
      emitted_at: nowIsoUtc(),
    });
    state.handshakeWritten = true;
  };

  const tryEmitReadyHandshake = async (candidateSessionId: string): Promise<void> => {
    if (state.handshakeWritten) {
      return;
    }
    if (
      input.mode === "resume" &&
      input.expectedSessionId &&
      candidateSessionId !== input.expectedSessionId
    ) {
      await failHandshake(
        `Codex resumed a different session_id. Expected ${input.expectedSessionId}, received ${candidateSessionId}.`,
      );
      child.kill("SIGTERM");
      return;
    }

    state.sessionId = candidateSessionId;
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
          cwd: spawned.cwd,
        },
        mode: input.mode,
      },
    });
    state.handshakeWritten = true;
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
  process.on("SIGTERM", () => {
    forwardSignal("SIGTERM");
  });
  process.on("SIGINT", () => {
    forwardSignal("SIGINT");
  });
  child.once("error", (error) => {
    state.startupError = error instanceof Error ? error.message : String(error);
    void failHandshake(`Failed to start codex process: ${state.startupError}`);
  });

  const exitResult = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolveExit) => {
      child.once("exit", (code, signal) => {
        resolveExit({ code, signal });
      });
    },
  );

  if (!state.handshakeWritten) {
    const stderrSummary = stderrBuffer.slice(-12).join("\n");
    await failHandshake(
      [
        state.startupError
          ? `Codex failed during startup: ${state.startupError}`
          : "Codex exited before emitting a provider session_id.",
        stderrSummary ? `stderr:\n${stderrSummary}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return;
  }

  if (exitResult.code !== 0) {
    await writeWorkerTrace(input.repoRoot, input.workerId, {
      version: 1,
      type: "runtime_failed",
      dispatch_id: input.dispatchId,
      worker_id: input.workerId,
      session_id: state.sessionId,
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
    const stageResult = composeStageResult(launch, state.sessionId, routingPayload);
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
      session_id: state.sessionId,
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
      session_id: state.sessionId,
      stage_result_path: launch.stage_result_path,
      recorded_at: nowIsoUtc(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildCodexCommand(
  mode: WorkerHostMode,
  launch: WorkerLaunchPayload,
  expectedSessionId: string | null,
): SpawnedCodexCommand {
  const binaryOverride = process.env.PRAXIS_CODEX_BIN?.trim();
  const binary = binaryOverride && binaryOverride.length > 0 ? binaryOverride : "codex";
  const prompt = buildStagePrompt(launch);
  const sandboxOverride = process.env.PRAXIS_CODEX_SANDBOX?.trim();
  const sandboxMode =
    sandboxOverride && sandboxOverride.length > 0 ? sandboxOverride : "workspace-write";

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
        prompt,
      ],
      cwd: launch.execution.workspace_root,
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
      prompt,
    ],
    cwd: launch.execution.workspace_root,
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
    "Run the skill, produce the stage's primary output, then write a JSON",
    "object to the `Routing payload` path with keys: outcome_code (string),",
    "status (completed|blocked|failed|skipped), summary_path (optional",
    "string), artifacts_written (optional string array), data (optional",
    "object). Exit when the routing payload is on disk. The host will",
    "translate it into the stage-result contract.",
  );
  return lines.join("\n");
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

async function writeWorkerHandshake(path: string, payload: WorkerHostHandshake): Promise<void> {
  await writeJsonFile(path, payload);
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
