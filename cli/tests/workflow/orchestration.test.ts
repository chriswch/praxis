import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStage } from "../../src/workflow/stage.js";
import type { SdkMessage, StageContext } from "../../src/workflow/stage.js";
import { defaultWorkflow } from "../../src/config/defaults.js";
import { LineReporter } from "../../src/ui/line-reporter.js";
import { recordingScriptedQuery } from "../support/scripted-query.js";

function withTmpDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "praxis-orchestration-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const clarifyArtifact = `## Intent\n\nadd a logout button.\n\n## Assumptions\n\n- auth ctx is present\n\n## Gaps\n\n- none\n\n## Plan\n\n1. wire — surfaces logout\n\n## Acceptance\n\n- posts /logout and redirects home\n`;

function clarifyAssessConfig() {
  const cfg = defaultWorkflow.workflow.find((s) => s.id === "clarify-assess");
  if (!cfg) throw new Error("clarify-assess stage not in default workflow");
  return cfg;
}

function makeCtx(runDir: string): StageContext {
  return {
    intent: "add a logout button",
    runDir,
    runId: "2026-04-25-1430-7af2",
    reporter: new LineReporter(),
    signal: new AbortController().signal,
    artifactPaths: {},
  };
}

function happyPathScript(): SdkMessage[] {
  return [
    {
      type: "system",
      subtype: "init",
      session_id: "sess_happy",
      model: "claude-opus-4-7",
    },
    {
      type: "assistant",
      session_id: "sess_happy",
      message: {
        content: [{ type: "text", text: clarifyArtifact }],
      },
    },
    {
      type: "result",
      subtype: "success",
      stop_reason: "end_turn",
      total_cost_usd: 0.012,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      num_turns: 1,
      session_id: "sess_happy",
    },
  ];
}

describe("runStage createQueryFn wiring (AC-9)", () => {
  it("forwards model, settingSources, permissionMode, allowedTools, system+user prompts", async () => {
    await withTmpDir(async (runDir) => {
      const recording = recordingScriptedQuery([
        [{ messages: happyPathScript() }],
      ]);
      const cfg = clarifyAssessConfig();
      await runStage(cfg, makeCtx(runDir), { createQueryFn: recording });

      expect(recording.calls.length).toBe(1);
      const input = recording.calls[0].input;
      expect(input.model).toBe("claude-opus-4-7");
      expect(input.settingSources).toEqual(["user", "project"]);
      expect(input.permissionMode).toBe("default");
      expect([...(input.allowedTools ?? [])].sort()).toEqual(
        ["Bash", "Glob", "Grep", "Read"].sort(),
      );
      // System prompt is loaded from src/config/prompts/clarify-assess.md.
      expect(input.systemPrompt).toMatch(/clarify-assess/i);
      // User prompt is interpolated.
      expect(input.initialUserPrompt).toContain("add a logout button");
      expect(input.initialUserPrompt).toContain(runDir);
    });
  });
});

describe("runStage happy path (AC-5 in-process)", () => {
  it("returns finalText, sessionId, tokens, usd from one Stop", async () => {
    await withTmpDir(async (runDir) => {
      const recording = recordingScriptedQuery([
        [{ messages: happyPathScript() }],
      ]);
      const result = await runStage(
        clarifyAssessConfig(),
        makeCtx(runDir),
        { createQueryFn: recording },
      );
      expect(result.finalText).toBe(clarifyArtifact);
      expect(result.sessionId).toBe("sess_happy");
      expect(result.stopReason).toBe("end_turn");
      expect(result.tokens).toEqual({
        input: 100,
        output: 50,
        cacheRead: 0,
        cacheCreate: 0,
      });
      expect(result.usd).toBeCloseTo(0.012, 5);
      expect(recording.calls[0].pushedUserMessages).toEqual([]);
    });
  });
});

