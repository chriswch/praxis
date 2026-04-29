import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultWorkflow } from "../../src/config/defaults.js";
import { LineReporter } from "../../src/ui/line-reporter.js";
import { runWorkflow } from "../../src/workflow/runner.js";
import type {
  CreateQueryFn,
  Deps,
  SdkMessage,
  StageContext,
} from "../../src/workflow/stage.js";
import { runStage } from "../../src/workflow/stage.js";
import { recordingScriptedQuery } from "../support/scripted-query.js";
import { withTempRepo } from "../support/tmp-repo.js";

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
      await runStage(cfg, makeCtx(runDir), {
        createQueryFn: recording,
        reporter: new LineReporter(),
      });

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
      const result = await runStage(clarifyAssessConfig(), makeCtx(runDir), {
        createQueryFn: recording,
        reporter: new LineReporter(),
      });
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
      const result = await runStage(clarifyAssessConfig(), makeCtx(runDir), {
        createQueryFn: recording,
        reporter: new LineReporter(),
      });

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

function deps(
  createQueryFn: CreateQueryFn,
  date: Date,
  bytes: Uint8Array,
): Deps {
  return {
    clock: () => date,
    rng: (n) => bytes.slice(0, n),
    createQueryFn,
    reporter: new LineReporter(),
    // S-005: orchestration tests stop after clarify-assess pauses, so the
    // commit seam is never invoked — but include it for shape completeness.
    commit: () => ({ ok: true, skipped: true }),
  };
}

describe("runWorkflow clarify-assess happy path (AC-5 + AC-8)", () => {
  it("writes artifact verbatim, marks clarify-assess completed, pauses without running implement/auto-commit", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const recording = recordingScriptedQuery([
        [{ messages: happyPathScript() }],
      ]);
      const result = await runWorkflow(
        { intent: "add a logout button", cwd, allowDirty: true },
        deps(
          recording,
          new Date("2026-04-25T14:30:12Z"),
          new Uint8Array([0x7a, 0xf2]),
        ),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      // Artifact written verbatim.
      const artifactPath = join(result.runDir, "01-clarify-assess.md");
      expect(readFileSync(artifactPath, "utf8")).toBe(clarifyArtifact);

      // state.json reflects completed for clarify-assess + pending for the rest.
      const state = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(state.stages["clarify-assess"].status).toBe("completed");
      expect(state.stages["clarify-assess"].sessionId).toBe("sess_happy");
      expect(state.stages["clarify-assess"].stopReason).toBe("end_turn");
      expect(state.stages["clarify-assess"].tokens).toEqual({
        input: 100,
        output: 50,
        cacheRead: 0,
        cacheCreate: 0,
      });
      expect(state.stages["clarify-assess"].usd).toBeCloseTo(0.012, 5);
      // S-2 AC-6: paused after clarify-assess, the next stage is now
      // sketching-design.
      expect(state.stages["sketching-design"].status).toBe("pending");
      expect(state.stages["driving-tdd"].status).toBe("pending");
      expect(state.stages["auto-commit"].status).toBe("pending");
      expect(state.cost.totalTokens).toBe(150); // input + output only
      expect(state.cost.totalUsd).toBeCloseTo(0.012, 5);
      expect(state.currentStage).toBe("sketching-design");

      // sketching-design / implement / auto-commit NOT executed:
      // createQueryFn called exactly once.
      expect(recording.calls.length).toBe(1);

      // Pause hint surfaced.
      expect(result.paused).toBe(true);
      expect(result.pausedStageId).toBe("clarify-assess");
      expect(result.artifactPath).toBe(artifactPath);

      // Sketching-design / driving-tdd / auto-commit artifacts not written.
      expect(existsSync(join(result.runDir, "02-sketching-design.md"))).toBe(
        false,
      );
      expect(existsSync(join(result.runDir, "03-driving-tdd.md"))).toBe(false);
      // S-4: auto-commit artifact bumped 06 → 07.
      expect(existsSync(join(result.runDir, "07-commit.txt"))).toBe(false);
    });
  });
});

