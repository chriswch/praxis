import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { withTempRepo } from "../support/tmp-repo.js";
import { runCli } from "../support/run-cli.js";

describe("praxis advance (CLI surface, AC-1)", () => {
  it("rejects a missing run-id positional", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = runCli(["advance"], dir);
      expect(result.status).toBe(1);
      expect(result.stderr.toLowerCase()).toMatch(/run.?id|usage/);
      expect(existsSync(join(dir, ".praxis"))).toBe(false);
    });
  });

  it("rejects a malformed run-id (wrong shape)", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = runCli(["advance", "not-a-run-id"], dir);
      expect(result.status).toBe(1);
      expect(result.stderr.toLowerCase()).toMatch(/run.?id/);
      expect(existsSync(join(dir, ".praxis"))).toBe(false);
    });
  });

  it("rejects unknown flags before any disk read", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = runCli(
        ["advance", "--allow-dirty", "2026-04-25-1430-7af2"],
        dir,
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/unknown flag: --allow-dirty/);
      expect(existsSync(join(dir, ".praxis"))).toBe(false);
    });
  });

  it("rejects a typo of --no-pause", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = runCli(
        ["advance", "--nopause", "2026-04-25-1430-7af2"],
        dir,
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/unknown flag: --nopause/);
    });
  });
});