describe("runStage validator retry (AC-6)", () => {
  it("first failure → corrective retry → success; sessionId is retry's; tokens summed", async () => {
    await withTmpDir(async (runDir) => {
      const badArtifact = "## Intent\n\nfoo\n\n(no other sections)\n";

      const firstAttempt: SdkMessage[] = [
        {
          type: "system",
          subtype: "init",
          session_id: "sess_first",
          model: "claude-opus-4-7",
        },
        {
          type: "assistant",
          session_id: "sess_first",
          message: { content: [{ type: "text", text: badArtifact }] },
        },
        {
          type: "result",
          subtype: "success",
          stop_reason: "end_turn",
          total_cost_usd: 0.005,
          usage: {
            input_tokens: 60,
            output_tokens: 20,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
          num_turns: 1,
          session_id: "sess_first",
        },
      ];
      const retryAttempt: SdkMessage[] = [
        {
          type: "assistant",
          session_id: "sess_retry",
          message: { content: [{ type: "text", text: clarifyArtifact }] },
        },
        {
          type: "result",
          subtype: "success",
          stop_reason: "end_turn",
          total_cost_usd: 0.007,
          usage: {
            input_tokens: 80,
            output_tokens: 30,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
          num_turns: 2,
          session_id: "sess_retry",
        },
      ];

      const recording = recordingScriptedQuery([
        [{ messages: firstAttempt }, { messages: retryAttempt }],
      ]);
      const result = await runStage(
        clarifyAssessConfig(),
        makeCtx(runDir),
        { createQueryFn: recording },
      );

      expect(result.finalText).toBe(clarifyArtifact);
      expect(result.sessionId).toBe("sess_retry");
      expect(result.stopReason).toBe("end_turn");
      expect(result.tokens).toEqual({
        input: 60 + 80,
        output: 20 + 30,
        cacheRead: 0,
        cacheCreate: 0,
      });
      expect(result.usd).toBeCloseTo(0.012, 5);
      expect(recording.calls[0].pushedUserMessages.length).toBe(1);
      expect(recording.calls[0].pushedUserMessages[0]).toMatch(
        /did not match the required schema/,
      );
    });
  });
});

describe("runStage validator terminal failure (AC-7)", () => {
  it("second validator failure is terminal; finalText is partial; stopReason='validator_failed'", async () => {
    await withTmpDir(async (runDir) => {
      const badArtifact = "## Intent\n\nfoo\n";

      const firstAttempt: SdkMessage[] = [
        {
          type: "system",
          subtype: "init",
          session_id: "sess_first",
          model: "claude-opus-4-7",
        },
        {
          type: "assistant",
          session_id: "sess_first",
          message: { content: [{ type: "text", text: badArtifact }] },
        },
        {
          type: "result",
          subtype: "success",
          stop_reason: "end_turn",
          total_cost_usd: 0.005,
          usage: {
            input_tokens: 60,
            output_tokens: 20,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
          num_turns: 1,
          session_id: "sess_first",
        },
      ];
      const retryAttempt: SdkMessage[] = [
        {
          type: "assistant",
          session_id: "sess_retry",
          message: { content: [{ type: "text", text: badArtifact }] },
        },
        {
          type: "result",
          subtype: "success",
          stop_reason: "end_turn",
          total_cost_usd: 0.004,
          usage: {
            input_tokens: 40,
            output_tokens: 15,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
          num_turns: 2,
          session_id: "sess_retry",
        },
      ];

      const recording = recordingScriptedQuery([
        [{ messages: firstAttempt }, { messages: retryAttempt }],
      ]);
      const result = await runStage(
        clarifyAssessConfig(),
        makeCtx(runDir),
        { createQueryFn: recording },
      );

      expect(result.stopReason).toBe("validator_failed");
      expect(result.finalText).toBe(badArtifact);
      expect(result.sessionId).toBe("sess_retry");
      expect(recording.calls[0].pushedUserMessages.length).toBe(1);
    });
  });
});
