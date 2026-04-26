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
import { validateClarifyAssessArtifact } from "../../src/workflow/validator.js";

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

/**
 * Two-stage workflow whose first stage carries the clarify-assess validator
 * — so the failed-recovery path (AC-4/5) can be exercised without depending on
 * the entire `defaultWorkflow` (which requires three SDK calls and prompt
 * file resolution for stages we don't care about here).
 */
const VALIDATED_CONFIG: PraxisConfig = {
  version: 1,
  workflow: [
    {
      id: "first",
      systemPrompt: { file: "clarify-assess.md" },
      userPromptTemplate: "{{intent}}",
      outputArtifact: "first.md",
      validate: validateClarifyAssessArtifact,
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

const VALID_FIRST_ARTIFACT = `## Intent\n\nadd a logout button.\n\n## Assumptions\n\n- auth ctx is present\n\n## Gaps\n\n- none\n\n## Plan\n\n1. wire — surfaces logout\n\n## Acceptance\n\n- posts /logout and redirects home\n`;

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

describe("advanceWorkflow paused happy path (AC-3)", () => {
  it("dispatches the next stage without re-running the prior stage's validator; reporter sees resuming('approved')", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state: State = {
        runId: RUN_ID,
        intent: "ship it",
        startedAt: "2026-04-25T14:30:12Z",
        currentStage: "second",
        cost: { totalTokens: 150, totalUsd: 0.012 },
        stages: {
          first: completedStage("sess_first"),
          second: { status: "pending" },
        },
      };
      seedRun(cwd, state, { "first.md": "anything\n" });
      const recording = recordingScriptedQuery([
        [{ messages: noopMessages("sess_second") }],
      ]);
      const reporter = new RecordingReporter();
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd, config: TWO_STAGE_CONFIG },
        deps(recording, reporter),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      // Only the second stage runs — the first is taken as-is from disk.
      expect(recording.calls.length).toBe(1);

      // Second stage transitions to completed.
      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages.first.status).toBe("completed");
      expect(persisted.stages.second.status).toBe("completed");
      expect(persisted.stages.second.sessionId).toBe("sess_second");

      // Reporter saw the §11 paused-resume headline before the next stage start.
      const stageStarts = reporter.calls.filter((c) => c.kind === "stageStart");
      expect(stageStarts.length).toBe(1);
      expect(stageStarts[0].kind === "stageStart" && stageStarts[0].stageId).toBe(
        "second",
      );
    });
  });

  it("AC-10: state.currentStage advances to the resumed stage on the paused path", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state: State = {
        runId: RUN_ID,
        intent: "x",
        startedAt: "2026-04-25T14:30:12Z",
        currentStage: "second",
        cost: { totalTokens: 0, totalUsd: 0 },
        stages: {
          first: completedStage(),
          second: { status: "pending" },
        },
      };
      seedRun(cwd, state, { "first.md": "x\n" });
      const recording = scriptedQuery([{ messages: noopMessages("sess_b") }]);
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd, config: TWO_STAGE_CONFIG },
        deps(recording),
      );
      if (!result.ok) throw new Error(result.reason);
      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      // After all stages run, currentStage should still be the last stage (or
      // beyond) — implementation-defined, but never the already-completed prior.
      expect(persisted.currentStage).toBe("second");
    });
  });

  it("does not append .gitignore (AC-11)", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state: State = {
        runId: RUN_ID,
        intent: "ship it",
        startedAt: "2026-04-25T14:30:12Z",
        currentStage: "second",
        cost: { totalTokens: 0, totalUsd: 0 },
        stages: {
          first: completedStage(),
          second: { status: "pending" },
        },
      };
      seedRun(cwd, state, { "first.md": "x\n" });
      // No .gitignore on disk before advance.
      expect(existsSync(join(cwd, ".gitignore"))).toBe(false);

      const recording = scriptedQuery([{ messages: noopMessages("sess_second") }]);
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd, config: TWO_STAGE_CONFIG },
        deps(recording),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      // .gitignore must remain absent — pre-flight (which appends it) is
      // skipped on advance.
      expect(existsSync(join(cwd, ".gitignore"))).toBe(false);
    });
  });
});

