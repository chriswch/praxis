import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { withTempRepo } from "../support/tmp-repo.js";
import { runCli } from "../support/run-cli.js";

const RUN_ID_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}-[0-9a-f]{4}$/;

describe("praxis run (walking skeleton)", () => {
  it("writes intent and initial state.json for a valid intent", async () => {
    await withTempRepo(async ({ dir }) => {
      const intent = "add a logout button";
      const result = runCli(["run", intent], dir);

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);

      const runId = result.stdout.trim();
      expect(runId).toMatch(RUN_ID_RE);

      const runDir = join(dir, ".praxis", "runs", runId);
      expect(existsSync(runDir)).toBe(true);

      const intentPath = join(runDir, "00-intent.txt");
      const intentContents = readFileSync(intentPath, "utf8");
      expect(intentContents).toBe(intent);

      const statePath = join(runDir, "state.json");
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      expect(state.runId).toBe(runId);
      expect(state.intent).toBe(intent);
      expect(typeof state.startedAt).toBe("string");
      expect(state.currentStage).toBe("clarify-assess");
      expect(state.cost).toEqual({ totalTokens: 0, totalUsd: 0 });
      expect(Object.keys(state.stages).sort()).toEqual([
        "auto-commit",
        "clarify-assess",
        "implement",
      ]);
      for (const stageId of [
        "clarify-assess",
        "implement",
        "auto-commit",
      ] as const) {
        expect(state.stages[stageId]).toEqual({ status: "pending" });
      }
    });
  });

  it("produces distinct run-dirs across consecutive runs", async () => {
    await withTempRepo(async ({ dir }) => {
      const a = runCli(["run", "first intent"], dir);
      const b = runCli(["run", "second intent"], dir);
      expect(a.status).toBe(0);
      expect(b.status).toBe(0);
      const runIdA = a.stdout.trim();
      const runIdB = b.stdout.trim();
      expect(runIdA).not.toBe(runIdB);

      const runs = readdirSync(join(dir, ".praxis", "runs"));
      expect(runs.sort()).toEqual([runIdA, runIdB].sort());
    });
  });

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
});
