import { randomUUID } from "node:crypto";
import { nowIsoUtc } from "../common/time.js";
import { selectInstructionSurfaces } from "../workers/context-manifest.js";
import type { AdapterHealth, AdapterLaunchRequest, AdapterLaunchResponse, RuntimeAdapter } from "./types.js";

export class CodexAdapter implements RuntimeAdapter {
  readonly name = "codex" as const;

  async health(): Promise<AdapterHealth> {
    const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
    const healthy = Number.isFinite(nodeMajor) && nodeMajor >= 20;

    return {
      adapter: this.name,
      healthy,
      supports_resume: true,
      reason: healthy ? "Runtime prerequisites satisfied." : "Node.js 20+ is required for Codex SDK mode."
    };
  }

  async launch(request: AdapterLaunchRequest): Promise<AdapterLaunchResponse> {
    const instructionSurfaces = selectInstructionSurfaces(request.launch.context_manifest.instruction_surfaces, "codex");
    return {
      worker_id: `wrk_codex_${request.dispatch.stage}_${randomUUID()}`,
      session_id: `codex_session_${randomUUID()}`,
      started_at: nowIsoUtc(),
      locator: `codex://${request.dispatch.dispatch_id}?entrypoint=${encodeURIComponent(request.launch.runtime.entrypoint)}&instructions=${instructionSurfaces.length}`
    };
  }

  async resume(sessionId: string, request: AdapterLaunchRequest): Promise<AdapterLaunchResponse> {
    const instructionSurfaces = selectInstructionSurfaces(request.launch.context_manifest.instruction_surfaces, "codex");
    return {
      worker_id: `wrk_codex_resume_${request.dispatch.stage}_${randomUUID()}`,
      session_id: sessionId,
      started_at: nowIsoUtc(),
      locator: `codex://${request.dispatch.dispatch_id}?resume=true&instructions=${instructionSurfaces.length}`
    };
  }

  async cancel(handle: { session_id: string | null; locator: string | null }): Promise<{ cancelled: boolean; reason: string }> {
    if (handle.session_id) {
      return {
        cancelled: true,
        reason: `Cancelled session ${handle.session_id}.`
      };
    }
    if (handle.locator) {
      return {
        cancelled: true,
        reason: `Cancelled worker at ${handle.locator}.`
      };
    }
    return {
      cancelled: false,
      reason: "No cancellation handle provided."
    };
  }
}
