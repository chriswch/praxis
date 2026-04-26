import { describe, it, expect } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { hangingQuery } from "../support/scripted-query.js";
import type { PraxisConfig } from "../../src/config/schema.js";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStage } from "../../src/workflow/stage.js";
import type {
  CreateQueryFn,
  Deps,
  SdkMessage,
  StageContext,
} from "../../src/workflow/stage.js";
import { defaultWorkflow } from "../../src/config/defaults.js";
import { LineReporter } from "../../src/ui/line-reporter.js";
import { recordingScriptedQuery } from "../support/scripted-query.js";
import { withTempRepo } from "../support/tmp-repo.js";
import { advanceWorkflow, runWorkflow } from "../../src/workflow/runner.js";
import { writeState, type State } from "../../src/workflow/state.js";
import { RecordingReporter } from "../support/recording-reporter.js";

/**
 * S-005 — implement stage end-to-end. Suite focuses on the implement (and the
 * downstream auto-commit) behaviors that distinguish this stage from
 * clarify-assess: bypassPermissions wiring, the omitted allowedTools, the
 * full-tool tool_use/tool_result event mapping, verbatim log capture, fresh
 * sessions per stage, timeout/SIGINT classification, and the auto-commit
 * Deps.commit hand-off.
 */

function withTmpDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "praxis-implement-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function implementConfig() {
  const cfg = defaultWorkflow.workflow.find((s) => s.id === "implement");
  if (!cfg) throw new Error("implement stage missing from defaultWorkflow");
  return cfg;
}

function makeImplementCtx(runDir: string): StageContext {
  return {
    intent: "add a logout button",
    runDir,
    runId: "2026-04-25-1430-7af2",
    reporter: new LineReporter(),
    signal: new AbortController().signal,
    // implement reads the clarify-assess artifact by path; the template
    // requires the {{artifacts.clarify-assess.path}} interpolation to resolve.
    artifactPaths: {
      "clarify-assess": join(runDir, "01-clarify-assess.md"),
    },
  };
}

/** Default fixed runId used by advance-from-paused tests so paths are predictable. */
const RUN_ID = "2026-04-25-1430-7af2";

/**
 * Build a workflow that mirrors `defaultWorkflow` shape but lets a test
 * override per-stage `timeoutMs` to a unit-test budget. AC-4 and AC-5 use
 * this to drive the implement stage to timeout/SIGINT without slowing the
 * suite or pulling in fake timers.
 */
function workflowWithImplementTimeout(timeoutMs: number): PraxisConfig {
  return {
    version: 1,
    workflow: defaultWorkflow.workflow.map((s) =>
      s.id === "implement" ? { ...s, timeoutMs } : s,
    ),
  };
}

const VALID_CLARIFY_ARTIFACT = `## Intent\n\nadd a logout button.\n\n## Assumptions\n\n- auth ctx is present\n\n## Gaps\n\n- none\n\n## Plan\n\n1. wire — surfaces logout\n\n## Acceptance\n\n- posts /logout and redirects home\n`;

/**
 * Build a minimal completed-clarify-assess `state.json` shape that
 * `advanceWorkflow` accepts as paused (predecessor done with `pauseAfter:
 * true`). Lets each test focus on what implement+auto-commit do downstream.
 */
function pausedAfterClarifyState(): State {
  return {
    runId: RUN_ID,
    intent: "add a logout button",
    startedAt: "2026-04-25T14:30:12Z",
    currentStage: "implement",
    cost: { totalTokens: 150, totalUsd: 0.012 },
    stages: {
      "clarify-assess": {
        status: "completed",
        sessionId: "sess_clarify",
        stopReason: "end_turn",
        endedAt: "2026-04-25T14:31:00Z",
        tokens: { input: 100, output: 50, cacheRead: 0, cacheCreate: 0 },
        usd: 0.012,
      },
      implement: { status: "pending" },
      "auto-commit": { status: "pending" },
    },
  };
}

