import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AdapterName, DispatchRecord } from "../../../contracts/model.js";
import { buildDispatchPrompt } from "../../dispatch/index.js";

export interface AdapterSubprocessOptions {
  adapter: AdapterName;
  prompt: string;
  repoRoot: string;
  timeoutMs?: number;
}

export interface AdapterSubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Spawn the adapter CLI (claude or codex) in non-interactive mode with a prompt
// that invokes the /praxis:<stage> skill. The adapter writes the stage's
// artifacts directly to .praxis/; this function just blocks on its exit.
export async function runAdapterSubprocess(
  options: AdapterSubprocessOptions,
): Promise<AdapterSubprocessResult> {
  const { binary, args } = resolveAdapterInvocation(
    options.adapter,
    options.prompt,
    options.repoRoot,
  );
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: options.repoRoot,
      env: { ...process.env, PRAXIS_CONVERGE_SUBPROCESS: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(
        new Error(
          `Adapter subprocess ${options.adapter} exceeded ${String(timeoutMs)}ms without exiting.`,
        ),
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

function resolveAdapterInvocation(
  adapter: AdapterName,
  prompt: string,
  repoRoot: string,
): { binary: string; args: string[] } {
  if (adapter === "claude") {
    const override = process.env.PRAXIS_CLAUDE_BIN?.trim();
    const binary = override && override.length > 0 ? override : "claude";
    return {
      binary,
      args: ["--print", "--permission-mode", "acceptEdits", prompt],
    };
  }
  const override = process.env.PRAXIS_CODEX_BIN?.trim();
  const binary = override && override.length > 0 ? override : "codex";
  const sandboxOverride = process.env.PRAXIS_CODEX_SANDBOX?.trim();
  const sandboxMode =
    sandboxOverride && sandboxOverride.length > 0 ? sandboxOverride : "workspace-write";
  return {
    binary,
    args: ["exec", "-C", repoRoot, "-a", "never", "-s", sandboxMode, prompt],
  };
}

// Thin wrapper around the dispatch module. Kept for callers that still pass a
// DispatchRecord directly; new code should call `buildDispatchPrompt` with
// explicit inputs.
export function buildAdapterPrompt(
  dispatch: DispatchRecord,
  adapter: AdapterName,
  extraContext: Record<string, unknown>,
  options: { inputEnvelopePath?: string | null } = {},
): string {
  void adapter;
  return buildDispatchPrompt({
    stage: dispatch.stage,
    workflow: dispatch.workflow,
    stageGoal: dispatch.contract.stage_goal,
    stageInstructions: dispatch.contract.stage_instructions,
    inputs: {
      requiredArtifacts: dispatch.inputs.required_artifacts,
      inputEnvelopePath: options.inputEnvelopePath ?? null,
    },
    outputs: {
      expectedArtifacts: dispatch.contract.expected_output_artifacts,
      primaryOutput: dispatch.contract.primary_output,
      outputEnvelopePath: null,
    },
    extraContext,
  });
}

export async function readJsonFile<T>(path: string): Promise<T> {
  const text = await readFile(path, "utf8");
  return JSON.parse(text) as T;
}

export function absolutePath(repoRoot: string, relative: string): string {
  return join(repoRoot, relative);
}
