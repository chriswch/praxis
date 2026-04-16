import { mkdir, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { probeCommand } from "./command-probe.js";
import { selectInstructionSurfaces } from "../workers/context-manifest.js";
import type { AdapterHealth, AdapterLaunchRequest, AdapterLaunchResponse, RuntimeAdapter } from "./types.js";
import { resolvePraxisCliInvocation } from "../workers/praxis-cli-invocation.js";

type WorkerHostMode = "launch" | "resume";

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

export class CodexAdapter implements RuntimeAdapter {
  readonly name = "codex" as const;

  async health(): Promise<AdapterHealth> {
    const probe = await probeCommand("codex");

    return {
      adapter: this.name,
      healthy: probe.healthy,
      supports_resume: true,
      reason: probe.reason,
      binary: probe.binary,
      version: probe.version
    };
  }

  async launch(request: AdapterLaunchRequest): Promise<AdapterLaunchResponse> {
    return this.startWorkerHost("launch", request, null);
  }

  async resume(sessionId: string, request: AdapterLaunchRequest): Promise<AdapterLaunchResponse> {
    return this.startWorkerHost("resume", request, sessionId);
  }

  async cancel(handle: { session_id: string | null; locator: string | null }): Promise<{ cancelled: boolean; reason: string }> {
    if (!handle.locator) {
      return {
        cancelled: false,
        reason: "No worker-host locator provided. session_id is provider-owned and cannot stop the worker process."
      };
    }

    const pid = parseWorkerLocator(handle.locator);
    if (!pid) {
      return {
        cancelled: false,
        reason: `Unsupported worker-host locator format: ${handle.locator}.`
      };
    }

    try {
      process.kill(pid, "SIGTERM");
      return {
        cancelled: true,
        reason: `Cancelled worker host at ${handle.locator}.`
      };
    } catch (error) {
      return {
        cancelled: false,
        reason: error instanceof Error
          ? `Failed to cancel worker host ${handle.locator}: ${error.message}`
          : `Failed to cancel worker host ${handle.locator}.`
      };
    }
  }

  private async startWorkerHost(
    mode: WorkerHostMode,
    request: AdapterLaunchRequest,
    resumeSessionId: string | null
  ): Promise<AdapterLaunchResponse> {
    const workerIdPrefix = mode === "resume" ? "wrk_codex_resume" : "wrk_codex";
    const workerId = `${workerIdPrefix}_${request.dispatch.stage}_${randomUUID()}`;
    const handshakeRelativePath = `.praxis/traces/worker-handshake-${workerId}.json`;
    const handshakeAbsolutePath = resolve(request.repoRoot, handshakeRelativePath);
    await mkdir(dirname(handshakeAbsolutePath), { recursive: true });

    const invocation = resolvePraxisCliInvocation();
    const args = [
      ...invocation.args,
      "--repo-root",
      request.repoRoot,
      "--json",
      "run-codex-worker",
      "--dispatch-id",
      request.dispatch.dispatch_id,
      "--worker-id",
      workerId,
      "--handshake-path",
      handshakeRelativePath,
      "--mode",
      mode
    ];
    if (resumeSessionId) {
      args.push("--expected-session-id", resumeSessionId);
    }

    const child = spawn(invocation.command, args, {
      cwd: request.repoRoot,
      env: process.env,
      detached: true,
      stdio: "ignore"
    });
    child.unref();

    const handshake = await waitForHandshake(handshakeAbsolutePath);
    await rm(handshakeAbsolutePath, { force: true });

    if (handshake.status !== "ready") {
      throw new Error(`Codex worker host failed startup: ${handshake.error}`);
    }
    if (handshake.dispatch_id !== request.dispatch.dispatch_id) {
      throw new Error(
        `Codex worker host handshake dispatch mismatch. Expected ${request.dispatch.dispatch_id}, received ${handshake.dispatch_id}.`
      );
    }
    if (handshake.worker_id !== workerId) {
      throw new Error(
        `Codex worker host handshake worker mismatch. Expected ${workerId}, received ${handshake.worker_id}.`
      );
    }
    if (!handshake.session_id) {
      throw new Error("Codex worker host handshake omitted session_id.");
    }
    if (resumeSessionId && handshake.session_id !== resumeSessionId) {
      throw new Error(
        `Codex worker host resumed a different provider session. Expected ${resumeSessionId}, received ${handshake.session_id}.`
      );
    }

    const instructionSurfaces = selectInstructionSurfaces(
      request.launch.context_manifest.instruction_surfaces,
      "codex"
    );
    return {
      worker_id: handshake.worker_id,
      session_id: handshake.session_id,
      started_at: handshake.started_at,
      locator: handshake.locator,
      details: {
        command: handshake.provider_details.command,
        mode: handshake.provider_details.mode,
        instruction_surfaces: instructionSurfaces.map((surface) => surface.path),
        handshake_path: handshakeRelativePath
      }
    };
  }
}

async function waitForHandshake(path: string): Promise<WorkerHostHandshake> {
  const startedAt = Date.now();
  const timeoutMs = parsePositiveInt(process.env.PRAXIS_WORKER_STARTUP_TIMEOUT_MS, 20000);

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (isWorkerHostHandshake(parsed)) {
        return parsed;
      }
      throw new Error(`Malformed worker-host handshake at ${path}.`);
    } catch (error) {
      if (isRetryableHandshakeReadError(error)) {
        await sleep(100);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Timed out waiting for codex worker host startup handshake at ${path}.`);
}

function isRetryableHandshakeReadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function isWorkerHostHandshake(payload: unknown): payload is WorkerHostHandshake {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return false;
  }

  const record = payload as Record<string, unknown>;
  if (record.version !== 1 || typeof record.status !== "string") {
    return false;
  }

  if (record.status === "ready") {
    return typeof record.dispatch_id === "string"
      && typeof record.worker_id === "string"
      && typeof record.session_id === "string"
      && typeof record.started_at === "string"
      && typeof record.locator === "string";
  }

  if (record.status === "error") {
    return typeof record.dispatch_id === "string"
      && typeof record.worker_id === "string"
      && typeof record.error === "string"
      && typeof record.emitted_at === "string";
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseWorkerLocator(locator: string): number | null {
  const match = /^worker-host:\/\/pid\/(\d+)$/.exec(locator.trim());
  if (!match) {
    return null;
  }
  const pid = Number.parseInt(match[1], 10);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}
