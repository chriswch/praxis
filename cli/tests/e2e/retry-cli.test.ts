import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../support/run-cli.js";
import { withTempRepo } from "../support/tmp-repo.js";

describe("praxis retry (CLI surface, AC-1)", () => {
  it("rejects a missing run-id positional", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = runCli(["retry"], dir);
      expect(result.status).toBe(1);
      expect(result.stderr.toLowerCase()).toMatch(/run.?id|usage/);
      expect(existsSync(join(dir, ".praxis"))).toBe(false);
    });
  });

  it("AC-2: rejects a malformed run-id (wrong shape)", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = runCli(["retry", "not-a-run-id"], dir);
      expect(result.status).toBe(1);
      expect(result.stderr.toLowerCase()).toMatch(/run.?id/);
      expect(existsSync(join(dir, ".praxis"))).toBe(false);
    });
  });

  it("AC-3: rejects unknown flags before any disk read", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = runCli(
        ["retry", "--allow-dirty", "2026-04-25-1430-7af2"],
        dir,
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/unknown flag: --allow-dirty/);
      expect(existsSync(join(dir, ".praxis"))).toBe(false);
    });
  });

  it("AC-3: rejects a typo of --no-pause", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = runCli(
        ["retry", "--nopause", "2026-04-25-1430-7af2"],
        dir,
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/unknown flag: --nopause/);
    });
  });

  it("AC-4: missing state.json → exit 1 with state.json in the message", async () => {
    await withTempRepo(async ({ dir }) => {
      const runId = "2026-04-25-1430-7af2";
      // No .praxis/runs/<runId> directory exists.
      const result = runCli(["retry", runId], dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/state\.json/);
    });
  });
});
