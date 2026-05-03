import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runRetry, runRun } from "../../src/cli.js";
import { commit as productionCommit } from "../../src/git/commit.js";
import { LineReporter } from "../../src/ui/line-reporter.js";
import { readChainLedger } from "../../src/workflow/chain.js";
import {
  appendPraxisToGitignore,
  runPreflight,
} from "../../src/workflow/preflight.js";
import type {
  CreateQueryFn,
  Deps,
  SdkMessage,
} from "../../src/workflow/stage.js";
import { hangingQuery } from "../support/scripted-query.js";
import { withTempRepo } from "../support/tmp-repo.js";

/**
 * S-005 e2e — `praxis run --iterations N --no-pause`, with iter 1's
 * `code-improving` failed via SIGINT, then `praxis retry` lands the
 * resume + auto-commit AND triggers the chain-aware tail to auto-launch
 * iter 2 through the same `runWorkflow` entry point. Real git, real fs,
 * real chain ledger I/O — only the SDK is stubbed.
 *
 * Coverage map:
 *   - AC-S5-1: state.chainId round-trips: a chain-bound retry resumes the
 *     failed iter AND fires the chain-aware tail (the auto-launched iter 2
 *     proves it).
 *   - AC-S5-2 (happy path) — failed iter 1 → retry completes iter 1 →
 *     iter 2 launches and runs to completion → chain ends 'completed'.
 *
 * Pattern mirrors `tests/e2e/advance-chain.test.ts` — same scripted 7-stage
 * shape per iteration, but iter 1's code-improving call hangs (SIGINT
 * cancels it) so the retry path is exercised on the way to chain completion.
 */

const VALID_CLARIFY = `## Intent

ship the retry-chain test.

## Assumptions

- ok

## Gaps

- none

## Plan

1. wire — surfaces ok

## Acceptance

- it works
`;

const REVIEW_PROCEED = `# Review

No blocking issues.

## Decision

proceed
`;

const IMPROVE_LOG = `## Improvement summary

- no fixes needed
`;

const VERIFY_OK = `## Verification

ok
`;

const SKETCH_OK = `## Sketch

ok
`;

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
      total_cost_usd: 0,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      num_turns: 1,
      session_id: sessionId,
    },
  ];
}

/**
 * `runRun` consumes one clock+rng pair for the chainId and another per
 * iteration's runId. Tick the clock by 1 minute on every call AND advance
 * the rng so every id stays globally unique through `formatRunId`.
 */
function buildDeps(createQueryFn: CreateQueryFn): Deps {
  let nowMs = new Date("2026-05-02T14:30:00Z").getTime();
  let rngCounter = 0x10;
  return {
    clock: () => {
      const d = new Date(nowMs);
      nowMs += 60_000;
      return d;
    },
    rng: (n) => {
      rngCounter += 1;
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i += 1) bytes[i] = (rngCounter + i) & 0xff;
      return bytes;
    },
    createQueryFn,
    reporter: new LineReporter(),
    commit: productionCommit,
    runPreflight,
    appendPraxisToGitignore,
  };
}

