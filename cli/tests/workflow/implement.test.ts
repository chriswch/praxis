import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultWorkflow } from "../../src/config/defaults.js";
import type { PraxisConfig } from "../../src/config/schema.js";
import { LineReporter } from "../../src/ui/line-reporter.js";
import { advanceWorkflow, runWorkflow } from "../../src/workflow/runner.js";
import type {
  CreateQueryFn,
  Deps,
  SdkMessage,
  StageContext,
} from "../../src/workflow/stage.js";
import { runStage } from "../../src/workflow/stage.js";
import { type State, writeState } from "../../src/workflow/state.js";
import { RecordingReporter } from "../support/recording-reporter.js";
import {
  hangingQuery,
  recordingScriptedQuery,
} from "../support/scripted-query.js";
import { withTempRepo } from "../support/tmp-repo.js";

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

/**
 * Stock review-stage finalText that satisfies the `## Decision` H2 validator
 * (S-002 AC-2). Tests scripting the 5-stage default workflow re-use this so
 * code-reviewing's validator passes on the first attempt.
 */
const REVIEW_PROCEED = `# Code review\n\nNo blocking issues.\n\n## Decision\n\nproceed\n`;

/**
 * Stock improve-stage finalText. The improve stage has no validator, so any
 * non-empty body works; this is just a human-readable placeholder.
 */
const IMPROVE_LOG = `## Improvement summary\n\n- no fixes needed\n`;

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
type CommitResult =
  | { ok: true; sha: string }
  | { ok: true; skipped: true }
  | { ok: false; reason: string };
type CommitSpy = ((cwd: string, message: string) => CommitResult) & {
  calls: CommitCall[];
};

/**
 * Recording spy for the auto-commit hand-off seam (Deps.commit). Defaults to
 * a successful real-commit shape `{ ok: true, sha }` (S-006); callers can
 * inject `result` to drive the runner down the skip / failure branches.
 */
function recordingCommit(
  result: CommitResult = {
    ok: true,
    sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  },
): CommitSpy {
  const calls: CommitCall[] = [];
  const fn = (cwd: string, message: string): CommitResult => {
    calls.push({ cwd, message });
    return result;
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
  it("writes 02-implement-log.md verbatim, rewrites 05-commit.txt with the SHA prepended, captures commitSha in state, calls deps.commit with (cwd, finalText)", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const runDir = seedPausedRun(cwd);

      const implementLog =
        "## Files changed\n\n- src/Foo.tsx — added logout button\n";
      const commitMessage = "feat: add logout button";
      // S-002 5-stage shape: implement → code-reviewing → code-improving →
      // auto-commit (clarify-assess already completed in seedPausedRun).
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_impl", implementLog) }],
        [{ messages: stageMessages("sess_review", REVIEW_PROCEED) }],
        [{ messages: stageMessages("sess_improve", IMPROVE_LOG) }],
        [{ messages: stageMessages("sess_commit", commitMessage) }],
      ]);
      const fakeSha = "abcdef0123456789abcdef0123456789abcdef01";
      const commit = recordingCommit({ ok: true, sha: fakeSha });

      const result = await advanceWorkflow(
        RUN_ID,
        { cwd },
        buildDeps(recording, commit),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      // 02-implement-log.md verbatim.
      expect(readFileSync(join(runDir, "02-implement-log.md"), "utf8")).toBe(
        implementLog,
      );
      // S-006 AC-4: 05-commit.txt rewritten with `<sha>\n\n<message>\n`.
      expect(readFileSync(join(runDir, "05-commit.txt"), "utf8")).toBe(
        `${fakeSha}\n\n${commitMessage}\n`,
      );

      // state.json transitions for both stages.
      const persisted = JSON.parse(
        readFileSync(join(runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages.implement.status).toBe("completed");
      expect(persisted.stages["auto-commit"].status).toBe("completed");
      expect(persisted.stages.implement.sessionId).toBe("sess_impl");
      expect(persisted.stages["auto-commit"].sessionId).toBe("sess_commit");
      // S-006 AC-4: commitSha plumbed onto the auto-commit stage state.
      expect(persisted.stages["auto-commit"].commitSha).toBe(fakeSha);

      // Deps.commit invoked exactly once with (cwd, finalText).
      expect(commit.calls.length).toBe(1);
      expect(commit.calls[0].cwd).toBe(cwd);
      expect(commit.calls[0].message).toBe(commitMessage);
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
      expect(existsSync(join(result.runDir!, "02-implement-log.md"))).toBe(
        true,
      );
      // 05-commit.txt must NOT exist.
      expect(existsSync(join(result.runDir!, "05-commit.txt"))).toBe(false);

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

      expect(existsSync(join(result.runDir!, "02-implement-log.md"))).toBe(
        true,
      );
      expect(existsSync(join(result.runDir!, "05-commit.txt"))).toBe(false);
      expect(commit.calls.length).toBe(0);
      expect(call).toBe(2);
    });
  });
});

