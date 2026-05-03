import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runRun } from "../../src/cli.js";
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
import { recordingScriptedQueryWithCommitOn } from "../support/scripted-query.js";
import { withTempRepo } from "../support/tmp-repo.js";

/**
 * S-003 — `praxis run --iterations <N>` with N > 1 against the real
 * `runWorkflow` (not the runWorkflow injection seam). Exercises the full
 * cross-iteration plumbing:
 *
 *   - AC-S3-1: N distinct run-ids on stdout, one per line.
 *   - AC-S3-2 + AC-S3-13: single ledger with N entries; N distinct run-dirs
 *     under .praxis/runs/.
 *   - AC-S3-3 + AC-S3-12: each iteration's auto-commit SHA becomes the next
 *     iteration's baseline (validated by HEAD walking and per-iteration
 *     `state.baselineSha`).
 *   - AC-S3-4 + AC-S3-10: final ledger status === 'completed',
 *     iterationsCompleted === N.
 *
 * Drives each iteration through the default 7-stage workflow with scripted
 * SDK responses. Each iteration's driving-tdd stage commits a marker file
 * (via `recordingScriptedQueryWithCommitOn`) so HEAD advances past the
 * iteration's baseline — without that, the trailing four stages cascade-skip
 * and `commitSha === undefined` would trip S-3's cascade-skip predicate.
 *
 * The auto-commit stage's hand-off uses the production `commit` from
 * `src/git/commit.ts`, so the chain ledger entries carry real SHAs.
 */

const VALID_CLARIFY = `## Intent

ship the multi-iter test.

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
 * Build the per-iteration script tuple for the default 7-stage workflow.
 * Each iteration has 7 SDK calls in order (clarify → sketch → driving-tdd →
 * code-reviewing → code-improving → verifying-and-adapting → auto-commit).
 *
 * The auto-commit stage's commit message subject embeds the iteration index
 * so the final HEAD walk can verify ordering.
 */
function scriptsForIteration(
  iter: number,
): Array<Array<{ messages: SdkMessage[] }>> {
  const tag = `iter${iter}`;
  return [
    [{ messages: stageMessages(`sess_clarify_${tag}`, VALID_CLARIFY) }],
    [{ messages: stageMessages(`sess_sketch_${tag}`, SKETCH_OK) }],
    [
      {
        messages: stageMessages(`sess_tdd_${tag}`, `## TDD ${tag}\n\ndriven\n`),
      },
    ],
    [{ messages: stageMessages(`sess_review_${tag}`, REVIEW_PROCEED) }],
    [{ messages: stageMessages(`sess_improve_${tag}`, IMPROVE_LOG) }],
    [{ messages: stageMessages(`sess_verify_${tag}`, VERIFY_OK) }],
    [
      {
        messages: stageMessages(
          `sess_commit_${tag}`,
          `feat: ship iteration ${iter}`,
        ),
      },
    ],
  ];
}

/**
 * `runRun` calls `deps.clock()` + `deps.rng(2)` once for the chain-id and
 * once per iteration's run-id. To keep ids globally unique we tick the
 * clock by 1 minute on every call AND increment the rng bytes — both feed
 * `formatRunId` (HHMM + 4-hex-char tail).
 */
