import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTO_COMMIT_ID,
  CODE_IMPROVING_ID,
  CODE_REVIEWING_ID,
} from "../../src/config/defaults.js";
import type { PraxisConfig } from "../../src/config/schema.js";
import { retryWorkflow } from "../../src/workflow/runner.js";
import type {
  CreateQueryFn,
  Deps,
  SdkMessage,
} from "../../src/workflow/stage.js";
import { type State, writeState } from "../../src/workflow/state.js";
import { RecordingReporter } from "../support/recording-reporter.js";
import {
  hangingQuery,
  recordingScriptedQuery,
  scriptedQuery,
} from "../support/scripted-query.js";
import { withTempRepo } from "../support/tmp-repo.js";

const RUN_ID = "2026-04-25-1430-7af2";

/**
 * Two-stage config exercising only the (renamed) `code-improving` + `auto-commit`
 * pair, so retry tests don't need to seed earlier-stage artifacts. The
 * code-reviewing stage is included because retryWorkflow's resume-point scan
 * walks the whole workflow; we mark code-reviewing as completed in fixtures.
 */
const RETRY_CONFIG: PraxisConfig = {
  version: 1,
  workflow: [
    {
      id: CODE_REVIEWING_ID,
      systemPrompt: { file: "code-reviewing.md" },
      userPromptTemplate: "{{intent}}",
      outputArtifact: "03-code-review.md",
    },
    {
      id: CODE_IMPROVING_ID,
      systemPrompt: { file: "code-improving.md" },
      userPromptTemplate: "{{intent}}",
      outputArtifact: "04-code-improve.md",
    },
    {
      id: AUTO_COMMIT_ID,
      systemPrompt: { file: "auto-commit.md" },
      userPromptTemplate: "{{intent}}",
      outputArtifact: "05-commit.txt",
    },
  ],
};

function noopMessages(sessionId = "sess_x"): SdkMessage[] {
  return [
    {
      type: "system",
      subtype: "init",
      session_id: sessionId,
      model: "claude-test",
    },
    {
      type: "assistant",
      session_id: sessionId,
      message: { content: [{ type: "text", text: "improve summary" }] },
    },
    {
      type: "result",
      subtype: "success",
      stop_reason: "end_turn",
      total_cost_usd: 0.005,
      usage: {
        input_tokens: 30,
        output_tokens: 10,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      num_turns: 1,
      session_id: sessionId,
    },
  ];
}

function commitMessages(sessionId = "sess_commit"): SdkMessage[] {
  return [
    {
      type: "system",
      subtype: "init",
      session_id: sessionId,
      model: "claude-test",
    },
    {
      type: "assistant",
      session_id: sessionId,
      message: { content: [{ type: "text", text: "feat: x" }] },
    },
    {
      type: "result",
      subtype: "success",
      stop_reason: "end_turn",
      total_cost_usd: 0.001,
      usage: {
        input_tokens: 5,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      num_turns: 1,
      session_id: sessionId,
    },
  ];
}

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

function failedCodeImproveStage(
  opts: {
    sessionId?: string;
    retryAttempts?: number;
    tokens?: { input: number; output: number };
    usd?: number;
  } = {},
) {
  return {
    status: "failed" as const,
    sessionId: opts.sessionId ?? "sess_failed",
    stopReason: "validator_failed",
    endedAt: "2026-04-25T14:31:00Z",
    tokens: opts.tokens
      ? {
          input: opts.tokens.input,
          output: opts.tokens.output,
          cacheRead: 0,
          cacheCreate: 0,
        }
      : { input: 100, output: 50, cacheRead: 0, cacheCreate: 0 },
    usd: opts.usd ?? 0.012,
    error: "stage failed",
    ...(opts.retryAttempts !== undefined
      ? { retryAttempts: opts.retryAttempts }
      : {}),
  };
}

function cancelledCodeImproveStage(opts: { sessionId?: string } = {}) {
  return {
    status: "cancelled" as const,
    sessionId: opts.sessionId ?? "sess_cancelled",
    stopReason: "",
    endedAt: "2026-04-25T14:31:00Z",
    tokens: { input: 100, output: 50, cacheRead: 0, cacheCreate: 0 },
    usd: 0.012,
    error: "cancelled by user (SIGINT)",
  };
}

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
    commit: () => ({ ok: true, skipped: true }),
  };
}

