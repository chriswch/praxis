import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withTempRepo } from "../support/tmp-repo.js";
import { advanceWorkflow } from "../../src/workflow/runner.js";
import type { CreateQueryFn, Deps, SdkMessage } from "../../src/workflow/stage.js";
import type { PraxisConfig } from "../../src/config/schema.js";
import { LineReporter } from "../../src/ui/line-reporter.js";
import { RecordingReporter } from "../support/recording-reporter.js";
import {
  recordingScriptedQuery,
  scriptedQuery,
} from "../support/scripted-query.js";
import { writeState, type State } from "../../src/workflow/state.js";

/** Default fixed runId used by advance tests so paths are predictable. */
const RUN_ID = "2026-04-25-1430-7af2";

/** A two-stage no-validator config: first stage pauses, second runs to end. */
const TWO_STAGE_CONFIG: PraxisConfig = {
  version: 1,
  workflow: [
    {
      id: "first",
      systemPrompt: { file: "clarify-assess.md" },
      userPromptTemplate: "{{intent}}",
      outputArtifact: "first.md",
      pauseAfter: true,
    },
    {
      id: "second",
      systemPrompt: { file: "clarify-assess.md" },
      userPromptTemplate: "{{intent}}",
      outputArtifact: "second.md",
    },
  ],
};

function noopMessages(sessionId = "sess_x"): SdkMessage[] {
  return [
    { type: "system", subtype: "init", session_id: sessionId, model: "claude-test" },
    {
      type: "assistant",
      session_id: sessionId,
      message: { content: [{ type: "text", text: "ok" }] },
    },
    {
      type: "result",
      subtype: "success",
      stop_reason: "end_turn",
      total_cost_usd: 0.001,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      num_turns: 1,
      session_id: sessionId,
    },
  ];
}

/** Make a minimal completed StageState block for fixture state.json files. */
function completedStage(sessionId = "sess_prev") {
  return {
    status: "completed" as const,
    sessionId,
    stopReason: "end_turn",
    endedAt: "2026-04-25T14:31:00Z",
    tokens: { input: 100, output: 50, cacheRead: 0, cacheCreate: 0 },
    usd: 0.012,
  };
}

function failedStage(error = "validator_failed: missing H2") {
  return {
    status: "failed" as const,
    sessionId: "sess_failed",
    stopReason: "validator_failed",
    endedAt: "2026-04-25T14:31:00Z",
    tokens: { input: 100, output: 50, cacheRead: 0, cacheCreate: 0 },
    usd: 0.012,
    error,
  };
}

function cancelledStage() {
  return {
    status: "cancelled" as const,
    sessionId: "sess_cancelled",
    stopReason: "",
    endedAt: "2026-04-25T14:31:00Z",
    tokens: { input: 100, output: 50, cacheRead: 0, cacheCreate: 0 },
    usd: 0.012,
    error: "cancelled by user (SIGINT)",
  };
}

/** Set up a `.praxis/runs/<runId>/` with the given state.json + artifacts. */
function seedRun(
  cwd: string,
  state: State,
  artifacts: Record<string, string> = {},
): string {
  const runDir = join(cwd, ".praxis", "runs", state.runId);
  mkdirSync(runDir, { recursive: true });
  writeState(runDir, state);
  for (const [name, body] of Object.entries(artifacts)) {
    writeFileSync(join(runDir, name), body, "utf8");
  }
  return runDir;
}

function deps(
  createQueryFn: CreateQueryFn,
  reporter = new RecordingReporter(),
  date = new Date("2026-04-25T14:35:00Z"),
): Deps & { reporter: RecordingReporter } {
  return {
    clock: () => date,
    rng: (n) => new Uint8Array([0x00, 0x01]).slice(0, n),
    createQueryFn,
    reporter,
  };
}

describe("advanceWorkflow invalid statuses (AC-8, AC-9)", () => {
  it("AC-8: a pending current stage with no completed predecessor → exit 1", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state: State = {
        runId: RUN_ID,
        intent: "x",
        startedAt: "2026-04-25T14:30:12Z",
        currentStage: "first",
        cost: { totalTokens: 0, totalUsd: 0 },
        stages: {
          first: { status: "pending" },
          second: { status: "pending" },
        },
      };
      seedRun(cwd, state);
      const recording = scriptedQuery([]);
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd, config: TWO_STAGE_CONFIG },
        deps(recording),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason.toLowerCase()).toMatch(/not in a resumable state/);
    });
  });

  it("AC-8: a running current stage → exit 1, no side effects", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state: State = {
        runId: RUN_ID,
        intent: "x",
        startedAt: "2026-04-25T14:30:12Z",
        currentStage: "second",
        cost: { totalTokens: 100, totalUsd: 0.012 },
        stages: {
          first: completedStage(),
          second: { status: "running" },
        },
      };
      seedRun(cwd, state);
      const recording = scriptedQuery([]);
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd, config: TWO_STAGE_CONFIG },
        deps(recording),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason.toLowerCase()).toMatch(/not in a resumable state/);
    });
  });

  it("AC-9: every stage already completed → exit 1 'already complete'", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state: State = {
        runId: RUN_ID,
        intent: "x",
        startedAt: "2026-04-25T14:30:12Z",
        currentStage: "second",
        cost: { totalTokens: 200, totalUsd: 0.024 },
        stages: {
          first: completedStage("sess_a"),
          second: completedStage("sess_b"),
        },
      };
      seedRun(cwd, state);
      const recording = scriptedQuery([]);
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd, config: TWO_STAGE_CONFIG },
        deps(recording),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason.toLowerCase()).toMatch(/already complete/);
    });
  });

  it("AC-2 wired: missing state.json → exit 1", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd, config: TWO_STAGE_CONFIG },
        deps(scriptedQuery([])),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason).toMatch(/state\.json/);
    });
  });
});
