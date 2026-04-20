import { nowIsoUtc } from "../common/time.js";
import type { PraxisStateRepository } from "../state/repository.js";

export class ToolTelemetry {
  constructor(private readonly repo: PraxisStateRepository) {}

  async recordPolicyDecision(payload: {
    run_id: string;
    stage: string;
    dispatch_id: string;
    policy: Record<string, unknown>;
  }): Promise<void> {
    await this.repo.appendPolicyRecord({
      ts: nowIsoUtc(),
      type: "policy_decision",
      run_id: payload.run_id,
      stage: payload.stage,
      dispatch_id: payload.dispatch_id,
      policy: payload.policy,
    });
  }

  async recordToolUse(payload: {
    run_id: string;
    stage: string;
    tool: string;
    status: "granted" | "denied" | "failed";
    reason?: string;
  }): Promise<void> {
    await this.repo.appendPolicyRecord({
      ts: nowIsoUtc(),
      type: "tool_use",
      run_id: payload.run_id,
      stage: payload.stage,
      tool: payload.tool,
      status: payload.status,
      reason: payload.reason ?? null,
    });
  }
}
