import { randomUUID } from "node:crypto";
import { nowIsoUtc } from "../common/time.js";
import { probeCommand } from "./command-probe.js";
import { selectInstructionSurfaces } from "../workers/context-manifest.js";
import type { AdapterHealth, AdapterLaunchRequest, AdapterLaunchResponse, RuntimeAdapter } from "./types.js";

export class ClaudeAdapter implements RuntimeAdapter {
  readonly name = "claude" as const;

  async health(): Promise<AdapterHealth> {
    const probe = await probeCommand("claude");
    const hasHome = Boolean(process.env.HOME);
    const healthy = probe.healthy && hasHome;

    return {
      adapter: this.name,
      healthy,
      supports_resume: true,
      reason: !probe.healthy
        ? probe.reason
        : hasHome
          ? "claude is available and HOME is configured."
          : "HOME is required to initialize Claude runtime home.",
      binary: probe.binary,
      version: probe.version
    };
  }

  // NOTE: launch/resume return a preview only — no Claude process is spawned here. The
  // returned session_id is synthesized on the spot so callers can persist a handle, but
  // nothing is actually running on the other end. Promote to a real process host before
  // depending on the session for anything beyond identity bookkeeping.
  async launch(request: AdapterLaunchRequest): Promise<AdapterLaunchResponse> {
    const instructionSurfaces = selectInstructionSurfaces(request.launch.context_manifest.instruction_surfaces, "claude");
    const commandPreview = buildClaudeCommandPreview(request);
    return {
      worker_id: `wrk_claude_${request.dispatch.stage}_${randomUUID()}`,
      session_id: `claude_session_${randomUUID()}`,
      started_at: nowIsoUtc(),
      locator: `claude-cli://${request.dispatch.dispatch_id}?entrypoint=${encodeURIComponent(request.launch.runtime.entrypoint)}&instructions=${instructionSurfaces.length}`,
      details: {
        command: commandPreview,
        instruction_surfaces: instructionSurfaces.map((surface) => surface.path)
      }
    };
  }

  async resume(sessionId: string, request: AdapterLaunchRequest): Promise<AdapterLaunchResponse> {
    const instructionSurfaces = selectInstructionSurfaces(request.launch.context_manifest.instruction_surfaces, "claude");
    const commandPreview = buildClaudeCommandPreview(request, sessionId);
    return {
      worker_id: `wrk_claude_resume_${request.dispatch.stage}_${randomUUID()}`,
      session_id: sessionId,
      started_at: nowIsoUtc(),
      locator: `claude-cli://${request.dispatch.dispatch_id}?resume=true&instructions=${instructionSurfaces.length}`,
      details: {
        command: commandPreview,
        instruction_surfaces: instructionSurfaces.map((surface) => surface.path)
      }
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

function buildClaudeCommandPreview(
  request: AdapterLaunchRequest,
  resumeSessionId: string | null = null
): Record<string, unknown> {
  const prompt = buildStagePrompt(request);
  const args = resumeSessionId
    ? ["--resume", resumeSessionId]
    : ["-p", prompt, "--add-dir", request.launch.execution.workspace_root];

  return {
    binary: "claude",
    args,
    cwd: request.launch.execution.workspace_root,
    primary_output: request.launch.contract.primary_output,
    stage_result_path: request.launch.stage_result_path
  };
}

function buildStagePrompt(request: AdapterLaunchRequest): string {
  return [
    `Stage: ${request.launch.stage}`,
    `Goal: ${request.launch.contract.stage_goal}`,
    `Instructions: ${request.launch.contract.stage_instructions.join(" | ")}`,
    `Required inputs: ${request.launch.inputs.required_artifacts.join(", ") || "none"}`,
    `Primary output: ${request.launch.contract.primary_output ?? "none"}`,
    `Stage result: ${request.launch.stage_result_path}`
  ].join("\n");
}
