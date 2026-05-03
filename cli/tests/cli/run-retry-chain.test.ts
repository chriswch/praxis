import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runRetry } from "../../src/cli.js";
import {
  AUTO_COMMIT_ID,
  CODE_IMPROVING_ID,
  CODE_REVIEWING_ID,
} from "../../src/config/defaults.js";
import { LineReporter } from "../../src/ui/line-reporter.js";
import type { Reporter } from "../../src/ui/reporter.js";
import {
  appendIteration,
  buildInitialChainLedger,
  type ChainLedger,
  readChainLedger,
  writeChainLedger,
} from "../../src/workflow/chain.js";
import {
  appendPraxisToGitignore,
  runPreflight,
} from "../../src/workflow/preflight.js";
import type {
  RetryWorkflowContext,
  RunWorkflowContext,
  RunWorkflowResult,
} from "../../src/workflow/runner.js";
import type { CreateQueryFn, Deps } from "../../src/workflow/stage.js";
import { type State, writeState } from "../../src/workflow/state.js";
import { RecordingReporter } from "../support/recording-reporter.js";
import { withTempRepo } from "../support/tmp-repo.js";

/**
 * S-005 — `runRetry` chain awareness. Mirrors `tests/cli/run-advance-chain.test.ts`
 * — uses spies on the optional `retryWorkflow` / `runWorkflow` slots in
 * `RunRunDeps` so we can assert chain-aware orchestration WITHOUT spinning up
 * the real 7-stage workflow on every test. Real-runner end-to-end paths live
 * in `tests/e2e/retry-chain.test.ts`.
 */

const CHAIN_ID = "2026-05-02-1430-9f3c";
const ITER1_RUN_ID = "2026-05-02-1430-aaaa";
const ITER2_RUN_ID = "2026-05-02-1442-bbbb";

function noopQueryFn(): CreateQueryFn {
  return () => {
    throw new Error(
      "noopQueryFn: should not be called when retryWorkflow/runWorkflow is stubbed",
    );
  };
}

type RunRunDepsWithSpies = Deps & {
  retryWorkflow?: (
    runId: string,
    ctx: RetryWorkflowContext,
    deps: Deps,
  ) => Promise<RunWorkflowResult>;
  runWorkflow?: (
    ctx: RunWorkflowContext,
    deps: Deps,
  ) => Promise<RunWorkflowResult>;
};

function pinnedDeps(spies: {
  retryWorkflow?: RunRunDepsWithSpies["retryWorkflow"];
  runWorkflow?: RunRunDepsWithSpies["runWorkflow"];
  reporter?: Reporter;
}): RunRunDepsWithSpies {
  return {
    clock: () => new Date("2026-05-02T14:42:13Z"),
    rng: (n) => new Uint8Array([0xc3, 0xd4]).slice(0, n),
    createQueryFn: noopQueryFn(),
    reporter: spies.reporter ?? new LineReporter(),
    commit: () => ({ ok: true, skipped: true }),
    runPreflight,
    appendPraxisToGitignore,
    retryWorkflow: spies.retryWorkflow,
    runWorkflow: spies.runWorkflow,
  };
}

/**
 * Seed a `state.json` shaped like a post-failure retry candidate (first 4
 * stages completed, code-improving failed). Chain fields are stamped iff
 * `chainId` is provided. Called BEFORE `runRetry` to mimic the on-disk state
 * a `praxis retry` user lands on.
 */
function seedRunState(
  cwd: string,
  runId: string,
  opts: {
    chainId?: string;
    iterationIndex?: number;
    intent?: string;
  } = {},
): void {
  const runDir = join(cwd, ".praxis", "runs", runId);
  mkdirSync(runDir, { recursive: true });
  const state: State = {
    runId,
    intent: opts.intent ?? "ship the chain",
    startedAt: "2026-05-02T14:30:12Z",
    baselineSha: "0123456789abcdef0123456789abcdef01234567",
    currentStage: CODE_IMPROVING_ID,
    cost: { totalTokens: 0, totalUsd: 0 },
    stages: {
      "clarify-assess": {
        status: "completed",
        sessionId: "sess",
        endedAt: "2026-05-02T14:30:13Z",
      },
      "sketching-design": { status: "completed", sessionId: "sess" },
      "driving-tdd": { status: "completed", sessionId: "sess" },
      [CODE_REVIEWING_ID]: { status: "completed", sessionId: "sess" },
      [CODE_IMPROVING_ID]: {
        status: "failed",
        sessionId: "sess_failed",
        error: "validator_failed",
      },
      [AUTO_COMMIT_ID]: { status: "pending" },
    },
  };
  if (opts.chainId !== undefined) state.chainId = opts.chainId;
  if (opts.iterationIndex !== undefined) {
    state.iterationIndex = opts.iterationIndex;
  }
  writeState(runDir, state);
}

