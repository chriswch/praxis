import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commit as productionCommit } from "../../src/git/commit.js";
import { LineReporter } from "../../src/ui/line-reporter.js";
import { retryWorkflow, runWorkflow } from "../../src/workflow/runner.js";
import type {
  CreateQueryFn,
  Deps,
  SdkMessage,
} from "../../src/workflow/stage.js";
import {
  hangingQuery,
  type RecordingCreateQueryFn,
  recordingScriptedQuery,
} from "../support/scripted-query.js";
import { withTempRepo } from "../support/tmp-repo.js";

/**
 * S-008 (scripted-SDK e2e): the milestone test inventory called for an
 * end-to-end run that fails `code-improving` on the first pass and lands a
 * real commit after `praxis retry` resumes. Real git, real fs, real
 * `commit()`; SDK is the only seam that's stubbed.
 */

const VALID_CLARIFY = `## Intent\n\nadd a logout button.\n\n## Assumptions\n\n- auth ctx is present\n\n## Gaps\n\n- none\n\n## Plan\n\n1. wire — surfaces logout\n\n## Acceptance\n\n- posts /logout and redirects home\n`;

const REVIEW_PROCEED = `# Review\n\nNo blocking issues.\n\n## Decision\n\nproceed\n`;

const IMPROVE_LOG = `## Improvement summary\n\n- tightened error handling\n`;

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

/**
 * Implement-stage script that ALSO writes a real file inside the repo via the
 * test's filesystem before yielding the assistant text. This simulates the
 * SDK's tool side-effects so the working tree is dirty by the time
 * code-reviewing runs.
 */
function implementWithSideEffect(
  cwd: string,
  filename: string,
  contents: string,
  sessionId = "sess_impl",
): CreateQueryFn {
  let invoked = false;
  return (_input) => {
    return {
      pushUserMessage() {},
      stream: (async function* () {
        if (!invoked) {
          invoked = true;
          mkdirSync(join(cwd, filename, ".."), { recursive: true });
          writeFileSync(join(cwd, filename), contents, "utf8");
        }
        for (const m of stageMessages(
          sessionId,
          "## Files changed\n\n- src/Foo.tsx\n",
        )) {
          yield m;
        }
      })(),
    };
  };
}

function buildDeps(createQueryFn: CreateQueryFn): Deps {
  return {
    clock: () => new Date("2026-04-25T14:35:00Z"),
    rng: (n) => new Uint8Array([0x7a, 0xf2]).slice(0, n),
    createQueryFn,
    reporter: new LineReporter(),
    commit: productionCommit,
  };
}

