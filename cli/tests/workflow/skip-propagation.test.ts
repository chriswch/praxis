import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultWorkflow } from "../../src/config/defaults.js";
import type { PraxisConfig } from "../../src/config/schema.js";
import { advanceWorkflow, runWorkflow } from "../../src/workflow/runner.js";
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
 * S-003 — clean-tree skip propagation, decision-driven skip on
 * code-improving, and the bespoke advance branches for failed/cancelled
 * code-reviewing (recoverable) and failed/cancelled code-improving (NOT
 * recoverable via advance — only via `praxis retry`).
 *
 * Tests use the real defaultWorkflow (no override) so the AUTO_COMMIT_ID /
 * CODE_REVIEWING_ID / CODE_IMPROVING_ID dispatch matches production.
 */

const RUN_ID = "2026-04-25-1430-7af2";

const VALID_CLARIFY_ARTIFACT = `## Intent\n\nadd a logout button.\n\n## Assumptions\n\n- auth ctx is present\n\n## Gaps\n\n- none\n\n## Plan\n\n1. wire — surfaces logout\n\n## Acceptance\n\n- posts /logout and redirects home\n`;

const REVIEW_PROCEED = `# Code review\n\nNo blocking issues.\n\n## Decision\n\nproceed\n`;

const REVIEW_SKIP_IMPROVE = `# Code review\n\nTrivial change.\n\n## Decision\n\nskip-improve\n`;

const IMPROVE_LOG = `## Improvement summary\n\n- no fixes needed\n`;

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

/**
 * Pre-commit a `.gitignore` with `.praxis/` so the run dir stays untracked
 * and `git status --porcelain` is empty after stages that don't touch the
 * working tree. AC-1 / AC-2 / AC-4 / AC-13 all rely on this baseline.
 *
 * Disables commit.gpgsign locally so the baseline commit lands without a
 * configured signing key (fresh containers, contributor laptops with
 * commit.gpgsign=true globally). Local-scope only — vanishes with the
 * temp-repo's .git/config on rmSync.
 */
function seedCleanRepo(cwd: string): void {
  spawnSync("git", ["config", "--local", "commit.gpgsign", "false"], { cwd });
  writeFileSync(join(cwd, ".gitignore"), ".praxis/\n", "utf8");
  spawnSync("git", ["add", ".gitignore"], { cwd });
  spawnSync("git", ["commit", "-m", "baseline"], { cwd });
}

/** Fixture state: clarify-assess + implement completed, awaiting code-reviewing. */
function statePausedBeforeReview(): State {
  return {
    runId: RUN_ID,
    intent: "x",
    startedAt: "2026-04-25T14:30:12Z",
    baselineSha: "0123456789abcdef0123456789abcdef01234567",
    currentStage: "code-reviewing",
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
      // S-2: sketching-design slot — completed in fixtures so that
      // advanceWorkflow's resume-point scan finds the first non-completed
      // stage at code-reviewing (or later).
      "sketching-design": {
        status: "completed",
        sessionId: "sess_sketch",
        stopReason: "end_turn",
        endedAt: "2026-04-25T14:31:30Z",
        tokens: { input: 20, output: 10, cacheRead: 0, cacheCreate: 0 },
        usd: 0.001,
      },
      implement: {
        status: "completed",
        sessionId: "sess_impl",
        stopReason: "end_turn",
        endedAt: "2026-04-25T14:32:00Z",
        tokens: { input: 50, output: 25, cacheRead: 0, cacheCreate: 0 },
        usd: 0.005,
      },
      "code-reviewing": { status: "pending" },
      "code-improving": { status: "pending" },
      "auto-commit": { status: "pending" },
    },
  };
}

/**
 * State helper: clarify-assess + implement completed, code-reviewing failed
 * (validator), code-improving and auto-commit pending. Used by AC-8/9/10.
 */
function stateWithFailedReview(): State {
  const base = statePausedBeforeReview();
  base.currentStage = "code-reviewing";
  base.stages["code-reviewing"] = {
    status: "failed",
    sessionId: "sess_review_bad",
    stopReason: "validator_failed",
    endedAt: "2026-04-25T14:33:00Z",
    tokens: { input: 10, output: 5, cacheRead: 0, cacheCreate: 0 },
    usd: 0.002,
    error: "missing required H2: Decision",
  };
  return base;
}