/**
 * Seed a chain ledger on disk with the supplied iterations. Lets each
 * test prepare the post-pause chain shape before `runRetry` runs.
 */
function seedChainLedger(
  cwd: string,
  opts: {
    chainId: string;
    intent?: string;
    iterationsTotal: number;
    flags?: { allowDirty: boolean; noPause: boolean };
    iterations: ChainLedger["iterations"];
  },
): ChainLedger {
  const seeded = buildInitialChainLedger({
    chainId: opts.chainId,
    intent: opts.intent ?? "ship the chain",
    iterationsTotal: opts.iterationsTotal,
    flags: opts.flags ?? { allowDirty: false, noPause: false },
    createdAt: "2026-05-02T14:30:12Z",
  });
  let ledger: ChainLedger = seeded;
  for (const entry of opts.iterations) {
    ledger = appendIteration(ledger, entry, "2026-05-02T14:30:12Z");
  }
  // Sync iterationsCompleted to the count of completed entries.
  ledger = {
    ...ledger,
    iterationsCompleted: ledger.iterations.filter(
      (e) => e.status === "completed",
    ).length,
  };
  writeChainLedger(cwd, ledger);
  return ledger;
}

describe("runRetry back-compat (AC-S5-3)", () => {
  it("non-chain run (no state.chainId) → calls retryWorkflow once and emits runId; never reads ledger", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Standalone (non-chain) failed run.
      seedRunState(cwd, ITER1_RUN_ID);
      const retryCalls: string[] = [];
      const runWorkflowCalls: RunWorkflowContext[] = [];
      const deps = pinnedDeps({
        retryWorkflow: async (runId) => {
          retryCalls.push(runId);
          return { ok: true, runId, runDir: `/tmp/${runId}`, paused: false };
        },
        runWorkflow: async (ctx) => {
          runWorkflowCalls.push(ctx);
          throw new Error(
            "runWorkflow must NOT fire on non-chain retry back-compat",
          );
        },
      });
      await runRetry(
        { runId: ITER1_RUN_ID, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );
      expect(retryCalls).toEqual([ITER1_RUN_ID]);
      expect(runWorkflowCalls).toHaveLength(0);
    });
  });
});

describe("runRetry chain happy path (AC-S5-2)", () => {
  it("failed iter 1 → retry completes iter 1 AND auto-launches iter 2; both reach completed; chain status flips to completed", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // On-disk shape post-failure: iter 1's state.json has chainId, ledger
      // has iter 1 'running' (mid-iteration), iterationsTotal=2.
      seedRunState(cwd, ITER1_RUN_ID, {
        chainId: CHAIN_ID,
        iterationIndex: 1,
      });
      seedChainLedger(cwd, {
        chainId: CHAIN_ID,
        iterationsTotal: 2,
        iterations: [{ index: 1, runId: ITER1_RUN_ID, status: "running" }],
      });

      // retryWorkflow finishes iter 1: writes the completed entry to the
      // ledger with a real commit-SHA (mimicking the runner's own
      // recordChainIterationOnSuccess).
      const retryCalls: Array<{ runId: string }> = [];
      const runWorkflowCalls: RunWorkflowContext[] = [];
      const FAKE_SHA_1 = "abcdef0011112222333344445555666677778888";
      const FAKE_SHA_2 = "deadbeef11112222333344445555666677778888";
      const retrySpy = async (runId: string): Promise<RunWorkflowResult> => {
        retryCalls.push({ runId });
        // Patch the ledger as the runner would on success-return.
        const r = readChainLedger(cwd, CHAIN_ID);
        if (!r.ok) throw new Error(r.reason);
        const updated = r.ledger.iterations.map((e) =>
          e.index === 1
            ? { ...e, status: "completed" as const, commitSha: FAKE_SHA_1 }
            : e,
        );
        writeChainLedger(cwd, {
          ...r.ledger,
          iterations: updated,
          iterationsCompleted: 1,
        });
        // S-005: runner threads chain identity onto the success result so
        // runRetry can drive the chain-aware tail without re-reading state.json.
        return {
          ok: true,
          runId,
          runDir: `/tmp/${runId}`,
          paused: false,
          chainId: CHAIN_ID,
          iterationIndex: 1,
        };
      };
      const runSpy = async (
        ctx: RunWorkflowContext,
      ): Promise<RunWorkflowResult> => {
        runWorkflowCalls.push(ctx);
        // Append the iter-K entry as the runner would, then patch to completed.
        const r = readChainLedger(cwd, CHAIN_ID);
        if (!r.ok) throw new Error(r.reason);
        const k = ctx.chain?.iterationIndex ?? 0;
        const next = appendIteration(
          r.ledger,
          {
            index: k,
            runId: ITER2_RUN_ID,
            status: "completed",
            commitSha: FAKE_SHA_2,
          },
          "2026-05-02T14:42:13Z",
        );
        writeChainLedger(cwd, { ...next, iterationsCompleted: k });
        return {
          ok: true,
          runId: ITER2_RUN_ID,
          runDir: `/tmp/${ITER2_RUN_ID}`,
          paused: false,
        };
      };

      const deps = pinnedDeps({
        retryWorkflow: retrySpy,
        runWorkflow: runSpy,
      });
      await runRetry(
        { runId: ITER1_RUN_ID, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );

      // retryWorkflow called exactly once (iter 1 retry).
      expect(retryCalls).toHaveLength(1);
      // runWorkflow auto-launched exactly once (iter 2).
      expect(runWorkflowCalls).toHaveLength(1);
      expect(runWorkflowCalls[0].chain?.chainId).toBe(CHAIN_ID);
      expect(runWorkflowCalls[0].chain?.iterationIndex).toBe(2);
      expect(runWorkflowCalls[0].chain?.iterationsTotal).toBe(2);

      // Chain ledger flipped to 'completed' (final iter, no cascade-skip).
      const final = readChainLedger(cwd, CHAIN_ID);
      if (!final.ok) throw new Error(final.reason);
      expect(final.ledger.status).toBe("completed");
      expect(final.ledger.iterationsCompleted).toBe(2);
      expect(final.ledger.iterations).toHaveLength(2);
    });
  });
});