describe("fresh SDK session per stage (AC-10)", () => {
  it("clarify-assess sessionId is not reused downstream; each stage call gets its own AbortSignal", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // S-002 5-stage shape — each stage gets its own scripted SDK call.
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        [{ messages: stageMessages("sess_impl", "implement log\n") }],
        [{ messages: stageMessages("sess_review", REVIEW_PROCEED) }],
        [{ messages: stageMessages("sess_improve", IMPROVE_LOG) }],
        [{ messages: stageMessages("sess_commit", "chore: noop") }],
      ]);
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, noPause: true },
        buildDeps(recording, recordingCommit()),
      );
      if (!result.ok) throw new Error(result.reason);

      // Five distinct SDK invocations.
      expect(recording.calls.length).toBe(5);

      // Each invocation got its own AbortSignal (not shared).
      const sigs = recording.calls.map((c) => c.input.signal);
      expect(new Set(sigs).size).toBe(5);

      // Distinct sessionIds persisted.
      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      const sessionIds = [
        persisted.stages["clarify-assess"].sessionId,
        persisted.stages.implement.sessionId,
        persisted.stages["code-reviewing"].sessionId,
        persisted.stages["code-improving"].sessionId,
        persisted.stages["auto-commit"].sessionId,
      ];
      expect(new Set(sessionIds).size).toBe(5);
      expect(persisted.stages["clarify-assess"].sessionId).toBe("sess_clarify");
      expect(persisted.stages.implement.sessionId).toBe("sess_impl");
      expect(persisted.stages["code-reviewing"].sessionId).toBe("sess_review");
      expect(persisted.stages["code-improving"].sessionId).toBe("sess_improve");
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

      // S-002 5-stage shape: advance from paused-after-clarify must script
      // implement → code-reviewing → code-improving → auto-commit.
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_impl", implementLog) }],
        [{ messages: stageMessages("sess_review", REVIEW_PROCEED) }],
        [{ messages: stageMessages("sess_improve", IMPROVE_LOG) }],
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
        artifactPaths: {
          "clarify-assess": join(runDir, "01-clarify-assess.md"),
        },
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
      expect(
        toolResults.map((e) => e.type === "tool_result" && e.name),
      ).toEqual(["Read", "Edit"]);
      expect(
        toolResults.every((e) => e.type === "tool_result" && e.ok === true),
      ).toBe(true);
    });
  });
});

