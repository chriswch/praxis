import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withTempRepo } from "../support/tmp-repo.js";
import { runCli } from "../support/run-cli.js";

describe("praxis run (CLI surface)", () => {
  it("rejects empty intent without writing any run dir", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = runCli(["run", "   "], dir);
      expect(result.status).toBe(1);
      expect(result.stderr.trim().length).toBeGreaterThan(0);
      expect(existsSync(join(dir, ".praxis", "runs"))).toBe(false);
    });
  });

  it("rejects missing intent argument", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = runCli(["run"], dir);
      expect(result.status).toBe(1);
      expect(result.stderr.trim().length).toBeGreaterThan(0);
      expect(existsSync(join(dir, ".praxis", "runs"))).toBe(false);
    });
  });

  it("blocks pre-flight outside a git repo and emits no .praxis/", () => {
    const cwd = mkdtempSync(join(tmpdir(), "praxis-cli-nongit-"));
    try {
      const result = runCli(["run", "intent"], cwd);
      expect(result.status).toBe(1);
      expect(result.stderr.toLowerCase()).toMatch(/git/);
      expect(existsSync(join(cwd, ".praxis"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("blocks pre-flight on a dirty tree without --allow-dirty", async () => {
    await withTempRepo(async ({ dir }) => {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(dir, "dirty.txt"), "uncommitted\n", "utf8");
      const result = runCli(["run", "intent"], dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/dirty\.txt/);
      expect(result.stderr).toMatch(/--allow-dirty/);
      expect(existsSync(join(dir, ".praxis"))).toBe(false);
    });
  });

  it("rejects unknown flags (e.g. typo of --no-pause) before any disk write", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = runCli(["run", "--nopause", "x"], dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/unknown flag: --nopause/);
      expect(existsSync(join(dir, ".praxis"))).toBe(false);
    });
  });
});