// S-2 AC-6 + S-4 AC-10: pause-after-clarify; `praxis advance` resumes into
// sketching-design (now stage 2 of 7), and the reporter's stageStart for
// that resume carries (index=2, total=7) so the line reads
// `[2/7 sketching-design] starting…`.
describe("S-2 AC-6 + S-4 AC-10: pause-after-clarify advances into sketching-design", () => {
  it("paused run + advance dispatches sketching-design as stage 2/7 (regression: now /7 after S-4 inserted verifying-and-adapting)", async () => {
    const { advanceWorkflow } = await import("../../src/workflow/runner.js");
    const { RecordingReporter } = await import(
      "../support/recording-reporter.js"
    );
    await withTempRepo(async ({ dir: cwd }) => {
      // First leg: paused after clarify-assess.
      const recording1 = recordingScriptedQuery([
        [{ messages: happyPathScript() }],
      ]);
      const reporter1 = new RecordingReporter();
      const first = await runWorkflow(
        { intent: "add a logout button", cwd, allowDirty: true },
        {
          ...deps(
            recording1,
            new Date("2026-04-25T14:30:12Z"),
            new Uint8Array([0x7a, 0xf2]),
          ),
          reporter: reporter1,
        },
      );
      if (!first.ok) throw new Error(first.reason);
      expect(first.paused).toBe(true);
      expect(first.pausedStageId).toBe("clarify-assess");

      // Second leg: advance. Script just sketching-design (it hands off to
      // implement, but implement times out below — easier to short-circuit
      // by also scripting only sketching-design + capturing the reporter
      // call before the next stage dispatches).
      const sketchText = "## Sketch\n\n- direction\n";
      const recording2 = recordingScriptedQuery([
        [
          {
            messages: [
              {
                type: "system",
                subtype: "init",
                session_id: "sess_sketch",
                model: "claude-opus-4-7",
              },
              {
                type: "assistant",
                session_id: "sess_sketch",
                message: { content: [{ type: "text", text: sketchText }] },
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
                session_id: "sess_sketch",
              },
            ],
          },
        ],
      ]);
      const reporter2 = new RecordingReporter();
      // advanceWorkflow continues through every remaining stage on noPause:
      // we don't care about the downstream — assert just that sketching-
      // design got the (2, 6) stageStart before the recording exhausts.
      let _err: unknown;
      try {
        await advanceWorkflow(first.runId, { cwd, noPause: true }, {
          ...deps(
            recording2,
            new Date("2026-04-25T14:35:00Z"),
            new Uint8Array([0x01, 0x02]),
          ),
          reporter: reporter2,
        });
      } catch (e) {
        _err = e; // expected — the trailing stages have no script and throw.
      }

      const sketchStart = reporter2.calls.find(
        (c) => c.kind === "stageStart" && c.stageId === "sketching-design",
      );
      expect(sketchStart).toBeDefined();
      if (sketchStart && sketchStart.kind === "stageStart") {
        // S-4 AC-10: [2/7 sketching-design] starting…
        expect(sketchStart.index).toBe(2);
        expect(sketchStart.total).toBe(7);
      }
      // 02-sketching-design.md was written by the resumed stage.
      expect(
        existsSync(join(first.runDir, "02-sketching-design.md")),
      ).toBe(true);
    });
  });
});

describe("runWorkflow --allow-dirty override (AC-3)", () => {
  it("dirty tree + allowDirty=true proceeds through clarify-assess", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(cwd, "dirty.txt"), "uncommitted\n", "utf8");

      const recording = recordingScriptedQuery([
        [{ messages: happyPathScript() }],
      ]);
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true },
        deps(
          recording,
          new Date("2026-04-25T14:30:12Z"),
          new Uint8Array([0x7a, 0xf2]),
        ),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
      expect(result.paused).toBe(true);
      expect(existsSync(join(result.runDir, "01-clarify-assess.md"))).toBe(
        true,
      );
    });
  });

  it("dirty tree + allowDirty=false blocks before any disk write", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(cwd, "dirty.txt"), "uncommitted\n", "utf8");

      const recording = recordingScriptedQuery([
        [{ messages: happyPathScript() }],
      ]);
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: false },
        deps(
          recording,
          new Date("2026-04-25T14:30:12Z"),
          new Uint8Array([0x7a, 0xf2]),
        ),
      );
      expect(result.ok).toBe(false);
      expect(existsSync(join(cwd, ".praxis"))).toBe(false);
      expect(recording.calls.length).toBe(0);
    });
  });
});

describe("runWorkflow validator terminal failure (AC-7 runner)", () => {
  it("writes partial artifact, marks stage failed, returns ok:false", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
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
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true },
        deps(
          recording,
          new Date("2026-04-25T14:30:12Z"),
          new Uint8Array([0x01, 0x02]),
        ),
      );
      expect(result.ok).toBe(false);

      // Find the run dir by listing.
      const { readdirSync } = await import("node:fs");
      const runs = readdirSync(join(cwd, ".praxis", "runs"));
      expect(runs.length).toBe(1);
      const runDir = join(cwd, ".praxis", "runs", runs[0]);

      // Partial artifact written.
      expect(readFileSync(join(runDir, "01-clarify-assess.md"), "utf8")).toBe(
        badArtifact,
      );
      // state shows failed.
      const state = JSON.parse(
        readFileSync(join(runDir, "state.json"), "utf8"),
      );
      expect(state.stages["clarify-assess"].status).toBe("failed");
      expect(state.stages["clarify-assess"].stopReason).toBe(
        "validator_failed",
      );
      expect(state.stages["clarify-assess"].error).toMatch(
        /Acceptance|H2|order/,
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
      const result = await runStage(clarifyAssessConfig(), makeCtx(runDir), {
        createQueryFn: recording,
        reporter: new LineReporter(),
      });

      expect(result.stopReason).toBe("validator_failed");
      expect(result.finalText).toBe(badArtifact);
      expect(result.sessionId).toBe("sess_retry");
      expect(recording.calls[0].pushedUserMessages.length).toBe(1);
    });
  });
});