function baseStateWithFailedCodeImproving(
  overrides: Partial<{
    sessionId: string;
    retryAttempts: number;
    tokens: { input: number; output: number };
    usd: number;
    priorTotalTokens: number;
    priorTotalUsd: number;
  }> = {},
): State {
  return {
    runId: RUN_ID,
    intent: "ship it",
    startedAt: "2026-04-25T14:30:12Z",
    baselineSha: "0123456789abcdef0123456789abcdef01234567",
    currentStage: CODE_IMPROVING_ID,
    cost: {
      totalTokens: overrides.priorTotalTokens ?? 300,
      totalUsd: overrides.priorTotalUsd ?? 0.024,
    },
    stages: {
      [CODE_REVIEWING_ID]: completedStage("sess_review"),
      [CODE_IMPROVING_ID]: failedCodeImproveStage({
        sessionId: overrides.sessionId,
        retryAttempts: overrides.retryAttempts,
        tokens: overrides.tokens,
        usd: overrides.usd,
      }),
      [AUTO_COMMIT_ID]: { status: "pending" },
    },
  };
}

describe("retryWorkflow happy path (AC-5)", () => {
  it("failed code-improving → resume + continue → completion → auto-commit runs", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state = baseStateWithFailedCodeImproving();
      seedRun(cwd, state, { "03-code-review.md": "review body\n" });
      const recording = recordingScriptedQuery([
        [{ messages: noopMessages("sess_retry") }],
        [{ messages: commitMessages("sess_commit") }],
      ]);
      const reporter = new RecordingReporter();
      const result = await retryWorkflow(
        RUN_ID,
        { cwd, config: RETRY_CONFIG },
        deps(recording, reporter),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      // Two SDK calls: code-improving retry, then auto-commit.
      expect(recording.calls.length).toBe(2);
      // First call (the retry) MUST set resume to the prior sessionId AND
      // initialUserPrompt to "continue".
      expect(recording.calls[0].input.resume).toBe("sess_failed");
      expect(recording.calls[0].input.initialUserPrompt).toBe("continue");

      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages[CODE_IMPROVING_ID].status).toBe("completed");
      // SessionId from the latest (retry) attempt wins.
      expect(persisted.stages[CODE_IMPROVING_ID].sessionId).toBe("sess_retry");
      expect(persisted.stages[CODE_IMPROVING_ID].retryAttempts).toBe(1);

      // S-006: reporter.resuming("retrying", runId, stageId, priorSessionId)
      // fires exactly once, between stageStart and the SDK dispatch.
      const resumingCalls = reporter.calls.flatMap((c) =>
        c.kind === "resuming" ? [c] : [],
      );
      expect(resumingCalls.length).toBe(1);
      expect(resumingCalls[0]).toMatchObject({
        resumingKind: "retrying",
        runId: RUN_ID,
        stageId: CODE_IMPROVING_ID,
        sessionId: "sess_failed",
      });
      // Ordering: stageStart for code-improving, then resuming, then stageEnd.
      const ciStageStartIdx = reporter.calls.findIndex(
        (c) => c.kind === "stageStart" && c.stageId === CODE_IMPROVING_ID,
      );
      const ciResumingIdx = reporter.calls.findIndex(
        (c) => c.kind === "resuming",
      );
      const ciStageEndIdx = reporter.calls.findIndex(
        (c) => c.kind === "stageEnd" && c.stageId === CODE_IMPROVING_ID,
      );
      expect(ciStageStartIdx).toBeGreaterThanOrEqual(0);
      expect(ciResumingIdx).toBeGreaterThan(ciStageStartIdx);
      expect(ciStageEndIdx).toBeGreaterThan(ciResumingIdx);
    });
  });
});

describe("retryWorkflow token + USD accumulation (AC-6)", () => {
  it("tokens and USD sum across attempts on per-stage entry; totals add the new spend", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state = baseStateWithFailedCodeImproving({
        priorTotalTokens: 300,
        priorTotalUsd: 0.024,
      });
      seedRun(cwd, state, { "03-code-review.md": "review body\n" });
      const recording = recordingScriptedQuery([
        [{ messages: noopMessages("sess_retry") }],
        [{ messages: commitMessages("sess_commit") }],
      ]);
      const result = await retryWorkflow(
        RUN_ID,
        { cwd, config: RETRY_CONFIG },
        deps(recording),
      );
      if (!result.ok) throw new Error(result.reason);

      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      // Per-stage tokens accumulated: 100 + 30 = 130 input, 50 + 10 = 60 output.
      expect(persisted.stages[CODE_IMPROVING_ID].tokens).toEqual({
        input: 130,
        output: 60,
        cacheRead: 0,
        cacheCreate: 0,
      });
      // Per-stage usd accumulated: 0.012 + 0.005.
      expect(persisted.stages[CODE_IMPROVING_ID].usd).toBeCloseTo(0.017, 5);
      // state.cost totals: prior 300 tokens + 30 + 10 (retry) + 5 + 5 (commit) = 350.
      expect(persisted.cost.totalTokens).toBe(350);
      // 0.024 + 0.005 (retry) + 0.001 (commit) = 0.030.
      expect(persisted.cost.totalUsd).toBeCloseTo(0.03, 5);
    });
  });
});