/** Set up `.praxis/runs/<runId>/` with state.json + clarify-assess artifact. */
function seedPausedRun(cwd: string): string {
  const runDir = join(cwd, ".praxis", "runs", RUN_ID);
  mkdirSync(runDir, { recursive: true });
  writeState(runDir, pausedAfterClarifyState());
  writeFileSync(
    join(runDir, "01-clarify-assess.md"),
    VALID_CLARIFY_ARTIFACT,
    "utf8",
  );
  return runDir;
}

/** Three-message script used by advance tests for both implement + auto-commit. */
function stageMessages(sessionId: string, finalText: string): SdkMessage[] {
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
      message: { content: [{ type: "text", text: finalText }] },
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

type CommitCall = { cwd: string; message: string };
type CommitSpy = ((
  cwd: string,
  message: string,
) => { ok: true; skipped: true }) & {
  calls: CommitCall[];
};

function recordingCommit(): CommitSpy {
  const calls: CommitCall[] = [];
  const fn = (cwd: string, message: string) => {
    calls.push({ cwd, message });
    return { ok: true, skipped: true } as const;
  };
  const spy = fn as CommitSpy;
  spy.calls = calls;
  return spy;
}

function buildDeps(
  createQueryFn: CreateQueryFn,
  commit: CommitSpy,
  reporter = new RecordingReporter(),
): Deps & { reporter: RecordingReporter } {
  return {
    clock: () => new Date("2026-04-25T14:35:00Z"),
    rng: (n) => new Uint8Array([0x7a, 0xf2]).slice(0, n),
    createQueryFn,
    reporter,
    commit,
  };
}

function happyImplementMessages(sessionId = "sess_impl"): SdkMessage[] {
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
      message: {
        content: [{ type: "text", text: "implementation summary\n" }],
      },
    },
    {
      type: "result",
      subtype: "success",
      stop_reason: "end_turn",
      total_cost_usd: 0.05,
      usage: {
        input_tokens: 200,
        output_tokens: 80,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      num_turns: 4,
      session_id: sessionId,
    },
  ];
}

describe("advance from paused clarify-assess runs implement + auto-commit (AC-2)", () => {
  it("writes 02-implement-log.md verbatim and 03-commit.txt verbatim, transitions both stages to completed, calls deps.commit with (cwd, finalText), no real git commit lands", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const runDir = seedPausedRun(cwd);

      const implementLog = "## Files changed\n\n- src/Foo.tsx — added logout button\n";
      const commitMessage = "feat: add logout button";
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_impl", implementLog) }],
        [{ messages: stageMessages("sess_commit", commitMessage) }],
      ]);
      const commit = recordingCommit();

      // Capture the HEAD sha BEFORE advance so we can prove no real commit
      // landed even when the spy is invoked.
      const headBefore = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
        cwd,
      });
      // Fresh repo has no HEAD yet — the absence-of-HEAD itself is the proof.
      const noPriorCommit = headBefore.status !== 0;

      const result = await advanceWorkflow(
        RUN_ID,
        { cwd },
        buildDeps(recording, commit),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      // Both stages produced their artifact, verbatim.
      expect(readFileSync(join(runDir, "02-implement-log.md"), "utf8")).toBe(
        implementLog,
      );
      expect(readFileSync(join(runDir, "03-commit.txt"), "utf8")).toBe(
        commitMessage,
      );

      // state.json transitions for both stages.
      const persisted = JSON.parse(
        readFileSync(join(runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages.implement.status).toBe("completed");
      expect(persisted.stages["auto-commit"].status).toBe("completed");
      expect(persisted.stages.implement.sessionId).toBe("sess_impl");
      expect(persisted.stages["auto-commit"].sessionId).toBe("sess_commit");

      // Deps.commit invoked exactly once with (cwd, finalText).
      expect(commit.calls.length).toBe(1);
      expect(commit.calls[0].cwd).toBe(cwd);
      expect(commit.calls[0].message).toBe(commitMessage);

      // No real git commit landed — the production wrapper is stubbed in S-005.
      const headAfter = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
        cwd,
      });
      if (noPriorCommit) {
        // Fresh repo: HEAD must still not exist.
        expect(headAfter.status).not.toBe(0);
      } else {
        // Repos with a starting HEAD: the sha must be unchanged.
        expect(headAfter.stdout.toString()).toBe(headBefore.stdout.toString());
      }
    });
  });
});

