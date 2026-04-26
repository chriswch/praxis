import { describe, it, expect } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withTempRepo } from "../support/tmp-repo.js";
import {
  runPreflight,
  appendPraxisToGitignore,
} from "../../src/workflow/preflight.js";
import { runWorkflow } from "../../src/workflow/runner.js";
import { scriptedQuery } from "../support/scripted-query.js";
import type { Deps } from "../../src/workflow/stage.js";
import { LineReporter } from "../../src/ui/line-reporter.js";

function pinnedDeps(date: Date, bytes: Uint8Array): Deps {
  return {
    clock: () => date,
    rng: (n) => bytes.slice(0, n),
    createQueryFn: scriptedQuery([]),
    reporter: new LineReporter(),
  };
}

function withTmpDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "praxis-preflight-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("runPreflight", () => {
  it("blocks when cwd is not inside a git work tree (AC-1)", () => {
    withTmpDir((cwd) => {
      const result = runPreflight(cwd, { allowDirty: false });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason.toLowerCase()).toMatch(/git|repo/);
      }
    });
  });

  it("leaves no orphan .praxis/ when blocked on non-git (AC-12)", () => {
    withTmpDir((cwd) => {
      const result = runPreflight(cwd, { allowDirty: false });
      expect(result.ok).toBe(false);
      expect(existsSync(join(cwd, ".praxis"))).toBe(false);
    });
  });

  it("passes pre-flight on a clean git repo", async () => {
    await withTempRepo(({ dir }) => {
      const result = runPreflight(dir, { allowDirty: false });
      expect(result.ok).toBe(true);
    });
  });

  it("blocks a dirty tree without --allow-dirty (AC-2)", async () => {
    await withTempRepo(({ dir }) => {
      // Make the tree dirty.
      writeFileSync(join(dir, "dirty.txt"), "uncommitted\n", "utf8");
      const result = runPreflight(dir, { allowDirty: false });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/dirty.txt/);
        expect(result.remediation ?? "").toMatch(/--allow-dirty/);
      }
    });
  });

  it("lists multiple dirty paths in the failure reason", async () => {
    await withTempRepo(({ dir }) => {
      writeFileSync(join(dir, "a.txt"), "x", "utf8");
      writeFileSync(join(dir, "b.txt"), "y", "utf8");
      const result = runPreflight(dir, { allowDirty: false });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/a\.txt/);
        expect(result.reason).toMatch(/b\.txt/);
      }
    });
  });

  it("--allow-dirty overrides the dirty-tree block (AC-3 setup)", async () => {
    await withTempRepo(({ dir }) => {
      writeFileSync(join(dir, "dirty.txt"), "uncommitted\n", "utf8");
      const result = runPreflight(dir, { allowDirty: true });
      expect(result.ok).toBe(true);
    });
  });

  it("runWorkflow leaves no orphan .praxis/ when pre-flight fails (AC-12)", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "praxis-runner-orphan-"));
    try {
      const deps = pinnedDeps(
        new Date("2026-04-25T14:30:12Z"),
        new Uint8Array([0x7a, 0xf2]),
      );
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: false },
        deps,
      );
      expect(result.ok).toBe(false);
      expect(existsSync(join(cwd, ".praxis"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("appendPraxisToGitignore (AC-4)", () => {
  it("creates .gitignore with `.praxis/` plus trailing newline when missing", () => {
    withTmpDir((cwd) => {
      appendPraxisToGitignore(cwd);
      const path = join(cwd, ".gitignore");
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf8")).toBe(".praxis/\n");
    });
  });

  it("appends with no extra newline when existing file ends in `\\n`", () => {
    withTmpDir((cwd) => {
      const path = join(cwd, ".gitignore");
      writeFileSync(path, "node_modules\n", "utf8");
      appendPraxisToGitignore(cwd);
      expect(readFileSync(path, "utf8")).toBe("node_modules\n.praxis/\n");
    });
  });

  it("inserts a missing newline before appending when file lacks trailing `\\n`", () => {
    withTmpDir((cwd) => {
      const path = join(cwd, ".gitignore");
      writeFileSync(path, "node_modules", "utf8");
      appendPraxisToGitignore(cwd);
      expect(readFileSync(path, "utf8")).toBe("node_modules\n.praxis/\n");
    });
  });

  it("is idempotent — second invocation leaves the file untouched", () => {
    withTmpDir((cwd) => {
      const path = join(cwd, ".gitignore");
      writeFileSync(path, "node_modules\n", "utf8");
      appendPraxisToGitignore(cwd);
      const after1 = readFileSync(path, "utf8");
      appendPraxisToGitignore(cwd);
      const after2 = readFileSync(path, "utf8");
      expect(after2).toBe(after1);
    });
  });

  it("matches the entry by exact line — `.praxis/foo` does not satisfy", () => {
    withTmpDir((cwd) => {
      const path = join(cwd, ".gitignore");
      writeFileSync(path, ".praxis/foo\n", "utf8");
      appendPraxisToGitignore(cwd);
      expect(readFileSync(path, "utf8")).toBe(".praxis/foo\n.praxis/\n");
    });
  });

  it("treats an existing `.praxis/` line in the middle of the file as a hit", () => {
    withTmpDir((cwd) => {
      const path = join(cwd, ".gitignore");
      writeFileSync(path, "node_modules\n.praxis/\ndist\n", "utf8");
      appendPraxisToGitignore(cwd);
      expect(readFileSync(path, "utf8")).toBe(
        "node_modules\n.praxis/\ndist\n",
      );
    });
  });
});