describe("retryWorkflow retryAttempts (AC-7)", () => {
  it("first call: undefined → 1", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state = baseStateWithFailedCodeImproving();
      seedRun(cwd, state, { "03-code-review.md": "review body\n" });
      const recording = recordingScriptedQuery([
        [{ messages: noopMessages("sess_retry") }],
        [{ messages: commitMessages("sess_commit") }],
      ]);
      await retryWorkflow(
        RUN_ID,
        { cwd, config: RETRY_CONFIG },
        deps(recording),
      );
      const persisted = JSON.parse(
        readFileSync(
          join(cwd, ".praxis", "runs", RUN_ID, "state.json"),
          "utf8",
        ),
      );
      expect(persisted.stages[CODE_IMPROVING_ID].retryAttempts).toBe(1);
    });
  });

  it("subsequent call: prior 2 → 3 even when this attempt fails again", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state = baseStateWithFailedCodeImproving({ retryAttempts: 2 });
      seedRun(cwd, state, { "03-code-review.md": "review body\n" });
      // SDK call returns immediately with a "result" carrying validator_failed-
      // style stop_reason but the stage has no validator, so this passes as
      // completed. To get a failure we cancel via SIGINT.
      const ctl = new AbortController();
      setTimeout(() => ctl.abort(), 20);
      // Use hangingQuery to trigger a SIGINT cancellation path — the retry
      // attempt fails, but retryAttempts must already be 3 because we
      // incremented BEFORE the runStage call.
      const result = await retryWorkflow(
        RUN_ID,
        { cwd, config: RETRY_CONFIG, signal: ctl.signal },
        deps(hangingQuery("sess_hang")),
      );
      expect(result.ok).toBe(false);
      const persisted = JSON.parse(
        readFileSync(
          join(cwd, ".praxis", "runs", RUN_ID, "state.json"),
          "utf8",
        ),
      );
      expect(persisted.stages[CODE_IMPROVING_ID].retryAttempts).toBe(3);
    });
  });
});

describe("retryWorkflow scope guard (AC-8)", () => {
  it("first non-completed stage is NOT code-improving → exit 1", async () => {
    const cfg: PraxisConfig = {
      version: 1,
      workflow: [
        {
          id: CODE_REVIEWING_ID,
          systemPrompt: { file: "code-reviewing.md" },
          userPromptTemplate: "{{intent}}",
          outputArtifact: "03-code-review.md",
        },
        {
          id: CODE_IMPROVING_ID,
          systemPrompt: { file: "code-improving.md" },
          userPromptTemplate: "{{intent}}",
          outputArtifact: "04-code-improve.md",
        },
      ],
    };
    await withTempRepo(async ({ dir: cwd }) => {
      const state: State = {
        runId: RUN_ID,
        intent: "x",
        startedAt: "2026-04-25T14:30:12Z",
        baselineSha: "0123456789abcdef0123456789abcdef01234567",
        currentStage: CODE_REVIEWING_ID,
        cost: { totalTokens: 0, totalUsd: 0 },
        stages: {
          [CODE_REVIEWING_ID]: {
            status: "failed",
            sessionId: "sess_x",
            error: "validator_failed",
          },
          [CODE_IMPROVING_ID]: { status: "pending" },
        },
      };
      seedRun(cwd, state);
      const recording = recordingScriptedQuery([]);
      const result = await retryWorkflow(
        RUN_ID,
        { cwd, config: cfg },
        deps(recording),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason.toLowerCase()).toMatch(
        /retry only supports code-improving/,
      );
      expect(recording.calls.length).toBe(0);
    });
  });
});

describe("retryWorkflow session_unresumable (AC-9)", () => {
  it("sessionId empty → exit 1, stage stopReason flips to session_unresumable", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state = baseStateWithFailedCodeImproving({ sessionId: "" });
      seedRun(cwd, state, { "03-code-review.md": "review body\n" });
      const recording = recordingScriptedQuery([]);
      const reporter = new RecordingReporter();
      const result = await retryWorkflow(
        RUN_ID,
        { cwd, config: RETRY_CONFIG },
        deps(recording, reporter),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      // The user-facing reason mentions "session is unresumable"; the
      // persisted stopReason is the snake_case sentinel (asserted below).
      expect(result.reason.toLowerCase()).toMatch(/unresumable/);
      expect(recording.calls.length).toBe(0);

      const persisted = JSON.parse(
        readFileSync(
          join(cwd, ".praxis", "runs", RUN_ID, "state.json"),
          "utf8",
        ),
      );
      expect(persisted.stages[CODE_IMPROVING_ID].stopReason).toBe(
        "session_unresumable",
      );

      // runDone fired exactly once with status=failed.
      const runDone = reporter.calls.filter((c) => c.kind === "runDone");
      expect(runDone.length).toBe(1);
      expect(runDone[0].kind === "runDone" && runDone[0].summary.status).toBe(
        "failed",
      );
    });
  });
});

