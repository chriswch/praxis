import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

  it("AC-2 wired through CLI: missing state.json → exit 1 with state.json in the message", async () => {
    await withTempRepo(async ({ dir }) => {
      const runId = "2026-04-25-1430-7af2";
      // No .praxis/runs/<runId> directory exists.
      const result = runCli(["advance", runId], dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/state\.json/);
    });
  });

  it("AC-9 wired through CLI: already-complete run → exit 1 with the canonical message", async () => {
    await withTempRepo(async ({ dir }) => {
      const runId = "2026-04-25-1430-7af2";
      const runDir = join(dir, ".praxis", "runs", runId);
      mkdirSync(runDir, { recursive: true });
      const stage = (sessionId: string) => ({
        status: "completed",
        sessionId,
        stopReason: "end_turn",
        endedAt: "2026-04-25T14:31:00Z",
        tokens: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
        usd: 0,
      });
      const state = {
        runId,
        intent: "x",
        startedAt: "2026-04-25T14:30:12Z",
        currentStage: "auto-commit",
        cost: { totalTokens: 0, totalUsd: 0 },
        stages: {
          "clarify-assess": stage("a"),
          implement: stage("b"),
          "auto-commit": stage("c"),
        },
      };
      writeFileSync(
        join(runDir, "state.json"),
        JSON.stringify(state, null, 2) + "\n",
        "utf8",
      );
      const result = runCli(["advance", runId], dir);
      expect(result.status).toBe(1);
      expect(result.stderr.toLowerCase()).toMatch(/already complete/);
    });
  });
});