describe("praxis run --no-pause then praxis retry lands one real commit (S-008)", () => {
  it("first run cancels code-improving via SIGINT; retry resumes the prior session, drives auto-commit, and HEAD advances by exactly one commit", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Baseline so HEAD exists pre-retry.
      writeFileSync(join(cwd, "README.md"), "baseline\n", "utf8");
      spawnSync("git", ["add", "README.md"], { cwd });
      spawnSync("git", ["commit", "-m", "baseline"], { cwd });
      const baselineSha = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd,
        encoding: "utf8",
      }).stdout.trim();

      // FIRST PASS: clarify-assess → implement (mutates fs) → code-reviewing
      // (proceed) → code-improving HANGS, then SIGINT marks it cancelled.
      // Stage 5 never runs.
      let firstCall = 0;
      const clarifyFirst = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY) }],
      ]);
      const implementFirst = implementWithSideEffect(
        cwd,
        "src/Foo.tsx",
        "export function Logout() { return null; }\n",
      );
      const reviewFirst = recordingScriptedQuery([
        [{ messages: stageMessages("sess_review", REVIEW_PROCEED) }],
      ]);
      const improveHanging = hangingQuery("sess_improve_first");
      const firstCreateQueryFn: CreateQueryFn = (input) => {
        firstCall++;
        if (firstCall === 1) return clarifyFirst(input);
        if (firstCall === 2) return implementFirst(input);
        if (firstCall === 3) return reviewFirst(input);
        if (firstCall === 4) return improveHanging(input);
        throw new Error(`unexpected SDK call ${firstCall} in first pass`);
      };

      // Abort during code-improving (call #4). SIGINT marks the stage
      // cancelled and stops the run before auto-commit.
      const ctl = new AbortController();
      setTimeout(() => ctl.abort(), 50);

      const firstResult = await runWorkflow(
        {
          intent: "add a logout button",
          cwd,
          noPause: true,
          signal: ctl.signal,
        },
        buildDeps(firstCreateQueryFn),
      );
      expect(firstResult.ok).toBe(false);
      if (firstResult.ok) throw new Error("unreachable");
      expect(firstResult.failedStageId).toBe("code-improving");
      expect(firstResult.status).toBe("cancelled");

      // Persisted state shows code-improving cancelled with the prior sessionId.
      const runDir = firstResult.runDir;
      if (!runDir) throw new Error("missing runDir");
      const stateAfterFail = JSON.parse(
        readFileSync(join(runDir, "state.json"), "utf8"),
      );
      expect(stateAfterFail.stages["code-improving"].status).toBe("cancelled");
      expect(stateAfterFail.stages["code-improving"].sessionId).toBe(
        "sess_improve_first",
      );
      // No commit yet.
      expect(
        spawnSync("git", ["rev-parse", "HEAD"], {
          cwd,
          encoding: "utf8",
        }).stdout.trim(),
      ).toBe(baselineSha);

      // SECOND PASS (retry): code-improving resumes successfully; auto-commit
      // runs against the still-dirty tree and lands a real commit.
      let retryCall = 0;
      const improveResumeRecorder = recordingScriptedQuery([
        [{ messages: stageMessages("sess_improve_retry", IMPROVE_LOG) }],
      ]) as RecordingCreateQueryFn;
      const commitRecorder = recordingScriptedQuery([
        [{ messages: stageMessages("sess_commit", "feat: add logout button") }],
      ]);
      const retryCreateQueryFn: CreateQueryFn = (input) => {
        retryCall++;
        if (retryCall === 1) return improveResumeRecorder(input);
        if (retryCall === 2) return commitRecorder(input);
        throw new Error(`unexpected SDK call ${retryCall} in retry pass`);
      };

      const retryResult = await retryWorkflow(
        firstResult.runId ?? "",
        { cwd, noPause: true },
        buildDeps(retryCreateQueryFn),
      );
      if (!retryResult.ok) {
        throw new Error(`expected ok, got ${retryResult.reason}`);
      }

      // The retry's first SDK call carried `resume: <prior session id>` and
      // `initialUserPrompt: "continue"` — the load-bearing assertion of S-005.
      expect(improveResumeRecorder.calls.length).toBe(1);
      expect(improveResumeRecorder.calls[0].input.resume).toBe(
        "sess_improve_first",
      );
      expect(improveResumeRecorder.calls[0].input.initialUserPrompt).toBe(
        "continue",
      );

      // HEAD advanced by exactly one commit.
      const newHead = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd,
        encoding: "utf8",
      }).stdout.trim();
      expect(newHead).not.toBe(baselineSha);
      expect(
        spawnSync("git", ["rev-parse", "HEAD~1"], {
          cwd,
          encoding: "utf8",
        }).stdout.trim(),
      ).toBe(baselineSha);
      expect(
        spawnSync("git", ["log", "-1", "--pretty=%s"], {
          cwd,
          encoding: "utf8",
        }).stdout.trim(),
      ).toBe("feat: add logout button");

      // state.json reflects retryAttempts === 1, accumulated tokens, and the
      // new SHA on auto-commit.
      const finalState = JSON.parse(
        readFileSync(join(runDir, "state.json"), "utf8"),
      );
      expect(finalState.stages["code-improving"].status).toBe("completed");
      expect(finalState.stages["code-improving"].retryAttempts).toBe(1);
      // sessionId rotated to the retry's id (if SDK reported one) or held the
      // prior id; either way, non-empty.
      expect(finalState.stages["code-improving"].sessionId).toBeTruthy();
      expect(finalState.stages["auto-commit"].status).toBe("completed");
      expect(finalState.stages["auto-commit"].commitSha).toBe(newHead);

      // 05-commit.txt is the SHA-prefixed form.
      expect(readFileSync(join(runDir, "05-commit.txt"), "utf8")).toBe(
        `${newHead}\n\nfeat: add logout button\n`,
      );
      // 04-code-improve.md holds the retry's improvement summary.
      expect(readFileSync(join(runDir, "04-code-improve.md"), "utf8")).toBe(
        IMPROVE_LOG,
      );
      // The implement-stage side-effect file landed in the commit.
      expect(existsSync(join(cwd, "src/Foo.tsx"))).toBe(true);
    });
  });
});