describe("runWorkflow --no-pause runs all 5 stages in one shot (AC-3)", () => {
  it("noPause: true drives clarify-assess → implement → code-reviewing → code-improving → auto-commit; commit fires once with the auto-commit finalText", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const implementLog =
        "## Files changed\n\n- src/Foo.tsx — added logout button\n";
      const commitMessage = "feat: add logout button";
      const recording = recordingScriptedQuery([
        // clarify-assess: emit a valid artifact so the validator passes.
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        // implement.
        [{ messages: stageMessages("sess_impl", implementLog) }],
        // code-reviewing.
        [{ messages: stageMessages("sess_review", REVIEW_PROCEED) }],
        // code-improving.
        [{ messages: stageMessages("sess_improve", IMPROVE_LOG) }],
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

      // All five SDK stages executed.
      expect(recording.calls.length).toBe(5);

      // Per-stage state.json transitions.
      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages["clarify-assess"].status).toBe("completed");
      expect(persisted.stages.implement.status).toBe("completed");
      expect(persisted.stages["code-reviewing"].status).toBe("completed");
      expect(persisted.stages["code-improving"].status).toBe("completed");
      expect(persisted.stages["auto-commit"].status).toBe("completed");

      // Artifacts written verbatim — except 05-commit.txt which the runner
      // rewrites with the SHA prepended (S-006 AC-4).
      expect(
        readFileSync(join(result.runDir, "01-clarify-assess.md"), "utf8"),
      ).toBe(VALID_CLARIFY_ARTIFACT);
      expect(
        readFileSync(join(result.runDir, "02-implement-log.md"), "utf8"),
      ).toBe(implementLog);
      expect(
        readFileSync(join(result.runDir, "03-code-review.md"), "utf8"),
      ).toBe(REVIEW_PROCEED);
      expect(
        readFileSync(join(result.runDir, "04-code-improve.md"), "utf8"),
      ).toBe(IMPROVE_LOG);
      const expectedSha = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
      expect(readFileSync(join(result.runDir, "05-commit.txt"), "utf8")).toBe(
        `${expectedSha}\n\n${commitMessage}\n`,
      );
      expect(persisted.stages["auto-commit"].commitSha).toBe(expectedSha);

      // commit fired exactly once with the auto-commit final text.
      expect(commit.calls.length).toBe(1);
      expect(commit.calls[0]).toEqual({ cwd, message: commitMessage });
    });
  });
});

describe("RunSummary.commitSha plumbed from auto-commit state (S-006 AC-7)", () => {
  it("summarize() reads state.stages['auto-commit'].commitSha and surfaces it on runDone's RunSummary", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // S-002 5-stage shape.
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        [{ messages: stageMessages("sess_impl", "log\n") }],
        [{ messages: stageMessages("sess_review", REVIEW_PROCEED) }],
        [{ messages: stageMessages("sess_improve", IMPROVE_LOG) }],
        [{ messages: stageMessages("sess_commit", "feat: x") }],
      ]);
      const sha = "1234567890abcdef1234567890abcdef12345678";
      const commit = recordingCommit({ ok: true, sha });
      const reporter = new RecordingReporter();

      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, noPause: true },
        { ...buildDeps(recording, commit), reporter },
      );
      if (!result.ok) throw new Error(result.reason);

      const runDone = reporter.calls.find((c) => c.kind === "runDone");
      if (!runDone || runDone.kind !== "runDone") {
        throw new Error("runDone never fired");
      }
      expect(runDone.summary.commitSha).toBe(sha);
    });
  });
});

describe("RunSummary.perStage covers all 5 stages on the proceed happy path (S-006)", () => {
  it("runDone receives a perStage row for every stage that ran (5 SDK calls → 5 entries with tokens + sessionId)", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        [{ messages: stageMessages("sess_impl", "log\n") }],
        [{ messages: stageMessages("sess_review", REVIEW_PROCEED) }],
        [{ messages: stageMessages("sess_improve", IMPROVE_LOG) }],
        [{ messages: stageMessages("sess_commit", "feat: x") }],
      ]);
      const reporter = new RecordingReporter();
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, noPause: true },
        { ...buildDeps(recording, recordingCommit()), reporter },
      );
      if (!result.ok) throw new Error(result.reason);

      const runDone = reporter.calls.find((c) => c.kind === "runDone");
      if (!runDone || runDone.kind !== "runDone") {
        throw new Error("runDone never fired");
      }
      const stages = Object.keys(runDone.summary.perStage);
      // All five stages appear in the per-stage breakdown — summarize() is
      // driven by state.stages, so this auto-grows with workflow.length and
      // does not need any production change beyond the 5-stage default.
      expect(stages).toEqual([
        "clarify-assess",
        "implement",
        "code-reviewing",
        "code-improving",
        "auto-commit",
      ]);
      for (const id of stages) {
        const row = runDone.summary.perStage[id];
        expect(row.sessionId).toMatch(/^sess_/);
        expect(row.tokens).toBeGreaterThan(0);
      }
    });
  });
});

