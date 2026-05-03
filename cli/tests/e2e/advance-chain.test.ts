import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAdvance, runRun } from "../../src/cli.js";
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
 * S-004 e2e — `praxis run --iterations N` with pauses ON, then `praxis advance`
 * the paused iter, asserting the chain-aware tail auto-launches the next
 * iteration through the same `runWorkflow` entry point. Exercises the full
 * cross-iteration plumbing through the real default 7-stage workflow with
 * scripted SDK responses (only the SDK is stubbed; git, fs, chain ledger
 * I/O are all real).
 *
 * Coverage map:
 *   - AC-S4-2 paused iter 1 → advance → iter 2 launches → both complete
 *   - AC-S4-3 multi-pause: iter 1 paused → advance → iter 2 also pauses
 *   - AC-S4-7 final iter pause (K==N) → advance → chain status: completed
 *
 * Pattern mirrors `tests/e2e/run-iterations-multi.test.ts` — same scripted
 * 7-stage shape per iteration, same commit-on-driving-tdd hook to advance
 * HEAD past each iteration's baseline so the trailing four stages dispatch.
 */

const VALID_CLARIFY = `## Intent

ship the advance-chain test.

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
 * Per-iteration script tuple for the default 7-stage workflow. Each
 * iteration has 7 SDK calls in order; auto-commit's commit subject embeds
 * the iteration index so a HEAD walk can verify ordering.
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

/**
 * Build a CreateQueryFn that wraps an inner `recordingScriptedQuery` so
 * driving-tdd calls (call indices 2, 9, 16, … per iteration) advance HEAD
 * via a real `git commit` AND drop a second uncommitted file so the
 * production auto-commit at the end of each iteration has something to
 * capture in its real commit (otherwise commit() returns skipped:true and
 * cascade-skip would fire prematurely).
 */
function makeCommittingQuery(cwd: string, iterations: number): CreateQueryFn {
  const allScripts: Array<Array<{ messages: SdkMessage[] }>> = [];
  for (let i = 1; i <= iterations; i += 1) {
    allScripts.push(...scriptsForIteration(i));
  }
  const inner = recordingScriptedQueryWithCommitOn(cwd, -1, allScripts);
  let callCount = 0;
  // Driving-tdd is call index 2 within each iteration — i.e. 2, 9, 16, …
  const commitIndices = new Set<number>();
  for (let i = 0; i < iterations; i += 1) commitIndices.add(2 + i * 7);
  return (input) => {
    const myIdx = callCount++;
    if (commitIndices.has(myIdx)) {
      const filename = `iter-marker-${myIdx}.txt`;
      writeFileSync(join(cwd, filename), `marker for call ${myIdx}\n`, "utf8");
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
}

describe("praxis run --iterations + praxis advance auto-launch (S-004 AC-S4-2)", () => {
  it("paused iter 1 → advance completes iter 1 AND auto-launches iter 2; both reach completed; chain ends 'completed'", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Drive `praxis run --iterations 2` with pauses ON. The default
      // workflow's clarify-assess pauses, so iter 1 returns paused after
      // stage 1. The chain ledger has one 'running' entry on disk.
      const deps = buildDeps(makeCommittingQuery(cwd, 2));
      const r1 = await runRun(
        {
          intent: "ship the advance-chain test",
          allowDirty: true,
          noPause: false,
          iterations: 2,
        },
        cwd,
        new AbortController().signal,
        deps,
      );
      if (!r1.ok) throw new Error(`run failed: ${r1.reason}`);
      expect(r1.paused).toBe(true);

      // Locate the chain ledger + iter-1's runId.
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
      expect(midRead.ledger.iterations[0].status).toBe("running");
      const iter1RunId = midRead.ledger.iterations[0].runId;

      // Advance iter 1 — should complete it AND auto-launch iter 2 (which
      // also pauses on clarify-assess, so we end with 2 entries and the
      // chain back at in_progress... unless we --no-pause the advance.)
      // Per spec AC-19/AC-20, ledger flags are inherited (iter 1 was started
      // with noPause=false → iter 2 will pause on clarify-assess too).
      // We'll assert the multi-pause shape below.
      await runAdvance(
        { runId: iter1RunId, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );

      const finalRead = readChainLedger(cwd, chainId);
      if (!finalRead.ok) throw new Error(finalRead.reason);
      // AC-S4-3: multi-pause — iter 1 completed, iter 2 paused mid-flight.
      expect(finalRead.ledger.iterations).toHaveLength(2);
      expect(finalRead.ledger.iterations[0].status).toBe("completed");
      expect(finalRead.ledger.iterations[1].status).toBe("running");
      expect(finalRead.ledger.iterationsCompleted).toBe(1);
      expect(finalRead.ledger.status).toBe("in_progress");
    });
  });
});

describe("praxis run --iterations + advance to completion (S-004 AC-S4-2 happy path)", () => {
  it("paused iter 1 → advance --no-pause → iter 1 completes → iter 2 auto-launches with --no-pause flag inherited from advance argv (advance --no-pause overrides ledger? — no: ledger flags win per spec)", async () => {
    // Per spec §5 / AC-19/AC-20, the ledger's `flags` are the source of
    // truth for chain-member iter K+1's `--no-pause`/`--allow-dirty`. Since
    // we started the chain with noPause=true, advance auto-launches iter 2
    // with noPause=true and the chain ends 'completed'.
    await withTempRepo(async ({ dir: cwd }) => {
      const deps = buildDeps(makeCommittingQuery(cwd, 2));
      // Start with --no-pause OFF for iter 1 (so it pauses) — but pre-set
      // the chain flag. Actually that's the same as iter 1 NOT pausing.
      // We need iter 1 to pause, then advance, then iter 2 auto-launches
      // and runs to completion. Easiest: start with --no-pause=false; iter 1
      // pauses; advance --no-pause=true so iter 1's resume runs through to
      // completion; ledger.flags carries noPause=false so iter 2 ALSO
      // pauses... which contradicts our goal here.
      //
      // Real-world story: "I started with pauses on but I want the chain
      // to power through after the first review." → user must set
      // --no-pause at chain start (`praxis run --iterations N --no-pause`),
      // pre-pause-cycle. Then iter 1 runs to completion in one go (no
      // pause) and the multi-iteration loop in `runRun` lands all N
      // iterations without ever needing `advance`.
      //
      // The advance-chain happy-path that exercises auto-launch + final
      // 'completed' is therefore: iter 1 paused (chain noPause=false) →
      // advance → iter 2 also pauses → advance the iter 2 paused run →
      // iter 2 completes (no iter 3 because N=2) → chain status: completed.
      const r1 = await runRun(
        {
          intent: "ship the advance-chain test",
          allowDirty: true,
          noPause: false,
          iterations: 2,
        },
        cwd,
        new AbortController().signal,
        deps,
      );
      if (!r1.ok) throw new Error(r1.reason);
      expect(r1.paused).toBe(true);

      const chainsDir = join(cwd, ".praxis", "chains");
      const chainFiles = readdirSync(chainsDir).filter((f) =>
        f.endsWith(".json"),
      );
      const chainId = chainFiles[0].replace(/\.json$/, "");
      const after1 = readChainLedger(cwd, chainId);
      if (!after1.ok) throw new Error(after1.reason);
      const iter1RunId = after1.ledger.iterations[0].runId;

      // First advance: iter 1 completes; iter 2 auto-launches and pauses
      // (ledger.flags.noPause=false, inherited from chain start).
      await runAdvance(
        { runId: iter1RunId, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );
      const after2start = readChainLedger(cwd, chainId);
      if (!after2start.ok) throw new Error(after2start.reason);
      expect(after2start.ledger.iterations).toHaveLength(2);
      expect(after2start.ledger.iterations[1].status).toBe("running");
      const iter2RunId = after2start.ledger.iterations[1].runId;

      // Second advance: iter 2 completes; no K+1 to launch (final iter); chain
      // status flips to 'completed' via handleIterationOutcome.
      await runAdvance(
        { runId: iter2RunId, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );

      const final = readChainLedger(cwd, chainId);
      if (!final.ok) throw new Error(final.reason);
      // AC-S4-2 + AC-S4-7 (final iter): both iterations completed; chain
      // ends 'completed' with iterationsCompleted=2 and 2 distinct runIds.
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
