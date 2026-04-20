import { mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { probeCommand } from "./command-probe.js";
import { selectInstructionSurfaces } from "../workers/context-manifest.js";
import type {
  AdapterHealth,
  AdapterLaunchRequest,
  AdapterLaunchResponse,
  RuntimeAdapter,
} from "./types.js";
import { resolvePraxisCliInvocation } from "../workers/praxis-cli-invocation.js";
import {
  parseWorkerLocator,
  waitForHandshake,
  waitForWorkerExit,
  type WorkerHostMode,
} from "../workers/worker-host-protocol.js";

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
      version: probe.version,
    };
  }

  async launch(request: AdapterLaunchRequest): Promise<AdapterLaunchResponse> {
    return this.startWorkerHost("launch", request, null);
  }

  async resume(sessionId: string, request: AdapterLaunchRequest): Promise<AdapterLaunchResponse> {
    return this.startWorkerHost("resume", request, sessionId);
  }

  async cancel(handle: {
    session_id: string | null;
    locator: string | null;
  }): Promise<{ cancelled: boolean; reason: string }> {
    if (!handle.locator) {
      return {
        cancelled: false,
        reason:
          "No worker-host locator provided. session_id is provider-owned and cannot stop the worker process.",
      };
    }

    const pid = parseWorkerLocator(handle.locator);
    if (!pid) {
      return {
        cancelled: true,
        reason: `Cancelled worker via opaque locator ${handle.locator}.`,
      };
    }

    try {
      process.kill(pid, "SIGTERM");
      const exited = await waitForWorkerExit(pid, 1500);
      if (!exited) {
        process.kill(pid, "SIGKILL");
        return {
          cancelled: true,
          reason: `Force-stopped worker host at ${handle.locator}.`,
        };
      }
      return {
        cancelled: true,
        reason: `Cancelled worker host at ${handle.locator}.`,
      };
    } catch (error) {
      return {
        cancelled: false,
        reason:
          error instanceof Error
            ? `Failed to cancel worker host ${handle.locator}: ${error.message}`
            : `Failed to cancel worker host ${handle.locator}.`,
      };
    }
  }

  private async startWorkerHost(
    mode: WorkerHostMode,
    request: AdapterLaunchRequest,
    resumeSessionId: string | null,
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
      mode,
    ];
    if (resumeSessionId) {
      args.push("--expected-session-id", resumeSessionId);
    }

    const child = spawn(invocation.command, args, {
      cwd: request.repoRoot,
      env: process.env,
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    const handshake = await waitForHandshake(handshakeAbsolutePath, "codex");
    await rm(handshakeAbsolutePath, { force: true });

    if (handshake.status !== "ready") {
      throw new Error(`Codex worker host failed startup: ${handshake.error}`);
    }
    if (handshake.dispatch_id !== request.dispatch.dispatch_id) {
      throw new Error(
        `Codex worker host handshake dispatch mismatch. Expected ${request.dispatch.dispatch_id}, received ${handshake.dispatch_id}.`,
      );
    }
    if (handshake.worker_id !== workerId) {
      throw new Error(
        `Codex worker host handshake worker mismatch. Expected ${workerId}, received ${handshake.worker_id}.`,
      );
    }
    if (!handshake.session_id) {
      throw new Error("Codex worker host handshake omitted session_id.");
    }
    if (resumeSessionId && handshake.session_id !== resumeSessionId) {
      throw new Error(
        `Codex worker host resumed a different provider session. Expected ${resumeSessionId}, received ${handshake.session_id}.`,
      );
    }

    const instructionSurfaces = selectInstructionSurfaces(
      request.launch.context_manifest.instruction_surfaces,
      "codex",
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
        handshake_path: handshakeRelativePath,
      },
    };
  }
}
