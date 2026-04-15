import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CommandProbeResult = {
  binary: string | null;
  version: string | null;
  healthy: boolean;
  reason: string;
};

export async function probeCommand(binary: string, versionArgs = ["--version"]): Promise<CommandProbeResult> {
  try {
    const { stdout, stderr } = await execFileAsync(binary, versionArgs);
    const output = `${stdout}\n${stderr}`.trim();
    const version = output.split("\n")[0]?.trim() ?? null;
    return {
      binary,
      version,
      healthy: true,
      reason: version ? `${binary} is available (${version}).` : `${binary} is available.`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      binary: null,
      version: null,
      healthy: false,
      reason: `${binary} is unavailable: ${message}`
    };
  }
}
