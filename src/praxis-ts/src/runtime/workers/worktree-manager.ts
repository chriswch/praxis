import { cp, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PreparedWorkspace = {
  workspace_root: string;
  workspace_origin: "git_worktree" | "snapshot";
};

export async function prepareIsolatedWorkspace(
  repoRoot: string,
  dispatchId: string
): Promise<PreparedWorkspace> {
  if (existsSync(join(repoRoot, ".git"))) {
    const worktreeRoot = await mkdtemp(join(tmpdir(), `praxis-${dispatchId}-worktree-`));
    try {
      await execFileAsync("git", ["worktree", "add", "--detach", worktreeRoot], {
        cwd: repoRoot
      });
      return {
        workspace_root: worktreeRoot,
        workspace_origin: "git_worktree"
      };
    } catch {
      await rm(worktreeRoot, { recursive: true, force: true });
    }
  }

  const snapshotRoot = await mkdtemp(join(tmpdir(), `praxis-${dispatchId}-snapshot-`));
  await cp(repoRoot, snapshotRoot, {
    recursive: true,
    filter: (source) => {
      const relativePath = relative(repoRoot, source).replace(/\\/g, "/");
      if (relativePath === "") {
        return true;
      }
      if (relativePath === ".git" || relativePath.startsWith(".git/")) {
        return false;
      }
      if (relativePath === "node_modules" || relativePath.startsWith("node_modules/")) {
        return false;
      }
      if (relativePath === ".praxis/worktrees" || relativePath.startsWith(".praxis/worktrees/")) {
        return false;
      }
      return true;
    }
  });

  return {
    workspace_root: snapshotRoot,
    workspace_origin: "snapshot"
  };
}