function stateWithCancelledReview(): State {
  const base = statePausedBeforeReview();
  base.currentStage = "code-reviewing";
  base.stages["code-reviewing"] = {
    status: "cancelled",
    sessionId: "sess_review_cancel",
    stopReason: "sigint",
    endedAt: "2026-04-25T14:33:00Z",
    tokens: { input: 10, output: 5, cacheRead: 0, cacheCreate: 0 },
    usd: 0.002,
    error: "cancelled by user (SIGINT)",
  };
  return base;
}

/**
 * State helper: clarify-assess + implement + code-reviewing completed,
 * code-improving failed. Used by AC-11/12.
 */
function stateWithFailedImprove(): State {
  const base = statePausedBeforeReview();
  base.currentStage = "code-improving";
  base.stages["code-reviewing"] = {
    status: "completed",
    sessionId: "sess_review",
    stopReason: "end_turn",
    endedAt: "2026-04-25T14:33:00Z",
    tokens: { input: 10, output: 5, cacheRead: 0, cacheCreate: 0 },
    usd: 0.002,
  };
  base.stages["code-improving"] = {
    status: "failed",
    sessionId: "sess_improve_bad",
    stopReason: "timeout",
    endedAt: "2026-04-25T14:34:00Z",
    tokens: { input: 10, output: 5, cacheRead: 0, cacheCreate: 0 },
    usd: 0.002,
    error: "stage timed out",
  };
  return base;
}

function stateWithCancelledImprove(): State {
  const base = stateWithFailedImprove();
  base.stages["code-improving"] = {
    ...base.stages["code-improving"],
    status: "cancelled",
    stopReason: "sigint",
    error: "cancelled by user (SIGINT)",
  };
  return base;
}

function seedRunDir(cwd: string, state: State): string {
  const runDir = join(cwd, ".praxis", "runs", state.runId);
  mkdirSync(runDir, { recursive: true });
  writeState(runDir, state);
  return runDir;
}

describe("S-003 AC-15: regression — pre-existing environmental failures unchanged", () => {
  it("the runner module still compiles and isWorkingTreeClean is importable from src/git/status.js", async () => {
    // Indirect proxy for AC-15: the 6 pre-existing failures are gpg-related
    // and live outside this slice's scope. The test we own is that the
    // public seams S-003 ships still resolve. Other passing tests in this
    // suite assert behaviour; this one pins the import surface so a future
    // refactor can't quietly delete the helper.
    const { isWorkingTreeClean } = await import("../../src/git/status.js");
    expect(typeof isWorkingTreeClean).toBe("function");
    const { CODE_REVIEWING_ID, CODE_IMPROVING_ID, AUTO_COMMIT_ID } =
      await import("../../src/config/defaults.js");
    expect(CODE_REVIEWING_ID).toBe("code-reviewing");
    expect(CODE_IMPROVING_ID).toBe("code-improving");
    expect(AUTO_COMMIT_ID).toBe("auto-commit");
  });
});

describe("S-003 AC-14: only src/git/* owns the porcelain spawn", () => {
  it("spawnSync('git', ['status', '--porcelain']) appears only in src/git/ — runner.ts no longer has its own copy", async () => {
    const { readdirSync } = await import("node:fs");
    const srcDir = join(__dirname, "..", "..", "src");

    function* walk(dir: string): Generator<string> {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, ent.name);
        if (ent.isDirectory()) yield* walk(full);
        else if (ent.isFile() && full.endsWith(".ts")) yield full;
      }
    }

    const hits: string[] = [];
    for (const file of walk(srcDir)) {
      const text = readFileSync(file, "utf8");
      // Match the spawnSync invocation pattern (the actual command), not
      // mere prose mentions. The runner used to have its own copy; after
      // S-003 only src/git/status.ts and src/git/commit.ts spawn the
      // porcelain command. preflight.ts uses it for the dirty-list check
      // (a separate concern) and is allowed.
      if (
        /\["status",\s*"--porcelain"\]/.test(text) ||
        /'status',\s*'--porcelain'/.test(text)
      ) {
        hits.push(file.replace(srcDir, "src"));
      }
    }
    // Exactly the files we expect.
    const sorted = [...hits].sort();
    expect(sorted).toEqual([
      "src/git/commit.ts",
      "src/git/status.ts",
      "src/workflow/preflight.ts",
    ]);
    // Specifically: runner.ts no longer holds the private copy.
    expect(hits.some((f) => f.endsWith("workflow/runner.ts"))).toBe(false);
  });
});