describe("praxis run --iterations + praxis retry auto-launch (S-005 AC-S5-1, AC-S5-2)", () => {
  it("failed iter 1 → retry resumes code-improving AND auto-launches iter 2; both reach completed; chain ends 'completed'", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Drive `praxis run --iterations 2 --no-pause`. Iter 1 runs through
      // clarify-assess → sketching-design → driving-tdd (which commits a
      // marker file so HEAD advances) → code-reviewing → code-improving,
      // which HANGS — SIGINT marks it cancelled and aborts iter 1 before
      // the trailing stages run. The chain ledger holds iter 1 'running'.
      let firstCall = 0;
      const firstPassQuery: CreateQueryFn = (input) => {
        const idx = firstCall++;
        if (idx === 0) {
          // clarify-assess
          return scriptedFromMessages(
            stageMessages("sess_clarify_iter1", VALID_CLARIFY),
            input.signal,
          );
        }
        if (idx === 1) {
          // sketching-design
          return scriptedFromMessages(
            stageMessages("sess_sketch_iter1", SKETCH_OK),
            input.signal,
          );
        }
        if (idx === 2) {
          // driving-tdd: drop a tracked + committed marker so HEAD advances.
          // Also drop a SECOND uncommitted file so production auto-commit
          // (post-retry) has something to capture in its real commit.
          writeFileSync(
            join(cwd, "iter1-marker.txt"),
            "marker iter 1\n",
            "utf8",
          );
          spawnSync("git", ["add", "iter1-marker.txt"], { cwd });
          spawnSync("git", ["commit", "-m", "tdd-marker iter 1"], { cwd });
          writeFileSync(join(cwd, "iter1-extra.txt"), "extra iter 1\n", "utf8");
          return scriptedFromMessages(
            stageMessages("sess_tdd_iter1", "## TDD iter1\n\ndriven\n"),
            input.signal,
          );
        }
        if (idx === 3) {
          // code-reviewing
          return scriptedFromMessages(
            stageMessages("sess_review_iter1", REVIEW_PROCEED),
            input.signal,
          );
        }
        if (idx === 4) {
          // code-improving — hangs until SIGINT.
          return hangingQuery("sess_improve_iter1_first")(input);
        }
        throw new Error(`unexpected first-pass SDK call ${idx}`);
      };

      const ctl = new AbortController();
      // SIGINT trips after enough wall-clock for stages 1-4 to land. Tuned
      // generously so flaky CI doesn't fire it before driving-tdd commits.
      setTimeout(() => ctl.abort(), 200);

      const r1 = await runRun(
        {
          intent: "ship the retry-chain test",
          allowDirty: true,
          noPause: true,
          iterations: 2,
        },
        cwd,
        ctl.signal,
        buildDeps(firstPassQuery),
      );
      expect(r1.ok).toBe(false);
      if (r1.ok) throw new Error("expected first-pass to fail");
      expect(r1.failedStageId).toBe("code-improving");
      expect(r1.status).toBe("cancelled");

      // Locate the chain ledger and iter-1's runId.
      const chainsDir = join(cwd, ".praxis", "chains");
      const chainFiles = readdirSync(chainsDir).filter((f) =>
        f.endsWith(".json"),
      );
      expect(chainFiles).toHaveLength(1);
      const chainId = chainFiles[0].replace(/\.json$/, "");
      const midRead = readChainLedger(cwd, chainId);
      if (!midRead.ok) throw new Error(midRead.reason);
      expect(midRead.ledger.status).toBe("in_progress");
      expect(midRead.ledger.iterations).toHaveLength(1);
      // Iteration 1 entry was written 'running' on stage 1 dispatch and never
      // patched (the runner's success-return path didn't fire — code-improving
      // was cancelled). It stays 'running'.
      expect(midRead.ledger.iterations[0].status).toBe("running");
      const iter1RunId = midRead.ledger.iterations[0].runId;
      expect(iter1RunId).toBe(r1.runId);

      // Second pass (retry + auto-launched iter 2): retry resumes
      // code-improving (call 0), runs verifying-and-adapting (call 1),
      // auto-commit (call 2). Then the chain-aware tail auto-launches
      // iter 2's full 7-stage workflow (calls 3–9).
      let retryCall = 0;
      const retryPassQuery: CreateQueryFn = (input) => {
        const idx = retryCall++;
        if (idx === 0) {
          return scriptedFromMessages(
            stageMessages("sess_improve_iter1_retry", IMPROVE_LOG),
            input.signal,
          );
        }
        if (idx === 1) {
          return scriptedFromMessages(
            stageMessages("sess_verify_iter1", VERIFY_OK),
            input.signal,
          );
        }
        if (idx === 2) {
          return scriptedFromMessages(
            stageMessages("sess_commit_iter1", "feat: ship iter 1"),
            input.signal,
          );
        }
        if (idx === 3) {
          return scriptedFromMessages(
            stageMessages("sess_clarify_iter2", VALID_CLARIFY),
            input.signal,
          );
        }
        if (idx === 4) {
          return scriptedFromMessages(
            stageMessages("sess_sketch_iter2", SKETCH_OK),
            input.signal,
          );
        }
        if (idx === 5) {
          // driving-tdd iter 2: same marker pattern.
          writeFileSync(
            join(cwd, "iter2-marker.txt"),
            "marker iter 2\n",
            "utf8",
          );
          spawnSync("git", ["add", "iter2-marker.txt"], { cwd });
          spawnSync("git", ["commit", "-m", "tdd-marker iter 2"], { cwd });
          writeFileSync(join(cwd, "iter2-extra.txt"), "extra iter 2\n", "utf8");
          return scriptedFromMessages(
            stageMessages("sess_tdd_iter2", "## TDD iter2\n\ndriven\n"),
            input.signal,
          );
        }
        if (idx === 6) {
          return scriptedFromMessages(
            stageMessages("sess_review_iter2", REVIEW_PROCEED),
            input.signal,
          );
        }
        if (idx === 7) {
          return scriptedFromMessages(
            stageMessages("sess_improve_iter2", IMPROVE_LOG),
            input.signal,
          );
        }
        if (idx === 8) {
          return scriptedFromMessages(
            stageMessages("sess_verify_iter2", VERIFY_OK),
            input.signal,
          );
        }
        if (idx === 9) {
          return scriptedFromMessages(
            stageMessages("sess_commit_iter2", "feat: ship iter 2"),
            input.signal,
          );
        }
        throw new Error(`unexpected retry-pass SDK call ${idx}`);
      };

      // Need a fresh deps so clock+rng counters reset (otherwise iter 2's
      // stamped runId would conflict with the existing one). buildDeps
      // restarts the clock from 14:30:00Z and rng from 0x10 — but the
      // existing iter 1 run-dir was stamped with rng starting at 0x11, so
      // resetting works as long as the new clock+rng pair doesn't collide.
      // Tick the clock further to keep iter 2's runId distinct.
      const retryDeps = buildDepsAt("2026-05-02T14:40:00Z", retryPassQuery);

      await runRetry(
        { runId: iter1RunId, noPause: true },
        cwd,
        new AbortController().signal,
        retryDeps,
      );

      const final = readChainLedger(cwd, chainId);
      if (!final.ok) throw new Error(final.reason);
      // AC-S5-2 + AC-S5-5: both iterations completed; chain ends 'completed'
      // with iterationsCompleted=2 and 2 distinct runIds carrying real SHAs.
      expect(final.ledger.status).toBe("completed");
      expect(final.ledger.iterationsCompleted).toBe(2);
      expect(final.ledger.iterations).toHaveLength(2);
      for (const e of final.ledger.iterations) {
        expect(e.status).toBe("completed");
        expect(e.commitSha).toMatch(/^[0-9a-f]{40}$/);
      }
      // Both run-dirs landed.
      for (const e of final.ledger.iterations) {
        expect(existsSync(join(cwd, ".praxis", "runs", e.runId))).toBe(true);
      }
    });
  });
});

