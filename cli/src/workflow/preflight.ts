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
  options: PreflightOptions,
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

  if (!options.allowDirty) {
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
    const dirty = parseDirtyPaths(status.stdout);
    if (dirty.length > 0) {
      return {
        ok: false,
        reason:
          `working tree has uncommitted changes:\n  ${dirty.join("\n  ")}`,
        remediation:
          "Commit or stash these changes, or rerun with --allow-dirty (the auto-commit stage will then bundle them into this run's commit).",
      };
    }
  }

  return { ok: true };
}

/**
 * Parse `git status --porcelain` output into the dirty path list. Each line
 * is `XY <path>` (or `XY <path> -> <new>` for renames); we report the first
 * path so the user can find the file.
 */
function parseDirtyPaths(stdout: string): string[] {
  const out: string[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const path = line.slice(3);
    const arrow = path.indexOf(" -> ");
    out.push(arrow >= 0 ? path.slice(0, arrow) : path);
  }
  return out;
}

/**
 * Idempotently ensure `<cwd>/.gitignore` contains an exact `.praxis/` line.
 *
 * - Creates the file with `.praxis/\n` when it does not exist.
 * - Leaves the file untouched when an exact `.praxis/` line is already present
 *   anywhere in the file (matching is line-exact: `.praxis/foo` does not
 *   satisfy).
 * - Otherwise appends `.praxis/\n`, prefixing a `\n` first when the existing
 *   file does not end in one so the appended entry sits on its own line.
 */
export function appendPraxisToGitignore(cwd: string): void {
  const path = join(cwd, ".gitignore");
  if (!existsSync(path)) {
    writeFileSync(path, ".praxis/\n", "utf8");
    return;
  }
  const current = readFileSync(path, "utf8");
  if (current.split("\n").some((line) => line === ".praxis/")) return;
  const needsLeadingNewline = current.length > 0 && !current.endsWith("\n");
  writeFileSync(
    path,
    `${current}${needsLeadingNewline ? "\n" : ""}.praxis/\n`,
    "utf8",
  );
}
