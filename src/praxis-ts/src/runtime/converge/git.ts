import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function readHeadCommit(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
    const hash = stdout.trim();
    return hash.length > 0 ? hash : null;
  } catch {
    return null;
  }
}

export async function listCommitRange(
  repoRoot: string,
  fromExclusive: string | null,
  toInclusive: string | null
): Promise<string[]> {
  if (!toInclusive) {
    return [];
  }

  const revision = fromExclusive ? `${fromExclusive}..${toInclusive}` : toInclusive;

  try {
    const { stdout } = await execFileAsync("git", ["log", "--format=%H", revision], { cwd: repoRoot });
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
