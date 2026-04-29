import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildInitialState,
  readState,
  writeState,
} from "../../src/workflow/state.js";

function withTmpDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "praxis-state-read-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("readState (AC-2 structural validation)", () => {
  it("returns ok:false with a reason when state.json is missing", () => {
    withTmpDir((dir) => {
      const result = readState(dir);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason).toMatch(/state\.json/);
    });
  });

  it("returns ok:false when state.json is not valid JSON", () => {
    withTmpDir((dir) => {
      writeFileSync(join(dir, "state.json"), "{ not json", "utf8");
      const result = readState(dir);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason.toLowerCase()).toMatch(/json|parse/);
    });
  });

  it("returns ok:false when required top-level fields are missing", () => {
    withTmpDir((dir) => {
      writeFileSync(
        join(dir, "state.json"),
        JSON.stringify({ runId: "x" }),
        "utf8",
      );
      const result = readState(dir);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason.toLowerCase()).toMatch(/missing|invalid|state/);
    });
  });

  it("returns ok:false when stages is not an object map", () => {
    withTmpDir((dir) => {
      writeFileSync(
        join(dir, "state.json"),
        JSON.stringify({
          runId: "r",
          intent: "i",
          startedAt: "2026-04-25T14:30:12Z",
          baselineSha: "0123456789abcdef0123456789abcdef01234567",
          currentStage: "a",
          cost: { totalTokens: 0, totalUsd: 0 },
          stages: "not a map",
        }),
        "utf8",
      );
      const result = readState(dir);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason.toLowerCase()).toMatch(/stages/);
    });
  });

  it("AC-2: returns ok:false naming baselineSha when the field is absent", () => {
    withTmpDir((dir) => {
      writeFileSync(
        join(dir, "state.json"),
        JSON.stringify({
          runId: "r",
          intent: "i",
          startedAt: "2026-04-25T14:30:12Z",
          currentStage: "a",
          cost: { totalTokens: 0, totalUsd: 0 },
          stages: { a: { status: "pending" } },
        }),
        "utf8",
      );
      const result = readState(dir);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason).toContain("baselineSha");
    });
  });

  it("AC-2: returns ok:false naming baselineSha when the field is non-string", () => {
    withTmpDir((dir) => {
      writeFileSync(
        join(dir, "state.json"),
        JSON.stringify({
          runId: "r",
          intent: "i",
          startedAt: "2026-04-25T14:30:12Z",
          baselineSha: 12345,
          currentStage: "a",
          cost: { totalTokens: 0, totalUsd: 0 },
          stages: { a: { status: "pending" } },
        }),
        "utf8",
      );
      const result = readState(dir);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason).toContain("baselineSha");
    });
  });

  it("returns ok:false when a stage entry has an unknown status string", () => {
    withTmpDir((dir) => {
      writeFileSync(
        join(dir, "state.json"),
        JSON.stringify({
          runId: "r",
          intent: "i",
          startedAt: "2026-04-25T14:30:12Z",
          baselineSha: "0123456789abcdef0123456789abcdef01234567",
          currentStage: "a",
          cost: { totalTokens: 0, totalUsd: 0 },
          stages: { a: { status: "weird" } },
        }),
        "utf8",
      );
      const result = readState(dir);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason.toLowerCase()).toMatch(/status/);
    });
  });

  it("returns ok:true with the parsed State when the file is well-formed", () => {
    withTmpDir((dir) => {
      const state = {
        runId: "2026-04-25-1430-7af2",
        intent: "ship it",
        startedAt: "2026-04-25T14:30:12Z",
        baselineSha: "0123456789abcdef0123456789abcdef01234567",
        currentStage: "implement",
        cost: { totalTokens: 150, totalUsd: 0.012 },
        stages: {
          "clarify-assess": {
            status: "completed",
            sessionId: "sess_x",
            tokens: { input: 100, output: 50, cacheRead: 0, cacheCreate: 0 },
            usd: 0.012,
            stopReason: "end_turn",
            endedAt: "2026-04-25T14:31:00Z",
          },
          implement: { status: "pending" },
          "auto-commit": { status: "pending" },
        },
      };
      writeFileSync(join(dir, "state.json"), JSON.stringify(state), "utf8");
      const result = readState(dir);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.reason);
      expect(result.state.runId).toBe("2026-04-25-1430-7af2");
      expect(result.state.stages["clarify-assess"].status).toBe("completed");
      expect(result.state.cost.totalTokens).toBe(150);
    });
  });
});

describe("buildInitialState round-trips baselineSha (AC-1)", () => {
  it("captures the input baselineSha verbatim and survives writeState → readState", () => {
    withTmpDir((dir) => {
      const sha = "abcdef0123456789abcdef0123456789abcdef01";
      const state = buildInitialState({
        runId: "2026-04-25-1430-7af2",
        intent: "ship it",
        startedAt: "2026-04-25T14:30:12Z",
        baselineSha: sha,
        stageIds: ["clarify-assess", "implement"],
        currentStage: "clarify-assess",
      });
      expect(state.baselineSha).toBe(sha);

      writeState(dir, state);
      const result = readState(dir);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.reason);
      expect(result.state.baselineSha).toBe(sha);
    });
  });
});
