import { spawnSync } from "node:child_process";

/**
 * Auto-commit hand-off.
 *
 * Runs `git status --porcelain` first: empty tree → return
 * `{ ok: true, skipped: true }` without touching the repo. Otherwise stage
 * everything (`git add -A`), commit with the agent's verbatim message
 * (`git commit -m`), and read back the new HEAD via `git rev-parse HEAD`.
 *
 * Failure of any git invocation collapses to `{ ok: false, reason }` carrying
 * stderr, so the runner can persist it as `stopReason: "commit_failed"` and
 * the user sees the actual git error (no auth, hook rejection, missing
 * identity, etc.).
 *
 * Multi-line commit messages are preserved natively because `spawnSync`
 * passes argv as a single string — no shell quoting / re-parsing.
 */
export type CommitResult =
  | { ok: true; sha: string }
  | { ok: true; skipped: true }
  | { ok: false; reason: string };

export function commit(cwd: string, message: string): CommitResult {
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd,
    encoding: "utf8",
  });
  if (status.status !== 0) {
    return {
      ok: false,
      reason: `git status failed: ${(status.stderr || "").trim()}`,
    };
  }
  if (status.stdout.trim() === "") {
    return { ok: true, skipped: true };
  }

  const add = spawnSync("git", ["add", "-A"], { cwd, encoding: "utf8" });
  if (add.status !== 0) {
    return { ok: false, reason: (add.stderr || "git add -A failed").trim() };
  }

  const commitRes = spawnSync("git", ["commit", "-m", message], {
    cwd,
    encoding: "utf8",
  });
  if (commitRes.status !== 0) {
    return {
      ok: false,
      reason: (commitRes.stderr || "git commit failed").trim(),
    };
  }

  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
  });
  if (head.status !== 0) {
    return {
      ok: false,
      reason: `git rev-parse HEAD failed: ${(head.stderr || "").trim()}`,
    };
  }

  return { ok: true, sha: head.stdout.trim() };
}
