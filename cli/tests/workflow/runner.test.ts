import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runWorkflow } from "../../src/workflow/runner.js";
import type { CreateQueryFn, Deps } from "../../src/workflow/stage.js";
import { withTempRepo } from "../support/tmp-repo.js";

const stubCreateQueryFn: CreateQueryFn = () => {
  throw new Error("createQueryFn should not be invoked here");
};

function pinnedDeps(date: Date, bytes: Uint8Array): Deps {
  return {
    clock: () => date,
    rng: (n) => bytes.slice(0, n),
    createQueryFn: stubCreateQueryFn,
  };
}

describe("runWorkflow", () => {
  it("derives the spec's sample run-id and exact startedAt from pinned deps", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const deps = pinnedDeps(
        new Date("2026-04-25T14:30:12Z"),
        new Uint8Array([0x7a, 0xf2]),
      );
      const result = await runWorkflow(
        { intent: "ship it", cwd, allowDirty: true },
        deps,
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      expect(result.runId).toBe("2026-04-25-1430-7af2");
      expect(result.runDir).toBe(
        join(cwd, ".praxis", "runs", "2026-04-25-1430-7af2"),
      );

      const state = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(state.runId).toBe("2026-04-25-1430-7af2");
      expect(state.intent).toBe("ship it");
      expect(state.startedAt).toBe("2026-04-25T14:30:12Z");
      expect(state.currentStage).toBe("clarify-assess");
      expect(state.cost).toEqual({ totalTokens: 0, totalUsd: 0 });
      expect(state.stages).toEqual({
        "clarify-assess": { status: "pending" },
        implement: { status: "pending" },
        "auto-commit": { status: "pending" },
      });
    });
  });

  it("writes 00-intent.txt verbatim with no trailing newline", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const deps = pinnedDeps(
        new Date("2026-04-25T14:30:12Z"),
        new Uint8Array([0x01, 0x02]),
      );
      const intent = "add a logout button";
      const result = await runWorkflow(
        { intent, cwd, allowDirty: true },
        deps,
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      const path = join(result.runDir, "00-intent.txt");
      expect(existsSync(path)).toBe(true);
      const raw = readFileSync(path);
      expect(raw.toString("utf8")).toBe(intent);
      expect(raw[raw.length - 1]).not.toBe(0x0a);
    });
  });

  it("truncates sub-second precision in startedAt", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const deps = pinnedDeps(
        new Date("2026-04-25T14:30:12.789Z"),
        new Uint8Array([0xaa, 0xbb]),
      );
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true },
        deps,
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
      const state = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(state.startedAt).toBe("2026-04-25T14:30:12Z");
    });
  });
});