describe("implement timeout (AC-4)", () => {
  it("implement timeoutMs fires → status: failed, cancelReason: 'timeout' on StageResult, stopReason: 'timeout' in state.json, partial log written, auto-commit not executed, deps.commit not called", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Hybrid createQueryFn: clarify-assess gets a scripted happy path,
      // implement gets a hanging stream that only ends on abort. Auto-commit
      // never runs.
      let call = 0;
      const recording: import("../support/scripted-query.js").RecordingCreateQueryFn =
        recordingScriptedQuery([
          [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        ]);
      const hanging = hangingQuery("sess_impl_hang");
      const composedCreateQueryFn: CreateQueryFn = (input) => {
        call++;
        if (call === 1) return recording(input);
        if (call === 2) return hanging(input);
        throw new Error("auto-commit must not be reached on implement timeout");
      };

      const commit = recordingCommit();
      const result = await runWorkflow(
        {
          intent: "x",
          cwd,
          allowDirty: true,
          noPause: true,
          config: workflowWithImplementTimeout(50),
        },
        buildDeps(composedCreateQueryFn, commit),
      );

      // Run failed at the implement stage.
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.status).toBe("failed");
      expect(result.failedStageId).toBe("implement");

      // state.json: implement marked failed, stopReason 'timeout'.
      const persisted = JSON.parse(
        readFileSync(join(result.runDir!, "state.json"), "utf8"),
      );
      expect(persisted.stages.implement.status).toBe("failed");
      expect(persisted.stages.implement.stopReason).toBe("timeout");
      // auto-commit untouched.
      expect(persisted.stages["auto-commit"].status).toBe("pending");

      // Partial log written (empty in this test, but the file exists).
      expect(existsSync(join(result.runDir!, "02-implement-log.md"))).toBe(true);
      // 03-commit.txt must NOT exist.
      expect(existsSync(join(result.runDir!, "03-commit.txt"))).toBe(false);

      // deps.commit was never invoked.
      expect(commit.calls.length).toBe(0);

      // Only two SDK calls: clarify-assess + implement. Auto-commit skipped.
      expect(call).toBe(2);
    });
  });
});

describe("implement SIGINT (AC-5)", () => {
  it("external abort during implement → status: cancelled, stopReason: 'sigint' in state.json, partial log written, auto-commit not executed, deps.commit not called", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      let call = 0;
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
      ]);
      const hanging = hangingQuery("sess_impl_sigint");
      const composedCreateQueryFn: CreateQueryFn = (input) => {
        call++;
        if (call === 1) return recording(input);
        if (call === 2) return hanging(input);
        throw new Error("auto-commit must not be reached on implement SIGINT");
      };

      const ctl = new AbortController();
      // Abort just after implement starts spinning.
      setTimeout(() => ctl.abort(), 30);

      const commit = recordingCommit();
      const result = await runWorkflow(
        {
          intent: "x",
          cwd,
          allowDirty: true,
          noPause: true,
          // No implement timeout — only the SIGINT can end the hang.
          signal: ctl.signal,
        },
        buildDeps(composedCreateQueryFn, commit),
      );

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.status).toBe("cancelled");
      expect(result.failedStageId).toBe("implement");

      const persisted = JSON.parse(
        readFileSync(join(result.runDir!, "state.json"), "utf8"),
      );
      expect(persisted.stages.implement.status).toBe("cancelled");
      expect(persisted.stages.implement.stopReason).toBe("sigint");
      expect(persisted.stages["auto-commit"].status).toBe("pending");

      expect(existsSync(join(result.runDir!, "02-implement-log.md"))).toBe(true);
      expect(existsSync(join(result.runDir!, "03-commit.txt"))).toBe(false);
      expect(commit.calls.length).toBe(0);
      expect(call).toBe(2);
    });
  });
});