describe("runRetry final-iter (AC-S5-5)", () => {
  it("failed final iter (K==N) → retry completes it → chain status flips to completed; no auto-launch", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // 2-iter chain: iter 1 already completed, iter 2 is mid-flight (failed).
      seedRunState(cwd, ITER2_RUN_ID, {
        chainId: CHAIN_ID,
        iterationIndex: 2,
      });
      seedChainLedger(cwd, {
        chainId: CHAIN_ID,
        iterationsTotal: 2,
        iterations: [
          {
            index: 1,
            runId: ITER1_RUN_ID,
            status: "completed",
            commitSha: "deadbeef".repeat(5),
          },
          { index: 2, runId: ITER2_RUN_ID, status: "running" },
        ],
      });

      const runWorkflowCalls: RunWorkflowContext[] = [];
      const FAKE_SHA_2 = "abcdef0011112222333344445555666677778888";
      const retrySpy = async (runId: string): Promise<RunWorkflowResult> => {
        const r = readChainLedger(cwd, CHAIN_ID);
        if (!r.ok) throw new Error(r.reason);
        const updated = r.ledger.iterations.map((e) =>
          e.index === 2
            ? { ...e, status: "completed" as const, commitSha: FAKE_SHA_2 }
            : e,
        );
        writeChainLedger(cwd, {
          ...r.ledger,
          iterations: updated,
          iterationsCompleted: 2,
        });
        return {
          ok: true,
          runId,
          runDir: `/tmp/${runId}`,
          paused: false,
          chainId: CHAIN_ID,
          iterationIndex: 2,
        };
      };
      const runSpy = async (
        ctx: RunWorkflowContext,
      ): Promise<RunWorkflowResult> => {
        runWorkflowCalls.push(ctx);
        throw new Error(
          "runWorkflow must NOT fire — final iter completion has no K+1 to launch",
        );
      };

      const deps = pinnedDeps({
        retryWorkflow: retrySpy,
        runWorkflow: runSpy,
      });
      await runRetry(
        { runId: ITER2_RUN_ID, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );

      expect(runWorkflowCalls).toHaveLength(0);
      const final = readChainLedger(cwd, CHAIN_ID);
      if (!final.ok) throw new Error(final.reason);
      expect(final.ledger.status).toBe("completed");
      expect(final.ledger.iterationsCompleted).toBe(2);
    });
  });
});

