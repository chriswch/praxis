import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { runWorkflow } from "../../src/workflow/runner.js";
import type {
  CreateQueryFn,
  Deps,
  SdkMessage,
} from "../../src/workflow/stage.js";
import type { PraxisConfig } from "../../src/config/schema.js";
import { withTempRepo } from "../support/tmp-repo.js";
import { scriptedQuery } from "../support/scripted-query.js";
import { RecordingReporter } from "../support/recording-reporter.js";

function noopMessages(sessionId = "sess_noop"): SdkMessage[] {
  return [
    {
      type: "system",
      subtype: "init",
      session_id: sessionId,
      model: "claude-opus-4-7",
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

const pauseStage = (id: string, pauseAfter: boolean): PraxisConfig["workflow"][number] => ({
  id,
  systemPrompt: { file: "clarify-assess.md" },
  userPromptTemplate: "{{intent}}",
  outputArtifact: `${id}.md`,
  pauseAfter,
});

function deps(
  createQueryFn: CreateQueryFn,
  reporter: RecordingReporter,
): Deps {
  return {
    clock: () => new Date("2026-04-25T14:30:12Z"),
    rng: (n) => new Uint8Array([0x7a, 0xf2]).slice(0, n),
    createQueryFn,
    reporter,
    // S-005: reporter tests don't reach the auto-commit stage; satisfy shape.
    commit: () => ({ ok: true, skipped: true }),
  };
}

describe("runWorkflow reporter wiring (AC-15)", () => {
  it("uses the reporter from Deps; calls stageStart with (stage, idx, total) and emits stage 0 first", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const reporter = new RecordingReporter();
      const cfg: PraxisConfig = {
        version: 1,
        workflow: [pauseStage("a", true)],
      };
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, config: cfg },
        deps(scriptedQuery([{ messages: noopMessages() }]), reporter),
      );
      if (!result.ok) throw new Error(result.reason);

      // Stage 0 lands via the runner's optional `reporter.stage0?.()` call;
      // RecordingReporter doesn't implement it, so the spy never sees it. The
      // first recorded Reporter call must therefore be stageStart for the
      // real stage.
      expect(reporter.calls[0]).toMatchObject({
        kind: "stageStart",
        stageId: "a",
        index: 1,
        total: 1,
      });
    });
  });
});

describe("runWorkflow paused replaces direct stdout (AC-11)", () => {
  it("calls reporter.paused; does not write the legacy stdout pause hint", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const reporter = new RecordingReporter();
      const cfg: PraxisConfig = {
        version: 1,
        workflow: [pauseStage("a", true)],
      };
      const before = process.stdout.write;
      const captured: string[] = [];
      // Override to capture without spamming the test runner.
      (process.stdout as { write: typeof process.stdout.write }).write = ((
        chunk: string | Uint8Array,
      ) => {
        captured.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
        return true;
      }) as typeof process.stdout.write;
      try {
        const result = await runWorkflow(
          { intent: "x", cwd, allowDirty: true, config: cfg },
          deps(scriptedQuery([{ messages: noopMessages() }]), reporter),
        );
        if (!result.ok) throw new Error(result.reason);
      } finally {
        (process.stdout as { write: typeof process.stdout.write }).write = before;
      }

      expect(reporter.countOf("paused")).toBe(1);
      // No `praxis: paused after ...` line went to stdout from the runner.
      // (The reporter is the RecordingReporter spy; LineReporter is not in
      // the loop here — so legitimately nothing should hit stdout.)
      const joined = captured.join("");
      expect(joined).not.toMatch(/praxis: paused after/);
    });
  });
});