describe("S-003 AC-13: missing 04-code-review.md at code-improving entry → stage fails, no SDK call", () => {
  it("seeded state with stage 3 completed but artifact missing → advance fails code-improving with stopReason 'missing_review_artifact'; no SDK call for stage 4", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Use a custom config where code-reviewing pauses after itself, so
      // advance can resume into code-improving (the pending current stage).
      // This isolates the "stage 4 entry sees missing 04-code-review.md"
      // branch without needing to intercept mid-flight in runWorkflow.
      const cfg: PraxisConfig = {
        version: 1,
        workflow: defaultWorkflow.workflow.map((s) =>
          s.id === "code-reviewing" ? { ...s, pauseAfter: true } : s,
        ),
      };
      const state: State = {
        runId: RUN_ID,
        intent: "x",
        startedAt: "2026-04-25T14:30:12Z",
        baselineSha: "0123456789abcdef0123456789abcdef01234567",
        currentStage: "code-improving",
        cost: { totalTokens: 0, totalUsd: 0 },
        stages: {
          "clarify-assess": {
            status: "completed",
            sessionId: "sess_clarify",
            stopReason: "end_turn",
            endedAt: "2026-04-25T14:31:00Z",
            tokens: { input: 100, output: 50, cacheRead: 0, cacheCreate: 0 },
            usd: 0.012,
          },
          // S-2: sketching-design slot — completed in fixture.
          "sketching-design": {
            status: "completed",
            sessionId: "sess_sketch",
            stopReason: "end_turn",
            endedAt: "2026-04-25T14:31:30Z",
            tokens: { input: 20, output: 10, cacheRead: 0, cacheCreate: 0 },
            usd: 0.001,
          },
          implement: {
            status: "completed",
            sessionId: "sess_impl",
            stopReason: "end_turn",
            endedAt: "2026-04-25T14:32:00Z",
            tokens: { input: 50, output: 25, cacheRead: 0, cacheCreate: 0 },
            usd: 0.005,
          },
          "code-reviewing": {
            status: "completed",
            sessionId: "sess_review",
            stopReason: "end_turn",
            endedAt: "2026-04-25T14:33:00Z",
            tokens: { input: 10, output: 5, cacheRead: 0, cacheCreate: 0 },
            usd: 0.002,
          },
          "code-improving": { status: "pending" },
          "auto-commit": { status: "pending" },
        },
      };
      const runDir = seedRunDir(cwd, state);
      // Note: NO 04-code-review.md on disk — that's the failure mode AC-13
      // pins.

      const recording = recordingScriptedQuery([]);
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd, config: cfg },
        buildDeps(recording, recordingCommit()),
      );

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.failedStageId).toBe("code-improving");

      const persisted = JSON.parse(
        readFileSync(join(runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages["code-improving"].status).toBe("failed");
      expect(persisted.stages["code-improving"].stopReason).toBe(
        "missing_review_artifact",
      );
      expect(persisted.stages["code-improving"].error).toMatch(
        /code-reviewing artifact missing/,
      );
      // Zero SDK calls — neither stage 4 nor stage 5 fire.
      expect(recording.calls.length).toBe(0);
      // No 05-code-improve.md or 06-commit.txt.
      expect(existsSync(join(runDir, "06-commit.txt"))).toBe(false);
    });
  });
});