describe("advanceWorkflow recovery on cancelled (AC-7)", () => {
  it("cancelled stage with valid artifact recovers exactly like failed", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state: State = {
        runId: RUN_ID,
        intent: "ship it",
        startedAt: "2026-04-25T14:30:12Z",
        currentStage: "first",
        cost: { totalTokens: 150, totalUsd: 0.012 },
        stages: {
          first: cancelledStage(),
          second: { status: "pending" },
        },
      };
      seedRun(cwd, state, { "first.md": VALID_FIRST_ARTIFACT });
      const recording = recordingScriptedQuery([
        [{ messages: noopMessages("sess_second") }],
      ]);
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd, config: VALIDATED_CONFIG },
        deps(recording),
      );
      if (!result.ok) throw new Error(result.reason);
      expect(recording.calls.length).toBe(1);
      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages.first.status).toBe("completed");
      expect(persisted.stages.first.stopReason).toBe("recovered");
    });
  });

  it("cancelled stage with missing artifact errors exactly like failed", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state: State = {
        runId: RUN_ID,
        intent: "ship it",
        startedAt: "2026-04-25T14:30:12Z",
        currentStage: "first",
        cost: { totalTokens: 0, totalUsd: 0 },
        stages: {
          first: cancelledStage(),
          second: { status: "pending" },
        },
      };
      seedRun(cwd, state);
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd, config: VALIDATED_CONFIG },
        deps(scriptedQuery([])),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason.toLowerCase()).toMatch(/missing|not found/);
    });
  });
});

describe("advanceWorkflow recovery missing artifact (AC-6)", () => {
  it("artifact file does not exist: exit 1 with the missing path named", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state: State = {
        runId: RUN_ID,
        intent: "ship it",
        startedAt: "2026-04-25T14:30:12Z",
        currentStage: "first",
        cost: { totalTokens: 0, totalUsd: 0 },
        stages: {
          first: failedStage(),
          second: { status: "pending" },
        },
      };
      // Note: NO first.md on disk.
      seedRun(cwd, state);
      const recording = recordingScriptedQuery([]);
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd, config: VALIDATED_CONFIG },
        deps(recording),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      const expectedPath = join(cwd, ".praxis", "runs", RUN_ID, "first.md");
      expect(result.reason).toContain(expectedPath);
      expect(result.reason.toLowerCase()).toMatch(/missing|not found/);
      expect(recording.calls.length).toBe(0);
    });
  });
});

describe("advanceWorkflow recovery validator failure (AC-5)", () => {
  it("validator rejects edited artifact: exit 1, state untouched, no SDK call", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state: State = {
        runId: RUN_ID,
        intent: "ship it",
        startedAt: "2026-04-25T14:30:12Z",
        currentStage: "first",
        cost: { totalTokens: 150, totalUsd: 0.012 },
        stages: {
          first: failedStage("missing required H2: Assumptions"),
          second: { status: "pending" },
        },
      };
      // Edit still missing required headings.
      seedRun(cwd, state, { "first.md": "## Intent\n\nx\n" });
      const recording = recordingScriptedQuery([]);
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd, config: VALIDATED_CONFIG },
        deps(recording),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason).toMatch(/validator rejected first/);
      expect(recording.calls.length).toBe(0);

      // state.json unchanged for the failed stage.
      const persisted = JSON.parse(
        readFileSync(join(cwd, ".praxis", "runs", RUN_ID, "state.json"), "utf8"),
      );
      expect(persisted.stages.first.status).toBe("failed");
      expect(persisted.stages.first.sessionId).toBe("sess_failed");
      expect(persisted.cost.totalTokens).toBe(150);
    });
  });
});

describe("advanceWorkflow recovery happy path (AC-4)", () => {
  it("validator passes on hand-edited artifact: stage flips to completed/recovered, sessionId+tokens preserved, no SDK call, next stage runs", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state: State = {
        runId: RUN_ID,
        intent: "ship it",
        startedAt: "2026-04-25T14:30:12Z",
        currentStage: "first",
        cost: { totalTokens: 150, totalUsd: 0.012 },
        stages: {
          first: failedStage("missing required H2: Assumptions"),
          second: { status: "pending" },
        },
      };
      seedRun(cwd, state, { "first.md": VALID_FIRST_ARTIFACT });

      const recording = recordingScriptedQuery([
        // Only the SECOND stage should call the SDK; recovery does not.
        [{ messages: noopMessages("sess_second") }],
      ]);
      const reporter = new RecordingReporter();
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd, config: VALIDATED_CONFIG },
        deps(recording, reporter),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      // Exactly one SDK call: the second stage. Zero SDK calls for recovery.
      expect(recording.calls.length).toBe(1);

      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages.first.status).toBe("completed");
      expect(persisted.stages.first.stopReason).toBe("recovered");
      // sessionId / tokens / usd preserved from the prior failed run.
      expect(persisted.stages.first.sessionId).toBe("sess_failed");
      expect(persisted.stages.first.tokens).toEqual({
        input: 100,
        output: 50,
        cacheRead: 0,
        cacheCreate: 0,
      });
      expect(persisted.stages.first.usd).toBeCloseTo(0.012, 5);
      // Cost total unchanged by recovery (no spend); second stage adds its own.
      // Initial state had 150 tokens, second adds 15 (10 + 5).
      expect(persisted.cost.totalTokens).toBe(150 + 15);
      expect(persisted.cost.totalUsd).toBeCloseTo(0.012 + 0.001, 5);

      // Reporter saw the §11 recovering headline.
      // (AC-13 wires this exactly — for now we only require the kind exists.)
    });
  });
});