/**
 * Minimal scripted-from-messages helper that mirrors the production SDK's
 * shape — yields an init message, then the assistant text, then the result
 * message. Stops cleanly if the input.signal aborts mid-stream (so SIGINT
 * tests don't hang).
 */
function scriptedFromMessages(
  messages: SdkMessage[],
  signal: AbortSignal,
): ReturnType<CreateQueryFn> {
  return {
    pushUserMessage() {},
    stream: (async function* () {
      for (const m of messages) {
        if (signal.aborted) return;
        yield m;
      }
    })(),
  };
}

/** Variant of `buildDeps` that accepts a starting wall-clock so the second
 * pass can advance past the first pass's run-id stamps without colliding. */
function buildDepsAt(startIso: string, createQueryFn: CreateQueryFn): Deps {
  let nowMs = new Date(startIso).getTime();
  let rngCounter = 0x80;
  return {
    clock: () => {
      const d = new Date(nowMs);
      nowMs += 60_000;
      return d;
    },
    rng: (n) => {
      rngCounter += 1;
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i += 1) bytes[i] = (rngCounter + i) & 0xff;
      return bytes;
    },
    createQueryFn,
    reporter: new LineReporter(),
    commit: productionCommit,
    runPreflight,
    appendPraxisToGitignore,
  };
}