describe("retryWorkflow mid-stream unresumable (AC-10)", () => {
  it("SDK signals unresumable mid-stream (no result message) → failed/session_unresumable", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state = baseStateWithFailedCodeImproving();
      seedRun(cwd, state, { "03-code-review.md": "review body\n" });
      // Stream emits an init message and ends — no result message → no
      // tokens, no finalText. retryWorkflow detects this as a session
      // unresumable failure.
      const unresumable: CreateQueryFn = () => ({
        pushUserMessage() {},
        stream: (async function* () {
          // Empty stream — no init, no assistant, no result.
        })(),
      });
      const reporter = new RecordingReporter();
      const result = await retryWorkflow(
        RUN_ID,
        { cwd, config: RETRY_CONFIG },
        deps(unresumable, reporter),
      );
      expect(result.ok).toBe(false);
      const persisted = JSON.parse(
        readFileSync(
          join(cwd, ".praxis", "runs", RUN_ID, "state.json"),
          "utf8",
        ),
      );
      expect(persisted.stages[CODE_IMPROVING_ID].status).toBe("failed");
      expect(persisted.stages[CODE_IMPROVING_ID].stopReason).toBe(
        "session_unresumable",
      );
      // retryAttempts still incremented.
      expect(persisted.stages[CODE_IMPROVING_ID].retryAttempts).toBe(1);

      const runDone = reporter.calls.filter((c) => c.kind === "runDone");
      expect(runDone.length).toBe(1);
    });
  });
});

describe("retryWorkflow already complete (AC-11)", () => {
  it("every stage completed → exit 1", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state: State = {
        runId: RUN_ID,
        intent: "x",
        startedAt: "2026-04-25T14:30:12Z",
        baselineSha: "0123456789abcdef0123456789abcdef01234567",
        currentStage: AUTO_COMMIT_ID,
        cost: { totalTokens: 0, totalUsd: 0 },
        stages: {
          [CODE_REVIEWING_ID]: completedStage("a"),
          [CODE_IMPROVING_ID]: completedStage("b"),
          [AUTO_COMMIT_ID]: completedStage("c"),
        },
      };
      seedRun(cwd, state);
      const result = await retryWorkflow(
        RUN_ID,
        { cwd, config: RETRY_CONFIG },
        deps(scriptedQuery([])),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason.toLowerCase()).toMatch(/already complete/);
    });
  });
});

describe("retryWorkflow retryable status guard (AC-12)", () => {
  it("code-improving status=running → exit 1", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state: State = {
        runId: RUN_ID,
        intent: "x",
        startedAt: "2026-04-25T14:30:12Z",
        baselineSha: "0123456789abcdef0123456789abcdef01234567",
        currentStage: CODE_IMPROVING_ID,
        cost: { totalTokens: 0, totalUsd: 0 },
        stages: {
          [CODE_REVIEWING_ID]: completedStage("a"),
          [CODE_IMPROVING_ID]: { status: "running" },
          [AUTO_COMMIT_ID]: { status: "pending" },
        },
      };
      seedRun(cwd, state);
      const recording = recordingScriptedQuery([]);
      const result = await retryWorkflow(
        RUN_ID,
        { cwd, config: RETRY_CONFIG },
        deps(recording),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason.toLowerCase()).toMatch(
        /not in a retryable state.*running/,
      );
      expect(recording.calls.length).toBe(0);
    });
  });

  it("cancelled code-improving is retryable", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state: State = {
        runId: RUN_ID,
        intent: "x",
        startedAt: "2026-04-25T14:30:12Z",
        baselineSha: "0123456789abcdef0123456789abcdef01234567",
        currentStage: CODE_IMPROVING_ID,
        cost: { totalTokens: 300, totalUsd: 0.024 },
        stages: {
          [CODE_REVIEWING_ID]: completedStage("sess_review"),
          [CODE_IMPROVING_ID]: cancelledCodeImproveStage({
            sessionId: "sess_failed",
          }),
          [AUTO_COMMIT_ID]: { status: "pending" },
        },
      };
      seedRun(cwd, state, { "03-code-review.md": "review body\n" });
      const recording = recordingScriptedQuery([
        [{ messages: noopMessages("sess_retry") }],
        [{ messages: commitMessages("sess_commit") }],
      ]);
      const result = await retryWorkflow(
        RUN_ID,
        { cwd, config: RETRY_CONFIG },
        deps(recording),
      );
      if (!result.ok) throw new Error(result.reason);
      expect(recording.calls.length).toBe(2);
      expect(recording.calls[0].input.resume).toBe("sess_failed");
    });
  });
});