describe("runRetry cascade-skip on resumed iter (AC-S5-4)", () => {
  it("resumed iter completes WITHOUT a commitSha (cascade-skip) → chain flips to completed-early; no auto-launch", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // 3-iter chain; iter 1 failed. retry finishes iter 1 but the
      // auto-commit cascade-skipped (no commitSha on the entry).
      seedRunState(cwd, ITER1_RUN_ID, {
        chainId: CHAIN_ID,
        iterationIndex: 1,
      });
      seedChainLedger(cwd, {
        chainId: CHAIN_ID,
        iterationsTotal: 3,
        iterations: [{ index: 1, runId: ITER1_RUN_ID, status: "running" }],
      });

      const runWorkflowCalls: RunWorkflowContext[] = [];
      const retrySpy = async (runId: string): Promise<RunWorkflowResult> => {
        const r = readChainLedger(cwd, CHAIN_ID);
        if (!r.ok) throw new Error(r.reason);
        const updated = r.ledger.iterations.map((e) =>
          // Cascade-skip path: status flips to completed but commitSha is omitted.
          e.index === 1 ? { ...e, status: "completed" as const } : e,
        );
        writeChainLedger(cwd, {
          ...r.ledger,
          iterations: updated,
          iterationsCompleted: 1,
        });
        return {
          ok: true,
          runId,
          runDir: `/tmp/${runId}`,
          paused: false,
          chainId: CHAIN_ID,
          iterationIndex: 1,
        };
      };
      const runSpy = async (
        ctx: RunWorkflowContext,
      ): Promise<RunWorkflowResult> => {
        runWorkflowCalls.push(ctx);
        throw new Error(
          "runWorkflow must NOT fire — cascade-skip stops the chain",
        );
      };

      const deps = pinnedDeps({
        retryWorkflow: retrySpy,
        runWorkflow: runSpy,
      });
      await runRetry(
        { runId: ITER1_RUN_ID, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );

      expect(runWorkflowCalls).toHaveLength(0);
      const final = readChainLedger(cwd, CHAIN_ID);
      if (!final.ok) throw new Error(final.reason);
      expect(final.ledger.status).toBe("completed-early");
    });
  });
});

describe("runRetry flag inheritance (AC-S5-7)", () => {
  it("auto-launched iter K+1 receives chain.flags from the ledger (not from retry argv)", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      seedRunState(cwd, ITER1_RUN_ID, {
        chainId: CHAIN_ID,
        iterationIndex: 1,
      });
      seedChainLedger(cwd, {
        chainId: CHAIN_ID,
        iterationsTotal: 3,
        // Chain was started with both flags ON — ledger-of-record.
        flags: { allowDirty: true, noPause: true },
        iterations: [{ index: 1, runId: ITER1_RUN_ID, status: "running" }],
      });

      const runWorkflowCalls: RunWorkflowContext[] = [];
      const FAKE_SHA = "abcdef0011112222333344445555666677778888";
      const retrySpy = async (runId: string): Promise<RunWorkflowResult> => {
        const r = readChainLedger(cwd, CHAIN_ID);
        if (!r.ok) throw new Error(r.reason);
        const updated = r.ledger.iterations.map((e) =>
          e.index === 1
            ? { ...e, status: "completed" as const, commitSha: FAKE_SHA }
            : e,
        );
        writeChainLedger(cwd, {
          ...r.ledger,
          iterations: updated,
          iterationsCompleted: 1,
        });
        return {
          ok: true,
          runId,
          runDir: `/tmp/${runId}`,
          paused: false,
          chainId: CHAIN_ID,
          iterationIndex: 1,
        };
      };
      const runSpy = async (
        ctx: RunWorkflowContext,
      ): Promise<RunWorkflowResult> => {
        runWorkflowCalls.push(ctx);
        // Pause iter 2 so the loop stops after one auto-launch.
        const r = readChainLedger(cwd, CHAIN_ID);
        if (!r.ok) throw new Error(r.reason);
        const next = appendIteration(
          r.ledger,
          { index: 2, runId: ITER2_RUN_ID, status: "running" },
          "2026-05-02T14:42:13Z",
        );
        writeChainLedger(cwd, next);
        return {
          ok: true,
          runId: ITER2_RUN_ID,
          runDir: `/tmp/${ITER2_RUN_ID}`,
          paused: true,
          pausedStageId: "clarify-assess",
          artifactPath: `/tmp/${ITER2_RUN_ID}/01-clarify-assess.md`,
        };
      };

      const deps = pinnedDeps({
        retryWorkflow: retrySpy,
        runWorkflow: runSpy,
      });
      // Note: retry's argv has noPause=false — runRetry MUST take flags from
      // the ledger, not from its own argv, so iter K+1 sees noPause=true.
      await runRetry(
        { runId: ITER1_RUN_ID, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );

      expect(runWorkflowCalls).toHaveLength(1);
      const ctx = runWorkflowCalls[0];
      expect(ctx.chain?.flags).toEqual({ allowDirty: true, noPause: true });
      // Top-level allowDirty/noPause forwarded too — symmetric with runRun/runAdvance.
      expect(ctx.allowDirty).toBe(true);
      expect(ctx.noPause).toBe(true);
    });
  });
});

