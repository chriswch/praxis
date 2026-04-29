import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTO_COMMIT_ID,
  CODE_IMPROVING_ID,
  CODE_REVIEWING_ID,
} from "../../src/config/defaults.js";
import type { PraxisConfig } from "../../src/config/schema.js";
import {
  advanceWorkflow,
  retryWorkflow,
} from "../../src/workflow/runner.js";
import type {
  CreateQueryFn,
  Deps,
  SdkMessage,
} from "../../src/workflow/stage.js";
import { type State, writeState } from "../../src/workflow/state.js";
import { RecordingReporter } from "../support/recording-reporter.js";
import { recordingScriptedQuery } from "../support/scripted-query.js";
import { withTempRepo } from "../support/tmp-repo.js";

/**
 * S-1 AC-5 — `advanceWorkflow` and `retryWorkflow` MUST read `baselineSha`
 * from `state.json` rather than re-shelling out to `git rev-parse HEAD`.
 *
 * The proof: seed `state.baselineSha` with a fixed-fake SHA that does NOT
 * match the temp repo's real HEAD, configure the resumed stage's user-prompt
 * template to expand `{{baselineSha}}`, and assert the captured
 * `initialUserPrompt` carries the fake. If the resume path silently shelled
 * out for HEAD, the prompt would carry the real (different) SHA instead.
 */

const RUN_ID = "2026-04-25-1430-7af2";
const FAKE_BASELINE = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

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

function failedCodeImproveStage() {
  return {
    status: "failed" as const,
    sessionId: "sess_improve_failed",
    stopReason: "validator_failed",
    endedAt: "2026-04-25T14:31:00Z",
    tokens: { input: 100, output: 50, cacheRead: 0, cacheCreate: 0 },
    usd: 0.012,
    error: "stage failed",
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

function deps(createQueryFn: CreateQueryFn): Deps {
  return {
    clock: () => new Date("2026-04-25T14:35:00Z"),
    rng: (n) => new Uint8Array([0x00, 0x01]).slice(0, n),
    createQueryFn,
    reporter: new RecordingReporter(),
    commit: () => ({ ok: true, skipped: true }),
  };
}

describe("advanceWorkflow uses state.baselineSha (AC-5)", () => {
  it("dispatched stage's user prompt carries state.baselineSha verbatim — no second git rev-parse", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Two-stage config: first paused, second's user prompt references
      // {{baselineSha}}. The default-seeded baseline commit gives the temp
      // repo a real HEAD that differs from FAKE_BASELINE.
      const config: PraxisConfig = {
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
            userPromptTemplate: "baseline={{baselineSha}}",
            outputArtifact: "second.md",
          },
        ],
      };

      const state: State = {
        runId: RUN_ID,
        intent: "ship it",
        startedAt: "2026-04-25T14:30:12Z",
        baselineSha: FAKE_BASELINE,
        currentStage: "second",
        cost: { totalTokens: 0, totalUsd: 0 },
        stages: {
          first: completedStage("sess_first"),
          second: { status: "pending" },
        },
      };
      seedRun(cwd, state, { "first.md": "x\n" });

      const recording = recordingScriptedQuery([
        [{ messages: noopMessages("sess_second") }],
      ]);
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd, config },
        deps(recording),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      expect(recording.calls.length).toBe(1);
      const initialUserPrompt = recording.calls[0].input.initialUserPrompt;
      expect(initialUserPrompt).toBe(`baseline=${FAKE_BASELINE}`);
    });
  });
});

describe("retryWorkflow uses state.baselineSha (AC-5)", () => {
  it("resumed code-improving stageContext carries state.baselineSha; retry's literal prompt is 'continue' but downstream auto-commit's prompt expands the fake", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Three-stage retry config: code-reviewing already completed (in state),
      // code-improving failed (will retry → succeed), auto-commit's user
      // prompt references {{baselineSha}} so we can read the resumed
      // baselineSha through the captured initialUserPrompt.
      const config: PraxisConfig = {
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
            userPromptTemplate: "baseline={{baselineSha}}",
            outputArtifact: "05-commit.txt",
          },
        ],
      };

      const state: State = {
        runId: RUN_ID,
        intent: "ship it",
        startedAt: "2026-04-25T14:30:12Z",
        baselineSha: FAKE_BASELINE,
        currentStage: CODE_IMPROVING_ID,
        cost: { totalTokens: 200, totalUsd: 0.012 },
        stages: {
          [CODE_REVIEWING_ID]: completedStage("sess_review"),
          [CODE_IMPROVING_ID]: failedCodeImproveStage(),
          [AUTO_COMMIT_ID]: { status: "pending" },
        },
      };
      seedRun(cwd, state, { "03-code-review.md": "## Decision\n\nproceed\n" });

      // Make the working tree dirty so auto-commit's clean-tree pre-skip does
      // NOT short-circuit the SDK call (which is what we want to inspect).
      writeFileSync(join(cwd, "edit.txt"), "from the run\n", "utf8");

      const recording = recordingScriptedQuery([
        // Retry of code-improving.
        [{ messages: noopMessages("sess_retry") }],
        // Auto-commit dispatch — its prompt is the one we inspect.
        [{ messages: noopMessages("sess_commit") }],
      ]);

      const result = await retryWorkflow(
        RUN_ID,
        { cwd, config },
        deps(recording),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      expect(recording.calls.length).toBe(2);
      // Retry's prompt is the literal "continue".
      expect(recording.calls[0].input.initialUserPrompt).toBe("continue");
      // Auto-commit's prompt expanded {{baselineSha}} from state, NOT from
      // a fresh git rev-parse HEAD.
      expect(recording.calls[1].input.initialUserPrompt).toBe(
        `baseline=${FAKE_BASELINE}`,
      );
    });
  });
});
