import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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

describe("S-003 AC-4: decision=skip-improve skips code-improving but still runs auto-commit", () => {
  it("dirty tree + REVIEW_SKIP_IMPROVE → stage 4 skipped-trivial, no 04-code-improve.md, stage 5 still runs, recording.calls.length === 4 (no SDK call for stage 4)", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
        [{ messages: stageMessages("sess_impl", "log\n") }],
        [{ messages: stageMessages("sess_review", REVIEW_SKIP_IMPROVE) }],
        // Stage 4 (code-improving) is decision-skipped — NO script for it.
        [{ messages: stageMessages("sess_commit", "feat: x") }],
      ]);
      const commit = recordingCommit();
      const result = await runWorkflow(
        { intent: "x", cwd, allowDirty: true, noPause: true },
        buildDeps(recording, commit),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      // Four SDK invocations: 1, 2, 3, 5. Stage 4 SDK call short-circuited.
      expect(recording.calls.length).toBe(4);

      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      const ci = persisted.stages["code-improving"];
      expect(ci.status).toBe("completed");
      expect(ci.stopReason).toBe("skipped-trivial");
      expect(ci.sessionId).toBeUndefined();
      expect(ci.tokens).toBeUndefined();
      expect(ci.usd).toBeUndefined();

      // No 04-code-improve.md — we never produced an agent message.
      expect(existsSync(join(result.runDir, "04-code-improve.md"))).toBe(false);

      // Auto-commit still ran (one deps.commit hand-off + a 05-commit.txt).
      expect(commit.calls.length).toBe(1);
      expect(persisted.stages["auto-commit"].status).toBe("completed");
      expect(existsSync(join(result.runDir, "05-commit.txt"))).toBe(true);
    });
  });
});

describe("S-003 AC-3: decision=proceed dispatches code-improving normally", () => {
  it("dirty tree + REVIEW_PROCEED → stage 4 SDK call happens; stages 4,5 both run; recording.calls.length === 5", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Dirty tree (no baseline commit) — runner appends .praxis/ to
      // .gitignore, leaves it untracked. git status --porcelain is non-empty
      // through every stage entry, so the clean-tree skip block is never
      // taken.
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
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

      // All five SDK invocations made.
      expect(recording.calls.length).toBe(5);
      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages["code-reviewing"].status).toBe("completed");
      expect(persisted.stages["code-reviewing"].stopReason).toBe("end_turn");
      expect(persisted.stages["code-improving"].status).toBe("completed");
      expect(persisted.stages["code-improving"].stopReason).toBe("end_turn");
      // Both artifacts written.
      expect(
        readFileSync(join(result.runDir, "03-code-review.md"), "utf8"),
      ).toBe(REVIEW_PROCEED);
      expect(
        readFileSync(join(result.runDir, "04-code-improve.md"), "utf8"),
      ).toBe(IMPROVE_LOG);
    });
  });
});

describe("S-003 AC-2: cascading clean-tree skip uses 'skipped' (not 'skipped-trivial')", () => {
  it("stage 4 stopReason on cascading skip is 'skipped' — the 'skipped-trivial' token is reserved for decision-driven skips", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      seedCleanRepo(cwd);
      const recording = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY_ARTIFACT) }],
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

describe("S-003 AC-1: clean tree at code-reviewing entry skips stages 3, 4, 5", () => {
  it("clean tree before code-reviewing → stages 3,4,5 all completed/skipped, only 2 SDK calls (clarify-assess + implement)", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      seedCleanRepo(cwd);
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

      // Only two SDK invocations.
      expect(recording.calls.length).toBe(2);
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
      expect(existsSync(join(result.runDir, "03-code-review.md"))).toBe(false);
      expect(existsSync(join(result.runDir, "04-code-improve.md"))).toBe(false);
      expect(existsSync(join(result.runDir, "05-commit.txt"))).toBe(false);
    });
  });
});