describe("runRetry retry itself fails (AC-S5-8)", () => {
  it("retryWorkflow returns failure → no chain-aware tail; chain stays in_progress; exit 1", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      seedRunState(cwd, ITER1_RUN_ID, {
        chainId: CHAIN_ID,
        iterationIndex: 1,
      });
      seedChainLedger(cwd, {
        chainId: CHAIN_ID,
        iterationsTotal: 3,
        iterations: [{ index: 1, runId: ITER1_RUN_ID, status: "running" }],
      });

      const runWorkflowCalls: RunWorkflowContext[] = [];
      const retrySpy = async (runId: string): Promise<RunWorkflowResult> => ({
        ok: false,
        reason: "session_unresumable",
        runId,
        runDir: `/tmp/${runId}`,
        failedStageId: CODE_IMPROVING_ID,
        status: "failed",
      });
      const runSpy = async (
        ctx: RunWorkflowContext,
      ): Promise<RunWorkflowResult> => {
        runWorkflowCalls.push(ctx);
        throw new Error(
          "runWorkflow must NOT fire — retry itself failed, chain-aware tail must not run",
        );
      };

      const deps = pinnedDeps({
        retryWorkflow: retrySpy,
        runWorkflow: runSpy,
      });
      // process.exit(1) is observed by vitest as a thrown error.
      await expect(
        runRetry(
          { runId: ITER1_RUN_ID, noPause: false },
          cwd,
          new AbortController().signal,
          deps,
        ),
      ).rejects.toThrow(/process\.exit.*1/);

      expect(runWorkflowCalls).toHaveLength(0);
      const final = readChainLedger(cwd, CHAIN_ID);
      if (!final.ok) throw new Error(final.reason);
      // Retry failure leaves the ledger in_progress — S-006 owns terminal
      // 'aborted' transitions for "user gives up".
      expect(final.ledger.status).toBe("in_progress");
    });
  });
});

describe("runRetry auto-launched iter fails (AC-S5-9 + S-006 AC-S6-7)", () => {
  it("failed iter 1 → retry → iter 2 launches and fails → ledger flips to 'aborted'", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      seedRunState(cwd, ITER1_RUN_ID, {
        chainId: CHAIN_ID,
        iterationIndex: 1,
      });
      seedChainLedger(cwd, {
        chainId: CHAIN_ID,
        iterationsTotal: 3,
        iterations: [{ index: 1, runId: ITER1_RUN_ID, status: "running" }],
      });

      const FAKE_SHA = "abcdef0011112222333344445555666677778888";
      const retrySpy = async (runId: string): Promise<RunWorkflowResult> => {
        const r = readChainLedger(cwd, CHAIN_ID);
        if (!r.ok) throw new Error(r.reason);
        const updated = r.ledger.iterations.map((e) =>
          e.index === 1
            ? { ...e, status: "completed" as const, commitSha: FAKE_SHA }
            : e,
        );
        writeChainLedger(cwd, {
          ...r.ledger,
          iterations: updated,
          iterationsCompleted: 1,
        });
        return {
          ok: true,
          runId,
          runDir: `/tmp/${runId}`,
          paused: false,
          chainId: CHAIN_ID,
          iterationIndex: 1,
        };
      };
      const runSpy = async (): Promise<RunWorkflowResult> => {
        // Iter 2 fails outright — runner returns failure shape.
        return {
          ok: false,
          reason: "validator_failed: bad artifact",
          runId: ITER2_RUN_ID,
          runDir: `/tmp/${ITER2_RUN_ID}`,
          failedStageId: "clarify-assess",
          status: "failed",
        };
      };

      const deps = pinnedDeps({
        retryWorkflow: retrySpy,
        runWorkflow: runSpy,
      });
      // A failed auto-launched iter exits 1 (vitest surfaces process.exit as
      // a throw). The CRITICAL invariant we're locking is the on-disk shape
      // BEFORE the exit — chain flips to 'aborted', iter 2 was never recorded.
      await expect(
        runRetry(
          { runId: ITER1_RUN_ID, noPause: false },
          cwd,
          new AbortController().signal,
          deps,
        ),
      ).rejects.toThrow(/process\.exit.*1/);

      // S-006 AC-S6-7: every iteration failure inside `launchRemainingIterations`
      // flips the chain to its terminal status. Default failure → 'aborted'.
      // (User can still recover via `praxis advance/retry <iter-2 run-id>` —
      // a successful recovery overwrites this status via handleIterationOutcome.)
      const final = readChainLedger(cwd, CHAIN_ID);
      if (!final.ok) throw new Error(final.reason);
      expect(final.ledger.status).toBe("aborted");
      // Iter 1 already counted; iter 2 entry was never appended by our spy.
      expect(final.ledger.iterationsCompleted).toBe(1);
    });
  });
});