describe("fresh SDK session per stage (AC-10)", () => {
  it("clarify-assess sessionId is not reused for implement; each stage call gets its own AbortSignal", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        [{ messages: stageMessages("sess_impl", "implement log\n") }],
        [{ messages: stageMessages("sess_commit", "chore: noop") }],
      ]);
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, noPause: true },
        buildDeps(recording, recordingCommit()),
      );
      if (!result.ok) throw new Error(result.reason);

      // Three distinct SDK invocations.
      expect(recording.calls.length).toBe(3);

      // Each invocation got its own AbortSignal (not shared).
      const sigs = recording.calls.map((c) => c.input.signal);
      expect(new Set(sigs).size).toBe(3);

      // Distinct sessionIds persisted.
      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      const sessionIds = [
        persisted.stages["clarify-assess"].sessionId,
        persisted.stages.implement.sessionId,
        persisted.stages["auto-commit"].sessionId,
      ];
      expect(new Set(sessionIds).size).toBe(3);
      expect(persisted.stages["clarify-assess"].sessionId).toBe("sess_clarify");
      expect(persisted.stages.implement.sessionId).toBe("sess_impl");
      expect(persisted.stages["auto-commit"].sessionId).toBe("sess_commit");
    });
  });
});

describe("02-implement-log.md is verbatim finalText (AC-8)", () => {
  it("writes the agent's finalText byte-for-byte — no validator, no trailing newline added", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const runDir = seedPausedRun(cwd);
      // finalText with NO trailing newline and a leading multi-line body —
      // the artifact write must preserve it exactly.
      const implementLog = "## Files changed\n\n- a.ts\n- b.ts";
      expect(implementLog.endsWith("\n")).toBe(false);

      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_impl", implementLog) }],
        [{ messages: stageMessages("sess_commit", "chore: noop") }],
      ]);
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd },
        buildDeps(recording, recordingCommit()),
      );
      if (!result.ok) throw new Error(result.reason);

      const raw = readFileSync(join(runDir, "02-implement-log.md"));
      expect(raw.toString("utf8")).toBe(implementLog);
      // Last byte must NOT be the newline we never added.
      expect(raw[raw.length - 1]).not.toBe(0x0a);

      // implement stage in the default workflow has no validator.
      expect(implementConfig().validate).toBeUndefined();
    });
  });
});

describe("runStage translates implement tool_use/tool_result blocks to AgentEvents (AC-7)", () => {
  it("Read → tool_use with file_path brief; Edit → tool_use with file_path brief; tool_result resolves name from tool_use_id and reports ok=true", async () => {
    await withTmpDir(async (runDir) => {
      const events: import("../../src/workflow/stage.js").AgentEvent[] = [];
      const reporter: import("../../src/ui/reporter.js").Reporter = {
        stageStart() {},
        stageEvent(e) {
          events.push(e);
        },
        stageEnd() {},
        paused() {},
        runDone() {},
      };

      const messages: SdkMessage[] = [
        {
          type: "system",
          subtype: "init",
          session_id: "sess_impl_tools",
          model: "claude-opus-4-7",
        },
        {
          type: "assistant",
          session_id: "sess_impl_tools",
          message: {
            content: [
              { type: "text", text: "investigating" },
              {
                type: "tool_use",
                id: "tu_read",
                name: "Read",
                input: { file_path: "/repo/src/auth.ts" },
              },
              {
                type: "tool_result",
                tool_use_id: "tu_read",
                content: "ok",
                is_error: false,
              },
              {
                type: "tool_use",
                id: "tu_edit",
                name: "Edit",
                input: {
                  file_path: "/repo/src/Logout.tsx",
                  old_string: "x",
                  new_string: "y",
                },
              },
              {
                type: "tool_result",
                tool_use_id: "tu_edit",
                content: "ok",
                is_error: false,
              },
            ],
          },
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
          session_id: "sess_impl_tools",
        },
      ];

      const ctx: StageContext = {
        intent: "x",
        runDir,
        runId: RUN_ID,
        reporter,
        signal: new AbortController().signal,
        artifactPaths: { "clarify-assess": join(runDir, "01-clarify-assess.md") },
      };
      const recording = recordingScriptedQuery([[{ messages }]]);
      await runStage(implementConfig(), ctx, { createQueryFn: recording });

      const toolUses = events.filter((e) => e.type === "tool_use");
      expect(toolUses.map((e) => e.type === "tool_use" && e.name)).toEqual([
        "Read",
        "Edit",
      ]);
      expect(
        toolUses.map((e) => (e.type === "tool_use" ? e.brief : "")),
      ).toEqual(["/repo/src/auth.ts", "/repo/src/Logout.tsx"]);

      const toolResults = events.filter((e) => e.type === "tool_result");
      expect(toolResults.length).toBe(2);
      // Tool name resolved through the tool_use_id cache (AC-7 expectation).
      expect(toolResults.map((e) => e.type === "tool_result" && e.name)).toEqual([
        "Read",
        "Edit",
      ]);
      expect(
        toolResults.every((e) => e.type === "tool_result" && e.ok === true),
      ).toBe(true);
    });
  });
});