describe("runWorkflow runDone called on every terminal path (AC-12)", () => {
  it("success/no-pause path", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const reporter = new RecordingReporter();
      const cfg: PraxisConfig = {
        version: 1,
        workflow: [pauseStage("a", false)],
      };
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, config: cfg },
        deps(scriptedQuery([{ messages: noopMessages() }]), reporter),
      );
      if (!result.ok) throw new Error(result.reason);
      expect(result.paused).toBe(false);
      expect(reporter.countOf("runDone")).toBe(1);
    });
  });

  it("paused path", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const reporter = new RecordingReporter();
      const cfg: PraxisConfig = {
        version: 1,
        workflow: [pauseStage("a", true)],
      };
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, config: cfg },
        deps(scriptedQuery([{ messages: noopMessages() }]), reporter),
      );
      if (!result.ok) throw new Error(result.reason);
      expect(result.paused).toBe(true);
      expect(reporter.countOf("runDone")).toBe(1);
    });
  });

  it("failed path (validator failure)", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const reporter = new RecordingReporter();
      // Use the default workflow's clarify-assess so the validator runs.
      const { defaultWorkflow } = await import("../../src/config/defaults.js");
      const onlyClarify: PraxisConfig = {
        version: 1,
        workflow: [
          {
            ...defaultWorkflow.workflow[0],
            // Override the prompt to a literal so it doesn't hit disk for
            // anything not in the default prompts dir; clarify-assess.md
            // already exists.
          },
        ],
      };
      const bad = "## Intent\n\nfoo\n";
      const firstAttempt: SdkMessage[] = [
        {
          type: "system",
          subtype: "init",
          session_id: "s1",
          model: "claude-opus-4-7",
        },
        {
          type: "assistant",
          session_id: "s1",
          message: { content: [{ type: "text", text: bad }] },
        },
        {
          type: "result",
          subtype: "success",
          stop_reason: "end_turn",
          total_cost_usd: 0,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
          num_turns: 1,
          session_id: "s1",
        },
      ];
      const retry: SdkMessage[] = [
        {
          type: "assistant",
          session_id: "s2",
          message: { content: [{ type: "text", text: bad }] },
        },
        {
          type: "result",
          subtype: "success",
          stop_reason: "end_turn",
          total_cost_usd: 0,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
          num_turns: 2,
          session_id: "s2",
        },
      ];
      const { recordingScriptedQuery } = await import(
        "../support/scripted-query.js"
      );
      const recording = recordingScriptedQuery([
        [{ messages: firstAttempt }, { messages: retry }],
      ]);
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, config: onlyClarify },
        deps(recording, reporter),
      );
      expect(result.ok).toBe(false);
      expect(reporter.countOf("runDone")).toBe(1);
    });
  });
});

describe("runWorkflow --no-pause overrides pauseAfter (AC-13)", () => {
  it("with noPause=true, a stage marked pauseAfter still advances to the next", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const reporter = new RecordingReporter();
      const cfg: PraxisConfig = {
        version: 1,
        workflow: [pauseStage("a", true), pauseStage("b", false)],
      };
      const recording = scriptedQuery([
        { messages: noopMessages("sess_a") },
        { messages: noopMessages("sess_b") },
      ]);
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, config: cfg, noPause: true },
        deps(recording, reporter),
      );
      if (!result.ok) throw new Error(result.reason);
      expect(result.paused).toBe(false);

      const { readFileSync } = await import("node:fs");
      const state = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(state.stages["a"].status).toBe("completed");
      expect(state.stages["b"].status).toBe("completed");
      expect(reporter.countOf("paused")).toBe(0);
    });
  });
});

describe("runWorkflow stage 0 reporting (AC-3)", () => {
  it("a synthetic stage-0 line lands before the real stage start", async () => {
    // Captured via stdout because `stage0` is an optional Reporter method
    // only LineReporter implements; we use a real LineReporter here with a
    // captured stream.
    const { Writable } = await import("node:stream");
    const { LineReporter } = await import("../../src/ui/line-reporter.js");
    class Capture extends Writable {
      chunks: string[] = [];
      _write(c: Buffer | string, _e: string, cb: () => void): void {
        this.chunks.push(c.toString());
        cb();
      }
      text(): string {
        return this.chunks.join("");
      }
    }
    await withTempRepo(async ({ dir: cwd }) => {
      const out = new Capture();
      const reporter = new LineReporter({ stdout: out, cols: 200 });
      const cfg: PraxisConfig = {
        version: 1,
        workflow: [pauseStage("a", true)],
      };
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, config: cfg },
        {
          clock: () => new Date("2026-04-25T14:30:12Z"),
          rng: (n) => new Uint8Array([0x7a, 0xf2]).slice(0, n),
          createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
          reporter,
        },
      );
      if (!result.ok) throw new Error(result.reason);

      const text = out.text();
      const stage0Idx = text.indexOf("[0/1 intent] captured → 00-intent.txt");
      const startIdx = text.indexOf("[1/1 a] starting…");
      expect(stage0Idx).toBeGreaterThanOrEqual(0);
      expect(startIdx).toBeGreaterThan(stage0Idx);
    });
  });
});
