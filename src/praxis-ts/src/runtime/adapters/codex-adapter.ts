import { randomUUID } from "node:crypto";
import { nowIsoUtc } from "../common/time.js";
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
    return {
      worker_id: `wrk_codex_${request.dispatch.stage}_${randomUUID()}`,
      session_id: `codex_session_${randomUUID()}`,
      started_at: nowIsoUtc(),
      locator: `codex://${request.dispatch.dispatch_id}`
    };
  }

  async resume(sessionId: string, request: AdapterLaunchRequest): Promise<AdapterLaunchResponse> {
    return {
      worker_id: `wrk_codex_resume_${request.dispatch.stage}_${randomUUID()}`,
      session_id: sessionId,
      started_at: nowIsoUtc(),
      locator: `codex://${request.dispatch.dispatch_id}?resume=true`
    };
  }

  async cancel(sessionId: string): Promise<{ cancelled: boolean; reason: string }> {
    return {
      cancelled: true,
      reason: `Cancelled session ${sessionId}.`
    };
  }
}
