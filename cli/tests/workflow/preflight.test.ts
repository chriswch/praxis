import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withTempRepo } from "../support/tmp-repo.js";
import { runPreflight } from "../../src/workflow/preflight.js";
import { runWorkflow } from "../../src/workflow/runner.js";
import { scriptedQuery } from "../support/scripted-query.js";
import type { Deps } from "../../src/workflow/stage.js";

function pinnedDeps(date: Date, bytes: Uint8Array): Deps {
  return {
    clock: () => date,
    rng: (n) => bytes.slice(0, n),
    createQueryFn: scriptedQuery([]),
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