describe("runRetry chainId on result (AC-S5-10)", () => {
  it("state.json with chainId is read back by runRetry; runner threads chainId/iterationIndex onto success result", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // N=1 single-iter chain → ledger flips to completed after iter 1's
      // retry; no K+1 to launch. Asserts the round-trip itself: a state.json
      // missing chainId means non-chain (covered by AC-S5-3); a state.json
      // WITH chainId triggers the chain-aware tail (relies on the runner
      // threading both fields onto the success result).
      seedRunState(cwd, ITER1_RUN_ID, {
        chainId: CHAIN_ID,
        iterationIndex: 1,
      });
      seedChainLedger(cwd, {
        chainId: CHAIN_ID,
        iterationsTotal: 1,
        iterations: [{ index: 1, runId: ITER1_RUN_ID, status: "running" }],
      });

      const FAKE_SHA = "abcdef0011112222333344445555666677778888";
      const retrySpy = async (runId: string): Promise<RunWorkflowResult> => {
        const r = readChainLedger(cwd, CHAIN_ID);
        if (!r.ok) throw new Error(r.reason);
        const updated = r.ledger.iterations.map((e) =>
          e.index === 1
            ? { ...e, status: "completed" as const, commitSha: FAKE_SHA }
            : e,
        );
        writeChainLedger(cwd, {
          ...r.ledger,
          iterations: updated,
          iterationsCompleted: 1,
        });
        return {
          ok: true,
          runId,
          runDir: `/tmp/${runId}`,
          paused: false,
          chainId: CHAIN_ID,
          iterationIndex: 1,
        };
      };
      const runSpy = async (): Promise<RunWorkflowResult> => {
        throw new Error(
          "runWorkflow must NOT fire — N=1 chain is complete after iter 1",
        );
      };
      const deps = pinnedDeps({
        retryWorkflow: retrySpy,
        runWorkflow: runSpy,
      });
      await runRetry(
        { runId: ITER1_RUN_ID, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );
      const final = readChainLedger(cwd, CHAIN_ID);
      if (!final.ok) throw new Error(final.reason);
      // N=1 single-iter chain → completed after iter 1's retry.
      expect(final.ledger.status).toBe("completed");
    });
  });
});

