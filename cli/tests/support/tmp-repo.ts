import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TempRepo = {
  dir: string;
};

/**
 * Create a fresh temp directory, run `git init` inside it, hand it to `fn`,
 * then remove the directory regardless of outcome.
 */
export async function withTempRepo<T>(
  fn: (repo: TempRepo) => Promise<T> | T,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "praxis-test-"));
  const init = spawnSync("git", ["init", "--quiet"], { cwd: dir });
  if (init.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(
      `git init failed in ${dir}: ${init.stderr?.toString() ?? "unknown"}`,
    );
  }
  try {
    return await fn({ dir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