function buildDeps(createQueryFn: CreateQueryFn): Deps {
  let nowMs = new Date("2026-05-02T14:30:00Z").getTime();
  let rngCounter = 0x10;
  return {
    clock: () => {
      const d = new Date(nowMs);
      nowMs += 60_000; // tick by one minute per call
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

describe("praxis run --iterations 3 end-to-end (S-003 AC-S3-1..AC-S3-4, AC-S3-12, AC-S3-13)", () => {
  it("runs 3 iterations back-to-back; ledger ends 'completed' with 3 entries; HEAD advances by 3 auto-commits past baseline", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Capture baselineSha (the seed commit from withTempRepo).
      const baselineSha = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd,
        encoding: "utf8",
      }).stdout.trim();

      // 7 stages × 3 iterations = 21 SDK calls. Driving-tdd is call index 2
      // within each iteration; across the chain that is calls 2, 9, 16. Each
      // such call writes + commits a marker file before yielding the scripted
      // result, advancing HEAD past that iteration's baseline so the trailing
      // four stages dispatch (no cascade-skip).
      const allScripts: Array<Array<{ messages: SdkMessage[] }>> = [];
      for (let i = 1; i <= 3; i += 1)
        allScripts.push(...scriptsForIteration(i));

      // Driving-tdd is call index 2 within each iteration; across the 3-iter
      // chain that is calls 2, 9, 16. `recordingScriptedQueryWithCommitOn`
      // takes a single commit-on-call index, so we wrap our own commit-at-
      // multiple-indices CreateQueryFn around an inner recorder that never
      // commits itself (index -1).
      const inner = recordingScriptedQueryWithCommitOn(cwd, -1, allScripts);
      let callCount = 0;
      const commitIndices = new Set([2, 9, 16]);
      const createQueryFn: CreateQueryFn = (input) => {
        const myIdx = callCount++;
        if (commitIndices.has(myIdx)) {
          // Drop a tracked + committed marker so HEAD advances past this
          // iteration's baseline (cascade-skip predicate doesn't fire).
          const filename = `iter-marker-${myIdx}.txt`;
          writeFileSync(
            join(cwd, filename),
            `marker for call ${myIdx}\n`,
            "utf8",
          );
          spawnSync("git", ["add", filename], { cwd });
          spawnSync("git", ["commit", "-m", `tdd-marker-${myIdx}`], { cwd });
          // Drop a SECOND uncommitted file so the production auto-commit at
          // the end of this iteration has something to capture in its real
          // commit (otherwise it returns `{ ok: true, skipped: true }` and
          // S-3 cascade-skip detection would fire).
          writeFileSync(
            join(cwd, `iter-extra-${myIdx}.txt`),
            `extra ${myIdx}\n`,
            "utf8",
          );
        }
        return inner(input);
      };

      // Capture stdout writes so we can assert AC-S3-1: one runId per
      // iteration, in order, on stdout. Restore in finally to avoid leaking
      // the patch into other tests.
      const stdoutChunks: string[] = [];
      const origWrite = process.stdout.write.bind(process.stdout);
      // biome-ignore lint/suspicious/noExplicitAny: minimal patch shape.
      process.stdout.write = ((chunk: any, ...rest: any[]): boolean => {
        stdoutChunks.push(typeof chunk === "string" ? chunk : String(chunk));
        return origWrite(chunk, ...rest);
      }) as typeof process.stdout.write;

      let result: Awaited<ReturnType<typeof runRun>>;
      try {
        result = await runRun(
          {
            intent: "ship the multi-iter test",
            allowDirty: true,
            noPause: true,
            iterations: 3,
          },
          cwd,
          new AbortController().signal,
          buildDeps(createQueryFn),
        );
      } finally {
        process.stdout.write = origWrite;
      }
      expect(result.ok).toBe(true);

      // AC-S3-1: each iteration's runId appears on stdout, one per line, in
      // order. The reporter emits other lines too (run-done summaries); we
      // search for the runId tokens in order without matching the whole line.
      const stdout = stdoutChunks.join("");
      const runIdsOnStdout: string[] = [];
      for (const line of stdout.split("\n")) {
        const trimmed = line.trim();
        if (/^\d{4}-\d{2}-\d{2}-\d{4}-[0-9a-f]{4}$/.test(trimmed)) {
          runIdsOnStdout.push(trimmed);
        }
      }
      expect(runIdsOnStdout).toHaveLength(3);

      // Single chain ledger written.
      const chainsDir = join(cwd, ".praxis", "chains");
      expect(existsSync(chainsDir)).toBe(true);
      const chainFiles = readdirSync(chainsDir).filter((f) =>
        f.endsWith(".json"),
      );
      expect(chainFiles).toHaveLength(1);
      const chainId = chainFiles[0].replace(/\.json$/, "");

      // AC-S3-2 + AC-S3-4 + AC-S3-10: 3 entries, all completed; chain status
      // is 'completed'; iterationsCompleted === 3.
      const read = readChainLedger(cwd, chainId);
      if (!read.ok) throw new Error(read.reason);
      expect(read.ledger.iterations).toHaveLength(3);
      expect(read.ledger.iterationsCompleted).toBe(3);
      expect(read.ledger.status).toBe("completed");
      for (let k = 0; k < 3; k += 1) {
        expect(read.ledger.iterations[k].index).toBe(k + 1);
        expect(read.ledger.iterations[k].status).toBe("completed");
        // AC-S3-3: every iteration entry carries a real auto-commit SHA.
        expect(read.ledger.iterations[k].commitSha).toMatch(/^[0-9a-f]{40}$/);
      }

      // AC-S3-13: 3 distinct run-dirs landed under .praxis/runs/.
      const runIds = read.ledger.iterations.map((e) => e.runId);
      expect(new Set(runIds).size).toBe(3);
      for (const id of runIds) {
        expect(existsSync(join(cwd, ".praxis", "runs", id))).toBe(true);
      }
      // AC-S3-1 (continued): the stdout-emitted run-ids match the ledger
      // entries' run-ids in order.
      expect(runIdsOnStdout).toEqual(runIds);

      // AC-S3-12: HEAD advanced by exactly 6 commits past baseline (3 marker
      // commits + 3 auto-commits). Walk back 6 ancestors to recover baseline.
      const newHead = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd,
        encoding: "utf8",
      }).stdout.trim();
      expect(newHead).not.toBe(baselineSha);
      const sixthAncestor = spawnSync("git", ["rev-parse", "HEAD~6"], {
        cwd,
        encoding: "utf8",
      }).stdout.trim();
      expect(sixthAncestor).toBe(baselineSha);

      // AC-S3-12 (continued): each iteration's state.baselineSha matches the
      // *previous* iteration's auto-commit SHA. Walk the chain entries pair-
      // wise: iter K+1's state.baselineSha === iter K's commitSha.
      for (let k = 1; k < 3; k += 1) {
        const persisted = JSON.parse(
          readFileSync(
            join(cwd, ".praxis", "runs", runIds[k], "state.json"),
            "utf8",
          ),
        );
        // The iter-K commit sequence is: tdd-marker, then auto-commit. Iter
        // K+1's baselineSha = iter K's auto-commit SHA = iterations[K-1+1].commitSha.
        // (We want the auto-commit SHA of the prior iteration, which is
        // iterations[k-1].commitSha.)
        expect(persisted.baselineSha).toBe(
          read.ledger.iterations[k - 1].commitSha,
        );
      }

      // AC-S3-1 (smoke): the loop emits each iteration's runId on stdout.
      // Asserted indirectly via readChainLedger (each entry's runId matches
      // a real run-dir on disk and was written in the order indexed). The
      // direct stdout-capture assertion lives in the run-run-loop unit
      // test; here we lean on the on-disk evidence for the e2e smoke.

      // S-007 AC-S7-1/AC-S7-2/AC-S7-7: the chain banner lands on stdout
      // once per iteration, and the chain-end line lands once at completion.
      // Use the chain-id's last 4 chars as the short label (matches
      // formatChainStart / formatChainEnd).
      const short = chainId.slice(-4);
      const bannerPattern = new RegExp(
        `praxis: \\[chain ${short} · iteration \\d/3\\] starting run \\d{4}-\\d{2}-\\d{2}-\\d{4}-[0-9a-f]{4}`,
      );
      const banners = stdout.split("\n").filter((l) => bannerPattern.test(l));
      expect(banners).toHaveLength(3);
      // The K values are 1, 2, 3 in order.
      expect(banners[0]).toContain("iteration 1/3");
      expect(banners[1]).toContain("iteration 2/3");
      expect(banners[2]).toContain("iteration 3/3");
      // Chain-end line lands exactly once with status='completed' and K==N.
      const endPattern = new RegExp(
        `praxis: \\[chain ${short}\\] completed after 3/3 iterations`,
      );
      const ends = stdout.split("\n").filter((l) => endPattern.test(l));
      expect(ends).toHaveLength(1);
    });
  });
});