describe("runWorkflow --no-pause runs all 3 stages in one shot (AC-3)", () => {
  it("noPause: true drives clarify-assess → implement → auto-commit; commit fires once with the auto-commit finalText", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const implementLog = "## Files changed\n\n- src/Foo.tsx — added logout button\n";
      const commitMessage = "feat: add logout button";
      const recording = recordingScriptedQuery([
        // clarify-assess: emit a valid §5.2 artifact so the validator passes.
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        // implement.
        [{ messages: stageMessages("sess_impl", implementLog) }],
        // auto-commit.
        [{ messages: stageMessages("sess_commit", commitMessage) }],
      ]);
      const commit = recordingCommit();

      const result = await runWorkflow(
        { intent: "add a logout button", cwd, allowDirty: true, noPause: true },
        buildDeps(recording, commit),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
      expect(result.paused).toBe(false);

      // All three SDK stages executed.
      expect(recording.calls.length).toBe(3);

      // Per-stage state.json transitions.
      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages["clarify-assess"].status).toBe("completed");
      expect(persisted.stages.implement.status).toBe("completed");
      expect(persisted.stages["auto-commit"].status).toBe("completed");

      // Artifacts written verbatim.
      expect(readFileSync(join(result.runDir, "01-clarify-assess.md"), "utf8"))
        .toBe(VALID_CLARIFY_ARTIFACT);
      expect(readFileSync(join(result.runDir, "02-implement-log.md"), "utf8"))
        .toBe(implementLog);
      expect(readFileSync(join(result.runDir, "03-commit.txt"), "utf8"))
        .toBe(commitMessage);

      // commit fired exactly once with the auto-commit final text.
      expect(commit.calls.length).toBe(1);
      expect(commit.calls[0]).toEqual({ cwd, message: commitMessage });
    });
  });
});

describe("runStage implement option forwarding (AC-6)", () => {
  it("forwards model, permissionMode 'bypassPermissions', settingSources, signal, interpolated initialUserPrompt, and the implement system prompt; allowedTools omitted", async () => {
    await withTmpDir(async (runDir) => {
      const recording = recordingScriptedQuery([
        [{ messages: happyImplementMessages() }],
      ]);
      const ctx = makeImplementCtx(runDir);
      const result = await runStage(implementConfig(), ctx, {
        createQueryFn: recording,
      });

      expect(recording.calls.length).toBe(1);
      const input = recording.calls[0].input;
      expect(input.model).toBe("claude-opus-4-7");
      expect(input.permissionMode).toBe("bypassPermissions");
      // implement deliberately omits allowedTools (config has no key) so the
      // SDK defaults to all tools, per spec §5.3.
      expect(input.allowedTools).toBeUndefined();
      expect(input.settingSources).toEqual(["user", "project"]);
      expect(input.signal).toBeInstanceOf(AbortSignal);
      // System prompt comes from src/config/prompts/implement.md.
      expect(input.systemPrompt).toMatch(/implement/i);
      expect(input.systemPrompt).toMatch(/bypassPermissions/);
      // Initial user prompt is interpolated against {{artifacts.clarify-assess.path}}.
      expect(input.initialUserPrompt).toContain(
        join(runDir, "01-clarify-assess.md"),
      );
      expect(result.stopReason).toBe("end_turn");
      expect(result.sessionId).toBe("sess_impl");
    });
  });
});