describe("runRetry AC-S5-1 round-trip smoke", () => {
  it("AC-S5-1: state.chainId stamped on the failed iter is read back by runRetry to drive the chain-aware tail", async () => {
    // AC-S5-1 narrows on the round-trip itself: a chain-bound retry resumes
    // the failed code-improving stage AND kicks the chain-aware tail (verified
    // here by asserting runWorkflow auto-launched iter 2 — which is only
    // possible if runRetry recovered the ledger via state.chainId).
    await withTempRepo(async ({ dir: cwd }) => {
      seedRunState(cwd, ITER1_RUN_ID, {
        chainId: CHAIN_ID,
        iterationIndex: 1,
      });
      seedChainLedger(cwd, {
        chainId: CHAIN_ID,
        iterationsTotal: 2,
        iterations: [{ index: 1, runId: ITER1_RUN_ID, status: "running" }],
      });

      const runWorkflowCalls: RunWorkflowContext[] = [];
      const FAKE_SHA = "abcdef0011112222333344445555666677778888";
      const retrySpy = async (runId: string): Promise<RunWorkflowResult> => {
        const r = readChainLedger(cwd, CHAIN_ID);
        if (!r.ok) throw new Error(r.reason);
        const updated = r.ledger.iterations.map((e) =>
          e.index === 1
            ? { ...e, status: "completed" as const, commitSha: FAKE_SHA }
            : e,
        );
        writeChainLedger(cwd, {
          ...r.ledger,
          iterations: updated,
          iterationsCompleted: 1,
        });
        return {
          ok: true,
          runId,
          runDir: `/tmp/${runId}`,
          paused: false,
          chainId: CHAIN_ID,
          iterationIndex: 1,
        };
      };
      const runSpy = async (
        ctx: RunWorkflowContext,
      ): Promise<RunWorkflowResult> => {
        runWorkflowCalls.push(ctx);
        // Pause iter 2 so the loop exits cleanly.
        const r = readChainLedger(cwd, CHAIN_ID);
        if (!r.ok) throw new Error(r.reason);
        const next = appendIteration(
          r.ledger,
          { index: 2, runId: ITER2_RUN_ID, status: "running" },
          "2026-05-02T14:42:13Z",
        );
        writeChainLedger(cwd, next);
        return {
          ok: true,
          runId: ITER2_RUN_ID,
          runDir: `/tmp/${ITER2_RUN_ID}`,
          paused: true,
          pausedStageId: "clarify-assess",
          artifactPath: `/tmp/${ITER2_RUN_ID}/01-clarify-assess.md`,
        };
      };

      const deps = pinnedDeps({
        retryWorkflow: retrySpy,
        runWorkflow: runSpy,
      });
      await runRetry(
        { runId: ITER1_RUN_ID, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );

      // Auto-launch fired with the iter-2 chain context — proves state.chainId
      // round-tripped from disk through the retry tail.
      expect(runWorkflowCalls).toHaveLength(1);
      expect(runWorkflowCalls[0].chain?.chainId).toBe(CHAIN_ID);
      expect(runWorkflowCalls[0].chain?.iterationIndex).toBe(2);
    });
  });
});

/**
 * S-006 AC-S6-6 — when `retryWorkflow` returns a failure on a chain-bound
 * resume, the chain ledger's `status` must flip to `aborted` (or `cancelled`
 * when the underlying failure was a SIGINT) before the CLI exits. Symmetric
 * with AC-S6-5 (advance) — both share the `runResume` helper.
 */
describe("runRetry dispatcher failure → ledger 'aborted' (S-006 AC-S6-6)", () => {
  it("AC-S6-6: retryWorkflow returns failure on a chain-bound resume → ledger flips to 'aborted'", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      seedRunState(cwd, ITER1_RUN_ID, {
        chainId: CHAIN_ID,
        iterationIndex: 1,
      });
      seedChainLedger(cwd, {
        chainId: CHAIN_ID,
        iterationsTotal: 3,
        iterations: [{ index: 1, runId: ITER1_RUN_ID, status: "running" }],
      });

      const retrySpy = async (runId: string): Promise<RunWorkflowResult> => ({
        ok: false,
        reason: "session_unresumable",
        runId,
        runDir: `/tmp/${runId}`,
        failedStageId: CODE_IMPROVING_ID,
        status: "failed",
        chainId: CHAIN_ID,
        iterationIndex: 1,
      });
      const deps = pinnedDeps({
        retryWorkflow: retrySpy,
        runWorkflow: async (): Promise<RunWorkflowResult> => {
          throw new Error("runWorkflow must NOT fire — retry itself failed");
        },
      });
      await expect(
        runRetry(
          { runId: ITER1_RUN_ID, noPause: false },
          cwd,
          new AbortController().signal,
          deps,
        ),
      ).rejects.toThrow(/process\.exit.*1/);

      const final = readChainLedger(cwd, CHAIN_ID);
      if (!final.ok) throw new Error(final.reason);
      expect(final.ledger.status).toBe("aborted");
    });
  });

  it("AC-S6-6 (cancelled variant): retryWorkflow returns status='cancelled' → ledger flips to 'cancelled'", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      seedRunState(cwd, ITER1_RUN_ID, {
        chainId: CHAIN_ID,
        iterationIndex: 1,
      });
      seedChainLedger(cwd, {
        chainId: CHAIN_ID,
        iterationsTotal: 3,
        iterations: [{ index: 1, runId: ITER1_RUN_ID, status: "running" }],
      });

      const retrySpy = async (runId: string): Promise<RunWorkflowResult> => ({
        ok: false,
        reason: "cancelled by user (SIGINT)",
        runId,
        runDir: `/tmp/${runId}`,
        failedStageId: CODE_IMPROVING_ID,
        status: "cancelled",
        chainId: CHAIN_ID,
        iterationIndex: 1,
      });
      const deps = pinnedDeps({
        retryWorkflow: retrySpy,
        runWorkflow: async (): Promise<RunWorkflowResult> => {
          throw new Error("runWorkflow must NOT fire");
        },
      });
      await expect(
        runRetry(
          { runId: ITER1_RUN_ID, noPause: false },
          cwd,
          new AbortController().signal,
          deps,
        ),
      ).rejects.toThrow(/process\.exit.*1/);

      const final = readChainLedger(cwd, CHAIN_ID);
      if (!final.ok) throw new Error(final.reason);
      expect(final.ledger.status).toBe("cancelled");
    });
  });
});