describe("S-003 AC-12: cancelled code-improving advance behaves identically to failed", () => {
  it("cancelled code-improving on advance → same shape as AC-11", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state = stateWithCancelledImprove();
      const runDir = seedRunDir(cwd, state);
      writeFileSync(join(runDir, "04-code-review.md"), REVIEW_PROCEED, "utf8");
      writeFileSync(join(runDir, "05-code-improve.md"), "## partial\n", "utf8");
      const stateBefore = JSON.parse(
        readFileSync(join(runDir, "state.json"), "utf8"),
      );
      const recording = recordingScriptedQuery([]);
      const reporter = new RecordingReporter();
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd },
        buildDeps(recording, recordingCommit(), reporter),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.failedStageId).toBe("code-improving");
      expect(result.status).toBe("failed");
      expect(result.reason).toMatch(
        /code-improving.*recoverable.*praxis retry/,
      );
      expect(recording.calls.length).toBe(0);
      const stateAfter = JSON.parse(
        readFileSync(join(runDir, "state.json"), "utf8"),
      );
      expect(stateAfter).toEqual(stateBefore);
      const runDone = reporter.calls.filter((c) => c.kind === "runDone");
      expect(runDone.length).toBe(1);
      expect(runDone[0].kind === "runDone" && runDone[0].summary.status).toBe(
        "failed",
      );
    });
  });
});

describe("S-003 AC-11: praxis advance against failed code-improving is rejected — only praxis retry can recover it", () => {
  it("failed code-improving on advance → ok:false, reason names 'praxis retry', failedStageId='code-improving', status='failed', no SDK call, state untouched, runDone fires once with failed", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state = stateWithFailedImprove();
      const runDir = seedRunDir(cwd, state);
      // Both review + improve artifacts on disk so the test isolates the
      // advance branch — not artifact-missing.
      writeFileSync(join(runDir, "04-code-review.md"), REVIEW_PROCEED, "utf8");
      writeFileSync(join(runDir, "05-code-improve.md"), "## partial\n", "utf8");
      const stateBefore = JSON.parse(
        readFileSync(join(runDir, "state.json"), "utf8"),
      );

      const recording = recordingScriptedQuery([]);
      const reporter = new RecordingReporter();
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd },
        buildDeps(recording, recordingCommit(), reporter),
      );

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.failedStageId).toBe("code-improving");
      expect(result.status).toBe("failed");
      expect(result.reason).toMatch(
        /code-improving.*recoverable.*praxis retry/,
      );
      // Zero SDK calls.
      expect(recording.calls.length).toBe(0);

      // state.json untouched.
      const stateAfter = JSON.parse(
        readFileSync(join(runDir, "state.json"), "utf8"),
      );
      expect(stateAfter).toEqual(stateBefore);

      // runDone fired exactly once with status=failed.
      const runDone = reporter.calls.filter((c) => c.kind === "runDone");
      expect(runDone.length).toBe(1);
      expect(runDone[0].kind === "runDone" && runDone[0].summary.status).toBe(
        "failed",
      );
    });
  });
});

describe("S-003 AC-10: cancelled code-reviewing recovery identical to failed", () => {
  it("cancelled stage 3 with valid hand-edited artifact (proceed) → stages 4,5 dispatch identically to AC-8", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state = stateWithCancelledReview();
      const runDir = seedRunDir(cwd, state);
      writeFileSync(join(runDir, "04-code-review.md"), REVIEW_PROCEED, "utf8");

      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_improve", IMPROVE_LOG) }],
        [{ messages: stageMessages("sess_commit", "feat: x") }],
      ]);
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd },
        buildDeps(recording, recordingCommit()),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      expect(recording.calls.length).toBe(2);
      const persisted = JSON.parse(
        readFileSync(join(runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages["code-reviewing"].status).toBe("completed");
      expect(persisted.stages["code-reviewing"].stopReason).toBe("recovered");
      expect(persisted.stages["code-improving"].status).toBe("completed");
      expect(persisted.stages["auto-commit"].status).toBe("completed");
    });
  });
});

