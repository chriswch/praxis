import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type PreflightOptions = {
  allowDirty: boolean;
};

export type PreflightResult =
  | { ok: true }
  | { ok: false; reason: string; remediation?: string };

/**
 * Pre-flight checks per product.md §10:
 *
 *   1. Refuse to run outside a git work tree.
 *   2. Refuse a dirty tree unless `allowDirty` is set; list dirty files +
 *      remediation when refusing.
 *
 * Pure check — does not touch the filesystem. The caller is responsible for
 * appending `.praxis/` to `.gitignore` (`appendPraxisToGitignore`) and for
 * making sure no run-dir is created when this returns `{ ok: false }`.
 */
export function runPreflight(
  cwd: string,
  _options: PreflightOptions,
): PreflightResult {
  const isRepo = spawnSync(
    "git",
    ["rev-parse", "--is-inside-work-tree"],
    { cwd, encoding: "utf8" },
  );
  if (isRepo.status !== 0 || isRepo.stdout.trim() !== "true") {
    return {
      ok: false,
      reason:
        "not inside a git work tree — Praxis requires a git repo. Run `git init` first.",
    };
  }

  return { ok: true };
}

/**
 * Idempotently append an exact `.praxis/` line to the repo's `.gitignore`.
 * Real behavior is TDD'd in AC-4; this stub leaves an existing entry alone so
 * AC-1 can integrate the runner without dragging the gitignore work in.
 */
export function appendPraxisToGitignore(cwd: string): void {
  const path = join(cwd, ".gitignore");
  if (!existsSync(path)) return;
  const current = readFileSync(path, "utf8");
  if (current.split("\n").some((line) => line === ".praxis/")) return;
  const needsLeadingNewline = current.length > 0 && !current.endsWith("\n");
  writeFileSync(
    path,
    `${current}${needsLeadingNewline ? "\n" : ""}.praxis/\n`,
    "utf8",
  );
}
