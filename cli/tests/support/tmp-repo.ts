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
  // S-006 AC-11 — local-scope git identity so `git commit -m` works without
  // any global user.* config (CI, fresh containers, contributor laptops).
  // Also disable commit.gpgsign locally — contributors with gpgsign=true and
  // no signing key configured otherwise hit `fatal: either user.signingkey or
  // gpg.ssh.defaultKeyCommand needs to be configured` on every test that
  // commits. Local scope keeps these inside `dir`'s .git/config; they vanish
  // with the rmSync below.
  for (const [key, value] of [
    ["user.email", "praxis-test@example.com"],
    ["user.name", "Praxis Test"],
    ["commit.gpgsign", "false"],
  ] as const) {
    const cfg = spawnSync("git", ["config", "--local", key, value], {
      cwd: dir,
    });
    if (cfg.status !== 0) {
      rmSync(dir, { recursive: true, force: true });
      throw new Error(
        `git config --local ${key} failed in ${dir}: ${cfg.stderr?.toString() ?? "unknown"}`,
      );
    }
  }
  try {
    return await fn({ dir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
