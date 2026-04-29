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

/**
 * S-1 — read `git rev-parse HEAD` once at run start so downstream stages can
 * reference the pre-run baseline via `{{baselineSha}}`. Returns
 * `{ ok: true, sha }` when HEAD resolves to a 40-hex commit; otherwise
 * `{ ok: false, reason }` containing the literal string `"no commits"` so the
 * runner can surface a precise pre-run failure (no run-dir created).
 *
 * Same `{ ok, ... }` shape as {@link isWorkingTreeClean}'s caller pattern:
 * any non-zero git exit OR stdout that doesn't match the 40-hex commit shape
 * is treated as the "no commits yet" branch — git's stderr varies across
 * versions, so we don't try to thread that through.
 *
 * The returned `reason` is the diagnosis only; the matching `git commit
 * --allow-empty` remediation hint lives on the runner-level failure
 * (`runWorkflow`) so the diagnosis/fix split mirrors `runPreflight`.
 */
export function currentHead(
  cwd: string,
): { ok: true; sha: string } | { ok: false; reason: string } {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
  });
  const sha = (result.stdout || "").trim();
  if (result.status !== 0 || !/^[0-9a-f]{40}$/.test(sha)) {
    return {
      ok: false,
      reason: "this repo has no commits yet",
    };
  }
  return { ok: true, sha };
}
