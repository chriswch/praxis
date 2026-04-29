import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TempRepo = {
  dir: string;
};

export type WithTempRepoOptions = {
  /**
   * S-1: when true (default), seed a single baseline commit so `git rev-parse
   * HEAD` resolves immediately — most callers go on to invoke `runWorkflow`,
   * which now fails fast on empty repos (AC-4). Pass `false` for the handful
   * of tests that explicitly need a no-HEAD repo (e.g. the AC-4 failure test
   * itself, the `commit() empty tree` regression).
   */
  seedBaseline?: boolean;
};

/**
 * S-1 helper: create a single baseline commit in `cwd` so `git rev-parse HEAD`
 * resolves. Returns the 40-hex SHA. Used both internally by `withTempRepo` and
 * by tests that need to explicitly capture the baseline SHA.
 */
export function seedBaselineCommit(cwd: string): string {
  writeFileSync(join(cwd, ".praxis-baseline"), "baseline\n", "utf8");
  const add = spawnSync("git", ["add", ".praxis-baseline"], { cwd });
  if (add.status !== 0) {
    throw new Error(
      `git add failed in ${cwd}: ${add.stderr?.toString() ?? "unknown"}`,
    );
  }
  const ci = spawnSync("git", ["commit", "-m", "baseline"], { cwd });
  if (ci.status !== 0) {
    throw new Error(
      `git commit failed in ${cwd}: ${ci.stderr?.toString() ?? "unknown"}`,
    );
  }
  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
  });
  if (head.status !== 0) throw new Error(`rev-parse HEAD failed in ${cwd}`);
  return head.stdout.trim();
}

/**
 * Create a fresh temp directory, run `git init` inside it, hand it to `fn`,
 * then remove the directory regardless of outcome.
 *
 * S-1: by default seeds a single baseline commit so callers that subsequently
 * invoke `runWorkflow` (which fails fast on empty repos per AC-4) get a usable
 * HEAD. Pass `{ seedBaseline: false }` for the small set of tests that need
 * the bare no-HEAD shape.
 */
export async function withTempRepo<T>(
  fn: (repo: TempRepo) => Promise<T> | T,
  options?: WithTempRepoOptions,
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
  if (options?.seedBaseline !== false) {
    seedBaselineCommit(dir);
  }
  try {
    return await fn({ dir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