describe("S-003 AC-9: praxis advance on failed code-reviewing with hand-edited skip-improve artifact", () => {
  it("hand-edited 04-code-review.md with decision=skip-improve → stage 4 skipped-trivial, stage 5 still runs, recording.calls.length === 1 (only stage 5)", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state = stateWithFailedReview();
      const runDir = seedRunDir(cwd, state);
      writeFileSync(
        join(runDir, "04-code-review.md"),
        REVIEW_SKIP_IMPROVE,
        "utf8",
      );

      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_commit", "feat: x") }],
      ]);
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd },
        buildDeps(recording, recordingCommit()),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      // Only stage 5 dispatched the SDK; stage 4 was decision-skipped.
      expect(recording.calls.length).toBe(1);

      const persisted = JSON.parse(
        readFileSync(join(runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages["code-reviewing"].status).toBe("completed");
      expect(persisted.stages["code-reviewing"].stopReason).toBe("recovered");
      expect(persisted.stages["code-improving"].status).toBe("completed");
      expect(persisted.stages["code-improving"].stopReason).toBe(
        "skipped-trivial",
      );
      expect(persisted.stages["auto-commit"].status).toBe("completed");

      // No 05-code-improve.md.
      expect(existsSync(join(runDir, "05-code-improve.md"))).toBe(false);
    });
  });
});

describe("S-003 AC-8: praxis advance recovers failed code-reviewing with valid hand-edited artifact (proceed)", () => {
  it("hand-edited 04-code-review.md with decision=proceed → stage 3 flips to completed/recovered; stages 4,5 dispatch; recording.calls.length === 2", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const state = stateWithFailedReview();
      const runDir = seedRunDir(cwd, state);
      writeFileSync(join(runDir, "04-code-review.md"), REVIEW_PROCEED, "utf8");

      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_improve", IMPROVE_LOG) }],
        [{ messages: stageMessages("sess_commit", "feat: x") }],
      ]);
      const result = await advanceWorkflow(
        RUN_ID,
        { cwd },
        buildDeps(recording, recordingCommit()),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      // Only stages 4 and 5 dispatched the SDK.
      expect(recording.calls.length).toBe(2);

      const persisted = JSON.parse(
        readFileSync(join(runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages["code-reviewing"].status).toBe("completed");
      expect(persisted.stages["code-reviewing"].stopReason).toBe("recovered");
      expect(persisted.stages["code-improving"].status).toBe("completed");
      expect(persisted.stages["auto-commit"].status).toBe("completed");
    });
  });
});

describe("S-003 AC-7: validator terminal failure on code-reviewing", () => {
  it("two bad reviews → terminal validator failure on stage 3; partial 04-code-review.md written; stages 4,5 not invoked; failedStageId === 'code-reviewing'", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const badReview = "# Some body\n\n(no Decision H2)\n";
      function badReviewMessages(sessionId: string): SdkMessage[] {
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
            message: { content: [{ type: "text", text: badReview }] },
          },
          {
            type: "result",
            subtype: "success",
            stop_reason: "end_turn",
            total_cost_usd: 0.001,
            usage: {
              input_tokens: 5,
              output_tokens: 3,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
            num_turns: 1,
            session_id: sessionId,
          },
        ];
      }
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        // S-2: sketching-design runs between clarify-assess and implement.
        [{ messages: stageMessages("sess_sketch", "## Sketch\n\nok\n") }],
        [{ messages: stageMessages("sess_impl", "log\n") }],
        // Stage 4 (was 3): bad first attempt + bad retry → terminal validator failure.
        [
          { messages: badReviewMessages("sess_bad1") },
          { messages: badReviewMessages("sess_bad2") },
        ],
        // Stages 5 and 6 must NOT fire.
      ]);
      const commit = recordingCommit();
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, noPause: true },
        buildDeps(recording, commit),
      );

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.failedStageId).toBe("code-reviewing");
      expect(result.status).toBe("failed");
      // S-2: four SDK invocations now — clarify-assess, sketching-design,
      // implement, code-reviewing.
      expect(recording.calls.length).toBe(4);
      // Stages 5 and 6 not invoked.
      expect(commit.calls.length).toBe(0);

      // Partial 04-code-review.md written verbatim (the bad agent message).
      expect(
        readFileSync(join(result.runDir!, "04-code-review.md"), "utf8"),
      ).toBe(badReview);
      // No 05-code-improve.md, no 06-commit.txt.
      expect(existsSync(join(result.runDir!, "05-code-improve.md"))).toBe(
        false,
      );
      expect(existsSync(join(result.runDir!, "06-commit.txt"))).toBe(false);

      const persisted = JSON.parse(
        readFileSync(join(result.runDir!, "state.json"), "utf8"),
      );
      expect(persisted.stages["code-reviewing"].status).toBe("failed");
      expect(persisted.stages["code-reviewing"].stopReason).toBe(
        "validator_failed",
      );
      expect(persisted.stages["code-improving"].status).toBe("pending");
      expect(persisted.stages["auto-commit"].status).toBe("pending");
    });
  });
});