describe("runner surfaces commit failure as commit_failed (S-006 AC-6)", () => {
  it("deps.commit returns {ok:false, reason} → state.json shows status:failed, stopReason:commit_failed, error:reason; 05-commit.txt is the agent message only", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const commitMessage = "feat: nope";
      // S-002 5-stage shape.
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        [{ messages: stageMessages("sess_impl", "log\n") }],
        [{ messages: stageMessages("sess_review", REVIEW_PROCEED) }],
        [{ messages: stageMessages("sess_improve", IMPROVE_LOG) }],
        [{ messages: stageMessages("sess_commit", commitMessage) }],
      ]);
      const reason = "git commit failed: pre-commit hook rejected";
      const commit = recordingCommit({ ok: false, reason });

      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, noPause: true },
        buildDeps(recording, commit),
      );

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.status).toBe("failed");
      expect(result.failedStageId).toBe("auto-commit");
      expect(result.reason).toBe(reason);

      const persisted = JSON.parse(
        readFileSync(join(result.runDir!, "state.json"), "utf8"),
      );
      const ac = persisted.stages["auto-commit"];
      expect(ac.status).toBe("failed");
      expect(ac.stopReason).toBe("commit_failed");
      expect(ac.error).toBe(reason);
      // No SHA captured on failure.
      expect(ac.commitSha).toBeUndefined();

      // 05-commit.txt holds the agent message only — no SHA prefix.
      expect(readFileSync(join(result.runDir!, "05-commit.txt"), "utf8")).toBe(
        commitMessage,
      );

      // commit was attempted exactly once.
      expect(commit.calls.length).toBe(1);
    });
  });
});

describe("runner skips trailing stages when tree is clean (S-006 AC-5, updated for S-003 cascade)", () => {
  it("clean tree before code-reviewing → stages 3,4,5 all skipped; only clarify-assess + implement call the SDK; no deps.commit; no artifacts for the skipped stages", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Pre-commit a baseline .gitignore so runWorkflow's
      // appendPraxisToGitignore is a no-op AND there is a HEAD already; the
      // .praxis/ run dir is then ignored, so git status --porcelain is empty
      // by the time stage 3's clean-tree pre-check fires.
      writeFileSync(join(cwd, ".gitignore"), ".praxis/\n", "utf8");
      spawnSync("git", ["add", ".gitignore"], { cwd });
      spawnSync("git", ["commit", "-m", "baseline"], { cwd });
      const headBefore = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd,
        encoding: "utf8",
      }).stdout.trim();

      // S-003 cascade: clean tree at stage 3 entry skips code-reviewing,
      // code-improving, AND auto-commit. Only stages 1 and 2 call the SDK.
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        [{ messages: stageMessages("sess_impl", "log\n") }],
      ]);
      const commit = recordingCommit();

      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, noPause: true },
        buildDeps(recording, commit),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      // Two SDK invocations — code-reviewing/code-improving/auto-commit all
      // short-circuit via the cascading clean-tree skip introduced in S-003.
      expect(recording.calls.length).toBe(2);
      // deps.commit must not be called when auto-commit is skipped.
      expect(commit.calls.length).toBe(0);

      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      for (const id of ["code-reviewing", "code-improving", "auto-commit"]) {
        const stage = persisted.stages[id];
        expect(stage.status).toBe("completed");
        expect(stage.stopReason).toBe("skipped");
        expect(stage.sessionId).toBeUndefined();
        expect(stage.tokens).toBeUndefined();
        expect(stage.usd).toBeUndefined();
      }

      // No artifacts produced for skipped stages.
      expect(existsSync(join(result.runDir, "03-code-review.md"))).toBe(false);
      expect(existsSync(join(result.runDir, "04-code-improve.md"))).toBe(false);
      expect(existsSync(join(result.runDir, "05-commit.txt"))).toBe(false);

      // HEAD did not move.
      const headAfter = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd,
        encoding: "utf8",
      }).stdout.trim();
      expect(headAfter).toBe(headBefore);
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
      // SDK defaults to all tools.
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