/**
 * S-006 AC-S6-1 e2e — iter 2 of 3 fails through the real runner; the chain
 * ledger flips to 'aborted' and iter 3 never starts. Drives the full path
 * from the CLI's runRun → launchRemainingIterations → real runWorkflow →
 * writeChainTerminalStatus, verifying the on-disk shape end-to-end.
 *
 * Iter 1 succeeds normally (7 stages with the same scripts the AC-S3-1 suite
 * uses). Iter 2's clarify-assess script is rigged to emit an artifact body
 * the validator rejects on both attempts, so the runner returns the failure
 * shape with status='failed'. The CLI's chain helper then writes 'aborted'
 * to the ledger.
 */
const INVALID_CLARIFY = `Not a valid intent artifact — missing all required H2 sections.\n`;

describe("praxis run --iterations 3 — iter 2 fails → ledger 'aborted' (S-006 AC-S6-1)", () => {
  it("iter 1 completes, iter 2's clarify-assess validator rejects → chain status 'aborted'; iter 3 never starts", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Iter 1: full 7-stage happy path. Iter 2: clarify-assess emits an
      // invalid artifact, validator rejects on attempts 1 + 2 → run fails.
      // Iter 3 must NOT dispatch any SDK calls.
      const allScripts: Array<Array<{ messages: SdkMessage[] }>> = [];
      // Iter 1 — 7 successful stage scripts (same shape as the AC-S3-1 suite).
      allScripts.push(...scriptsForIteration(1));
      // Iter 2 — clarify-assess gets two attempts emitting invalid bodies.
      // The validator's retry path consumes the corrective pushUserMessage so
      // attempt 2's script lands in the same call's stream.
      allScripts.push([
        { messages: stageMessages("sess_clarify_iter2_a1", INVALID_CLARIFY) },
        { messages: stageMessages("sess_clarify_iter2_a2", INVALID_CLARIFY) },
      ]);
      // (Stages 2-7 of iter 2 + all of iter 3 must NOT dispatch.)

      // Iter 1's driving-tdd is at call index 2 within the iteration; across
      // the chain that is just call 2 (we only successfully dispatch iter 1's
      // 7 calls + iter 2's 1 call before the run fails).
      const inner = recordingScriptedQueryWithCommitOn(cwd, -1, allScripts);
      let callCount = 0;
      const commitIndices = new Set([2]); // Only iter 1's driving-tdd commits.
      const createQueryFn: CreateQueryFn = (input) => {
        const myIdx = callCount++;
        if (commitIndices.has(myIdx)) {
          const filename = `iter-marker-${myIdx}.txt`;
          writeFileSync(
            join(cwd, filename),
            `marker for call ${myIdx}\n`,
            "utf8",
          );
          spawnSync("git", ["add", filename], { cwd });
          spawnSync("git", ["commit", "-m", `tdd-marker-${myIdx}`], { cwd });
          writeFileSync(
            join(cwd, `iter-extra-${myIdx}.txt`),
            `extra ${myIdx}\n`,
            "utf8",
          );
        }
        return inner(input);
      };

      // Capture stdout so we can assert the S-007 chain-end line lands on
      // the abort path. Restore in finally to avoid leaking the patch.
      const stdoutChunks: string[] = [];
      const origWrite = process.stdout.write.bind(process.stdout);
      // biome-ignore lint/suspicious/noExplicitAny: minimal patch shape.
      process.stdout.write = ((chunk: any, ...rest: any[]): boolean => {
        stdoutChunks.push(typeof chunk === "string" ? chunk : String(chunk));
        return origWrite(chunk, ...rest);
      }) as typeof process.stdout.write;

      let result: Awaited<ReturnType<typeof runRun>>;
      try {
        result = await runRun(
          {
            intent: "ship the multi-iter test",
            allowDirty: true,
            noPause: true,
            iterations: 3,
          },
          cwd,
          new AbortController().signal,
          buildDeps(createQueryFn),
        );
      } finally {
        process.stdout.write = origWrite;
      }
      expect(result.ok).toBe(false);

      // Locate the ledger and assert terminal status.
      const chainsDir = join(cwd, ".praxis", "chains");
      const chainFiles = readdirSync(chainsDir).filter((f) =>
        f.endsWith(".json"),
      );
      expect(chainFiles).toHaveLength(1);
      const chainId = chainFiles[0].replace(/\.json$/, "");
      const read = readChainLedger(cwd, chainId);
      if (!read.ok) throw new Error(read.reason);
      // S-006 AC-S6-1: chain flipped to 'aborted'.
      expect(read.ledger.status).toBe("aborted");
      // Iter 1 completed; iter 2 entry on disk as 'running' (runner never
      // patched it because executeStages took the failed branch). Iter 3
      // never appended.
      expect(read.ledger.iterations).toHaveLength(2);
      expect(read.ledger.iterations[0].status).toBe("completed");
      expect(read.ledger.iterations[0].commitSha).toMatch(/^[0-9a-f]{40}$/);
      expect(read.ledger.iterations[1].status).toBe("running");
      expect(read.ledger.iterations[1].commitSha).toBeUndefined();

      // S-007 AC-S7-9: chain-end line lands on stdout once with status
      // 'aborted', K=1 (only iter 1 completed), N=3.
      const stdout = stdoutChunks.join("");
      const short = chainId.slice(-4);
      const endPattern = new RegExp(
        `praxis: \\[chain ${short}\\] aborted after 1/3 iterations`,
      );
      expect(stdout).toMatch(endPattern);
      // S-007 AC-S7-1/AC-S7-2: chain banner lands on stdout for iter 1 + 2;
      // iter 3 never starts so no banner for it.
      const bannerPattern = new RegExp(
        `praxis: \\[chain ${short} · iteration \\d/3\\] starting run`,
      );
      const banners = stdout.split("\n").filter((l) => bannerPattern.test(l));
      expect(banners).toHaveLength(2);
    });
  });
});
