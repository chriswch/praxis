import { spawnSync } from "node:child_process";

/**
 * Pre-check used by stages that short-circuit on a clean working tree
 * (auto-commit, code-reviewing, code-improving): returns true when
 * `git status --porcelain` is empty inside `cwd`. A non-zero git exit
 * conservatively returns false so the normal stage path runs and surfaces
 * the underlying error through the SDK / commit() result rather than a
 * silent skip.
 */
export function isWorkingTreeClean(cwd: string): boolean {
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd,
    encoding: "utf8",
  });
  if (status.status !== 0) return false;
  return status.stdout.trim() === "";
}