describe("S-003 AC-6: validator corrective retry on code-reviewing succeeds; downstream proceeds", () => {
  it("first attempt missing Decision H2 → one pushUserMessage → retry passes; recording.calls[2].pushedUserMessages.length === 1; stages 4,5 dispatch", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const badReview = "# Some body\n\n(no Decision H2)\n";
      const reviewFirstAttempt: SdkMessage[] = [
        {
          type: "system",
          subtype: "init",
          session_id: "sess_review_bad",
          model: "claude-test",
        },
        {
          type: "assistant",
          session_id: "sess_review_bad",
          message: { content: [{ type: "text", text: badReview }] },
        },
        {
          type: "result",
          subtype: "success",
          stop_reason: "end_turn",
          total_cost_usd: 0.001,
          usage: {
            input_tokens: 5,
            output_tokens: 3,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
          num_turns: 1,
          session_id: "sess_review_bad",
        },
      ];
      const reviewRetryAttempt: SdkMessage[] = [
        {
          type: "assistant",
          session_id: "sess_review_ok",
          message: { content: [{ type: "text", text: REVIEW_PROCEED }] },
        },
        {
          type: "result",
          subtype: "success",
          stop_reason: "end_turn",
          total_cost_usd: 0.001,
          usage: {
            input_tokens: 8,
            output_tokens: 4,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
          num_turns: 2,
          session_id: "sess_review_ok",
        },
      ];

      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        // S-2: sketching-design between clarify-assess and implement.
        [{ messages: stageMessages("sess_sketch", "## Sketch\n\nok\n") }],
        [{ messages: stageMessages("sess_impl", "log\n") }],
        // Stage 4: bad first attempt + retry-after-pushUserMessage.
        [{ messages: reviewFirstAttempt }, { messages: reviewRetryAttempt }],
        [{ messages: stageMessages("sess_improve", IMPROVE_LOG) }],
        [{ messages: stageMessages("sess_commit", "feat: x") }],
      ]);
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, noPause: true },
        buildDeps(recording, recordingCommit()),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      // S-2: six SDK calls total. The corrective pushUserMessage lands on the
      // code-reviewing call, which is now index 3 (clarify, sketch, implement,
      // review).
      expect(recording.calls.length).toBe(6);
      expect(recording.calls[3].pushedUserMessages.length).toBe(1);

      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages["code-reviewing"].status).toBe("completed");
      expect(persisted.stages["code-reviewing"].sessionId).toBe(
        "sess_review_ok",
      );
      // Downstream stages dispatched.
      expect(persisted.stages["code-improving"].status).toBe("completed");
      expect(persisted.stages["auto-commit"].status).toBe("completed");
    });
  });
});

describe("S-003 AC-4: decision=skip-improve skips code-improving but still runs auto-commit", () => {
  it("dirty tree + REVIEW_SKIP_IMPROVE → code-improving skipped-trivial, no 05-code-improve.md, auto-commit still runs, recording.calls.length === 5 (no SDK call for code-improving)", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        // S-2: sketching-design.
        [{ messages: stageMessages("sess_sketch", "## Sketch\n\nok\n") }],
        [{ messages: stageMessages("sess_impl", "log\n") }],
        [{ messages: stageMessages("sess_review", REVIEW_SKIP_IMPROVE) }],
        // code-improving is decision-skipped — NO script for it.
        [{ messages: stageMessages("sess_commit", "feat: x") }],
      ]);
      const commit = recordingCommit();
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, noPause: true },
        buildDeps(recording, commit),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      // S-2: five SDK invocations — clarify, sketch, implement, review,
      // auto-commit. code-improving SDK call short-circuited.
      expect(recording.calls.length).toBe(5);

      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      const ci = persisted.stages["code-improving"];
      expect(ci.status).toBe("completed");
      expect(ci.stopReason).toBe("skipped-trivial");
      expect(ci.sessionId).toBeUndefined();
      expect(ci.tokens).toBeUndefined();
      expect(ci.usd).toBeUndefined();

      // No 05-code-improve.md — we never produced an agent message.
      expect(existsSync(join(result.runDir, "05-code-improve.md"))).toBe(false);

      // Auto-commit still ran (one deps.commit hand-off + a 06-commit.txt).
      expect(commit.calls.length).toBe(1);
      expect(persisted.stages["auto-commit"].status).toBe("completed");
      expect(existsSync(join(result.runDir, "06-commit.txt"))).toBe(true);
    });
  });
});

