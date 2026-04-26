import { describe, it, expect } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
import { advanceWorkflow } from "../../src/workflow/runner.js";
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
type CommitSpy = ((cwd: string, message: string) => { ok: true }) & {
  calls: CommitCall[];
};

function recordingCommit(): CommitSpy {
  const calls: CommitCall[] = [];
  const fn = (cwd: string, message: string) => {
    calls.push({ cwd, message });
    return { ok: true } as const;
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
