import { randomUUID } from "node:crypto";
import { nowIsoUtc } from "../common/time.js";
import { probeCommand } from "./command-probe.js";
import { selectInstructionSurfaces } from "../workers/context-manifest.js";
import type { AdapterHealth, AdapterLaunchRequest, AdapterLaunchResponse, RuntimeAdapter } from "./types.js";

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
    const instructionSurfaces = selectInstructionSurfaces(request.launch.context_manifest.instruction_surfaces, "codex");
    const commandPreview = buildCodexCommandPreview(request);
    return {
      worker_id: `wrk_codex_${request.dispatch.stage}_${randomUUID()}`,
      session_id: `codex_session_${randomUUID()}`,
      started_at: nowIsoUtc(),
      locator: `codex-cli://${request.dispatch.dispatch_id}?entrypoint=${encodeURIComponent(request.launch.runtime.entrypoint)}&instructions=${instructionSurfaces.length}`,
      details: {
        command: commandPreview,
        instruction_surfaces: instructionSurfaces.map((surface) => surface.path)
      }
    };
  }

  async resume(sessionId: string, request: AdapterLaunchRequest): Promise<AdapterLaunchResponse> {
    const instructionSurfaces = selectInstructionSurfaces(request.launch.context_manifest.instruction_surfaces, "codex");
    const commandPreview = buildCodexCommandPreview(request, sessionId);
    return {
      worker_id: `wrk_codex_resume_${request.dispatch.stage}_${randomUUID()}`,
      session_id: sessionId,
      started_at: nowIsoUtc(),
      locator: `codex-cli://${request.dispatch.dispatch_id}?resume=true&instructions=${instructionSurfaces.length}`,
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

function buildCodexCommandPreview(
  request: AdapterLaunchRequest,
  resumeSessionId: string | null = null
): Record<string, unknown> {
  const prompt = buildStagePrompt(request);
  const args = resumeSessionId
    ? ["resume", resumeSessionId]
    : ["-C", request.launch.execution.workspace_root, "exec", prompt];

  return {
    binary: "codex",
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