describe("S-006: skip-improve stageEnd carries stopReason='skipped-trivial' to the reporter", () => {
  it("recording reporter sees stopReason='skipped-trivial' on the code-improving stageEnd; clean-tree skips on code-reviewing+auto-commit carry stopReason='skipped'", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        // S-2: sketching-design.
        [{ messages: stageMessages("sess_sketch", "## Sketch\n\nok\n") }],
        [{ messages: stageMessages("sess_impl", "log\n") }],
        [{ messages: stageMessages("sess_review", REVIEW_SKIP_IMPROVE) }],
        // code-improving decision-skipped — no script for it.
        [{ messages: stageMessages("sess_commit", "feat: x") }],
      ]);
      const reporter = new RecordingReporter();
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, noPause: true },
        buildDeps(recording, recordingCommit(), reporter),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      const stageEnds = reporter.calls.flatMap((c) =>
        c.kind === "stageEnd" ? [c] : [],
      );
      const ciEnd = stageEnds.find((c) => c.stageId === "code-improving");
      expect(ciEnd?.result.stopReason).toBe("skipped-trivial");
      expect(ciEnd?.result.ok).toBe(true);
      // Sanity: a normal stageEnd (clarify-assess) does not carry a stopReason.
      const clarifyEnd = stageEnds.find((c) => c.stageId === "clarify-assess");
      expect(clarifyEnd?.result.stopReason).toBeUndefined();
    });
  });
});

describe("S-003 AC-3: decision=proceed dispatches code-improving normally", () => {
  it("dirty tree + REVIEW_PROCEED → code-improving SDK call happens; review/improve/commit all run; recording.calls.length === 6", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Dirty tree (no baseline commit) — runner appends .praxis/ to
      // .gitignore, leaves it untracked. git status --porcelain is non-empty
      // through every stage entry, so the clean-tree skip block is never
      // taken.
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        // S-2: sketching-design.
        [{ messages: stageMessages("sess_sketch", "## Sketch\n\nok\n") }],
        [{ messages: stageMessages("sess_impl", "log\n") }],
        [{ messages: stageMessages("sess_review", REVIEW_PROCEED) }],
        [{ messages: stageMessages("sess_improve", IMPROVE_LOG) }],
        [{ messages: stageMessages("sess_commit", "feat: x") }],
      ]);
      const commit = recordingCommit();
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, noPause: true },
        buildDeps(recording, commit),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      // S-2: six SDK invocations.
      expect(recording.calls.length).toBe(6);
      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages["code-reviewing"].status).toBe("completed");
      expect(persisted.stages["code-reviewing"].stopReason).toBe("end_turn");
      expect(persisted.stages["code-improving"].status).toBe("completed");
      expect(persisted.stages["code-improving"].stopReason).toBe("end_turn");
      // Both artifacts written.
      expect(
        readFileSync(join(result.runDir, "04-code-review.md"), "utf8"),
      ).toBe(REVIEW_PROCEED);
      expect(
        readFileSync(join(result.runDir, "05-code-improve.md"), "utf8"),
      ).toBe(IMPROVE_LOG);
    });
  });
});