/**
 * S-007 — `runRetry` reporter wiring. Symmetric to the `runAdvance` AC-S7-5
 * test: `retryWorkflow` re-enters `executeStages` directly, so the chain
 * banner must NOT re-fire on the resumed iteration. The auto-launched K+1
 * iteration goes through the runner again, so its banner DOES fire (covered
 * runner-side in `tests/workflow/runner-chain.test.ts`).
 */
describe("runRetry reporter chain events (S-007 AC-S7-6)", () => {
  it("AC-S7-6: retried iter (retryWorkflow path) → CLI never invokes reporter.chainStart", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Final-iter retry shape: iter 2 of 2 mid-flight, retry completes it.
      // K === N → no auto-launch, so chainStart should remain at 0.
      seedRunState(cwd, ITER2_RUN_ID, {
        chainId: CHAIN_ID,
        iterationIndex: 2,
      });
      seedChainLedger(cwd, {
        chainId: CHAIN_ID,
        iterationsTotal: 2,
        iterations: [
          {
            index: 1,
            runId: ITER1_RUN_ID,
            status: "completed",
            commitSha: "deadbeef".repeat(5),
          },
          { index: 2, runId: ITER2_RUN_ID, status: "running" },
        ],
      });

      const FAKE_SHA = "abcdef0011112222333344445555666677778888";
      const retrySpy = async (
        runId: string,
      ): Promise<RunWorkflowResult> => {
        const r = readChainLedger(cwd, CHAIN_ID);
        if (!r.ok) throw new Error(r.reason);
        const updated = r.ledger.iterations.map((e) =>
          e.index === 2
            ? { ...e, status: "completed" as const, commitSha: FAKE_SHA }
            : e,
        );
        writeChainLedger(cwd, {
          ...r.ledger,
          iterations: updated,
          iterationsCompleted: 2,
        });
        return {
          ok: true,
          runId,
          runDir: `/tmp/${runId}`,
          paused: false,
          chainId: CHAIN_ID,
          iterationIndex: 2,
        };
      };
      const reporter = new RecordingReporter();
      const deps = pinnedDeps({
        retryWorkflow: retrySpy,
        runWorkflow: async () => {
          throw new Error("auto-launch must NOT fire when K === N");
        },
        reporter,
      });
      await runRetry(
        { runId: ITER2_RUN_ID, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );
      expect(reporter.countOf("chainStart")).toBe(0);
      expect(reporter.countOf("chainEnd")).toBe(1);
    });
  });
});

describe("runRetry reporter chain events on failure (S-007 AC-S7-9)", () => {
  it("AC-S7-9: retryWorkflow fails → reporter.chainEnd fires once with status='aborted'", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      seedRunState(cwd, ITER1_RUN_ID, {
        chainId: CHAIN_ID,
        iterationIndex: 1,
      });
      seedChainLedger(cwd, {
        chainId: CHAIN_ID,
        iterationsTotal: 3,
        iterations: [{ index: 1, runId: ITER1_RUN_ID, status: "running" }],
      });
      const failingRetry = async (
        runId: string,
      ): Promise<RunWorkflowResult> => ({
        ok: false,
        reason: "session_unresumable",
        runId,
        runDir: `/tmp/${runId}`,
        failedStageId: CODE_IMPROVING_ID,
        status: "failed",
        chainId: CHAIN_ID,
        iterationIndex: 1,
      });
      const reporter = new RecordingReporter();
      const deps = pinnedDeps({
        retryWorkflow: failingRetry,
        reporter,
      });
      const exitSpy = vi
        .spyOn(process, "exit")
        // biome-ignore lint/suspicious/noExplicitAny: spy stub.
        .mockImplementation(((_code?: number) => {
          throw new Error("process.exit(1)");
        }) as any);
      const errSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);
      try {
        await expect(
          runRetry(
            { runId: ITER1_RUN_ID, noPause: false },
            cwd,
            new AbortController().signal,
            deps,
          ),
        ).rejects.toThrow(/process\.exit\(1\)/);
      } finally {
        exitSpy.mockRestore();
        errSpy.mockRestore();
      }
      const ends = reporter.calls.filter((c) => c.kind === "chainEnd");
      expect(ends).toHaveLength(1);
      expect(ends[0]).toMatchObject({
        kind: "chainEnd",
        status: "aborted",
        iterationsCompleted: 0,
        iterationsTotal: 3,
      });
    });
  });
});
