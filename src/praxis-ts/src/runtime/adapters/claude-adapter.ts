import { randomUUID } from "node:crypto";
import { nowIsoUtc } from "../common/time.js";
import type { AdapterHealth, AdapterLaunchRequest, AdapterLaunchResponse, RuntimeAdapter } from "./types.js";

export class ClaudeAdapter implements RuntimeAdapter {
  readonly name = "claude" as const;

  async health(): Promise<AdapterHealth> {
    const hasHome = Boolean(process.env.HOME);

    return {
      adapter: this.name,
      healthy: hasHome,
      supports_resume: true,
      reason: hasHome ? "Runtime prerequisites satisfied." : "HOME is required to initialize Claude runtime home."
    };
  }

  async launch(request: AdapterLaunchRequest): Promise<AdapterLaunchResponse> {
    return {
      worker_id: `wrk_claude_${request.dispatch.stage}_${randomUUID()}`,
      session_id: `claude_session_${randomUUID()}`,
      started_at: nowIsoUtc(),
      locator: `claude://${request.dispatch.dispatch_id}`
    };
  }

  async resume(sessionId: string, request: AdapterLaunchRequest): Promise<AdapterLaunchResponse> {
    return {
      worker_id: `wrk_claude_resume_${request.dispatch.stage}_${randomUUID()}`,
      session_id: sessionId,
      started_at: nowIsoUtc(),
      locator: `claude://${request.dispatch.dispatch_id}?resume=true`
    };
  }

  async cancel(sessionId: string): Promise<{ cancelled: boolean; reason: string }> {
    return {
      cancelled: true,
      reason: `Cancelled session ${sessionId}.`
    };
  }
}