describe("S-003 AC-2: cascading clean-tree skip uses 'skipped' (not 'skipped-trivial')", () => {
  it("code-improving stopReason on cascading skip is 'skipped' — the 'skipped-trivial' token is reserved for decision-driven skips", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      seedCleanRepo(cwd);
      // S-2: sketching-design runs even on a clean tree (AC-8: not in the
      // clean-tree skip set), so three SDK calls fire before the clean-tree
      // cascade kicks in at code-reviewing.
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        [{ messages: stageMessages("sess_sketch", "## Sketch\n\nok\n") }],
        [{ messages: stageMessages("sess_impl", "log\n") }],
      ]);
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, noPause: true },
        buildDeps(recording, recordingCommit()),
      );
      if (!result.ok) throw new Error(result.reason);

      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages["code-improving"].stopReason).toBe("skipped");
      expect(persisted.stages["code-improving"].stopReason).not.toBe(
        "skipped-trivial",
      );
    });
  });
});

// S-2 AC-8: sketching-design is NOT in `maybeSkipCleanTree`'s eligibility set
// (which is still only [auto-commit, code-reviewing, code-improving]), so even
// on a perfectly clean tree the SDK fires for sketching-design, an artifact
// is written, and stage state is `completed`/`stopReason: "end_turn"` — not
// `skipped`. The clean-tree cascade still applies to code-reviewing onward
// (covered by S-003 AC-1 below).
describe("S-2 AC-8: sketching-design runs even on a clean tree", () => {
  it("clean tree at sketching-design entry → sketching-design dispatches the SDK; stage state is completed/end_turn, NOT skipped; artifact 02-sketching-design.md exists", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      seedCleanRepo(cwd);
      const sketchText = "## Sketch\n\n- pick file X\n";
      // Script all three stages that DO dispatch under a clean tree:
      // clarify-assess, sketching-design, and implement. The trailing three
      // (code-reviewing, code-improving, auto-commit) cascade-skip on the
      // still-clean tree.
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        [{ messages: stageMessages("sess_sketch", sketchText) }],
        [{ messages: stageMessages("sess_impl", "log\n") }],
      ]);
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, noPause: true },
        buildDeps(recording, recordingCommit()),
      );
      if (!result.ok) throw new Error(result.reason);

      // sketching-design's SDK call DID fire (call 2 of 3).
      expect(recording.calls.length).toBe(3);
      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      const sd = persisted.stages["sketching-design"];
      expect(sd.status).toBe("completed");
      // Crucially: NOT "skipped" / "skipped-trivial" — the SDK actually ran.
      expect(sd.stopReason).toBe("end_turn");
      expect(sd.sessionId).toBe("sess_sketch");
      expect(sd.tokens).toBeDefined();
      // The artifact landed verbatim.
      expect(
        readFileSync(join(result.runDir, "02-sketching-design.md"), "utf8"),
      ).toBe(sketchText);
    });
  });
});

describe("S-003 AC-1: clean tree at code-reviewing entry skips code-reviewing, code-improving, auto-commit", () => {
  it("clean tree before code-reviewing → those three stages all completed/skipped, three SDK calls (clarify-assess + sketching-design + implement)", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      seedCleanRepo(cwd);
      // S-2: sketching-design runs even on a clean tree (AC-8: not in the
      // clean-tree skip set).
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        [{ messages: stageMessages("sess_sketch", "## Sketch\n\nok\n") }],
        [{ messages: stageMessages("sess_impl", "log\n") }],
      ]);
      const commit = recordingCommit();
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, noPause: true },
        buildDeps(recording, commit),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      // S-2: three SDK invocations — clarify, sketch, implement. Stages
      // code-reviewing/code-improving/auto-commit cascade-skip on clean tree.
      expect(recording.calls.length).toBe(3);
      // Auto-commit hand-off skipped too.
      expect(commit.calls.length).toBe(0);

      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      const cr = persisted.stages["code-reviewing"];
      const ci = persisted.stages["code-improving"];
      const ac = persisted.stages["auto-commit"];
      expect(cr.status).toBe("completed");
      expect(cr.stopReason).toBe("skipped");
      expect(ci.status).toBe("completed");
      expect(ci.stopReason).toBe("skipped");
      expect(ac.status).toBe("completed");
      expect(ac.stopReason).toBe("skipped");

      // No artifacts produced for skipped stages.
      expect(existsSync(join(result.runDir, "04-code-review.md"))).toBe(false);
      expect(existsSync(join(result.runDir, "05-code-improve.md"))).toBe(false);
      expect(existsSync(join(result.runDir, "06-commit.txt"))).toBe(false);
    });
  });
});
