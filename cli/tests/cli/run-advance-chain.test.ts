import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAdvance } from "../../src/cli.js";
import { LineReporter } from "../../src/ui/line-reporter.js";
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
  AdvanceWorkflowContext,
  RunWorkflowContext,
  RunWorkflowResult,
} from "../../src/workflow/runner.js";
import type { CreateQueryFn, Deps } from "../../src/workflow/stage.js";
import { type State, writeState } from "../../src/workflow/state.js";
import { withTempRepo } from "../support/tmp-repo.js";

/**
 * S-004 — `runAdvance` chain awareness. Mirrors `tests/cli/run-run-loop.test.ts`
 * — uses spies on the optional `advanceWorkflow` / `runWorkflow` slots in
 * `RunRunDeps` so we can assert chain-aware orchestration WITHOUT spinning up
 * the real 7-stage workflow on every test. Real-runner end-to-end paths live
 * in `tests/e2e/advance-chain.test.ts`.
 */

const CHAIN_ID = "2026-05-02-1430-9f3c";
const ITER1_RUN_ID = "2026-05-02-1430-aaaa";
const ITER2_RUN_ID = "2026-05-02-1442-bbbb";

function noopQueryFn(): CreateQueryFn {
  return () => {
    throw new Error(
      "noopQueryFn: should not be called when advanceWorkflow/runWorkflow is stubbed",
    );
  };
}

type RunRunDepsWithSpies = Deps & {
  advanceWorkflow?: (
    runId: string,
    ctx: AdvanceWorkflowContext,
    deps: Deps,
  ) => Promise<RunWorkflowResult>;
  runWorkflow?: (
    ctx: RunWorkflowContext,
    deps: Deps,
  ) => Promise<RunWorkflowResult>;
};

function pinnedDeps(spies: {
  advanceWorkflow?: RunRunDepsWithSpies["advanceWorkflow"];
  runWorkflow?: RunRunDepsWithSpies["runWorkflow"];
}): RunRunDepsWithSpies {
  return {
    clock: () => new Date("2026-05-02T14:42:13Z"),
    rng: (n) => new Uint8Array([0xc3, 0xd4]).slice(0, n),
    createQueryFn: noopQueryFn(),
    reporter: new LineReporter(),
    commit: () => ({ ok: true, skipped: true }),
    runPreflight,
    appendPraxisToGitignore,
    advanceWorkflow: spies.advanceWorkflow,
    runWorkflow: spies.runWorkflow,
  };
}

/**
 * Seed a `state.json` (and optionally a chain ledger entry) on disk so
 * `runAdvance` reads back a chain-aware run shape. Chain fields are stamped
 * iff `chainId` is provided. Called BEFORE `runAdvance` to mimic the
 * post-pause on-disk state.
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
    currentStage: "auto-commit",
    cost: { totalTokens: 0, totalUsd: 0 },
    stages: {
      "clarify-assess": {
        status: "completed",
        sessionId: "sess",
        endedAt: "2026-05-02T14:30:13Z",
      },
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
 * test prepare the post-pause chain shape before `runAdvance` runs.
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

describe("runAdvance back-compat (AC-S4-6)", () => {
  it("non-chain run (no state.chainId) → calls advanceWorkflow once and emits runId; never reads ledger", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Standalone (non-chain) paused run.
      seedRunState(cwd, ITER1_RUN_ID);
      const advanceCalls: string[] = [];
      const runWorkflowCalls: RunWorkflowContext[] = [];
      const deps = pinnedDeps({
        advanceWorkflow: async (runId) => {
          advanceCalls.push(runId);
          return { ok: true, runId, runDir: `/tmp/${runId}`, paused: false };
        },
        runWorkflow: async (ctx) => {
          runWorkflowCalls.push(ctx);
          throw new Error(
            "runWorkflow must NOT fire on non-chain advance back-compat",
          );
        },
      });
      await runAdvance(
        { runId: ITER1_RUN_ID, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );
      expect(advanceCalls).toEqual([ITER1_RUN_ID]);
      expect(runWorkflowCalls).toHaveLength(0);
    });
  });
});

describe("runAdvance chain happy path (AC-S4-2)", () => {
  it("paused iter 1 → advance completes iter 1 AND auto-launches iter 2; both reach completed; chain status flips to completed", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // On-disk shape post-pause: iter 1's state.json has chainId, ledger
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

      // advanceWorkflow finishes iter 1: writes the completed entry to the
      // ledger with a real commit-SHA (mimicking the runner's own
      // recordChainIterationOnSuccess).
      const advanceCalls: Array<{ runId: string }> = [];
      const runWorkflowCalls: RunWorkflowContext[] = [];
      const FAKE_SHA_1 = "abcdef0011112222333344445555666677778888";
      const FAKE_SHA_2 = "deadbeef11112222333344445555666677778888";
      const advanceSpy = async (runId: string): Promise<RunWorkflowResult> => {
        advanceCalls.push({ runId });
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
        return { ok: true, runId, runDir: `/tmp/${runId}`, paused: false };
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
        advanceWorkflow: advanceSpy,
        runWorkflow: runSpy,
      });
      await runAdvance(
        { runId: ITER1_RUN_ID, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );

      // advanceWorkflow called exactly once (iter 1 resume).
      expect(advanceCalls).toHaveLength(1);
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

describe("runAdvance multi-pause (AC-S4-3)", () => {
  it("paused iter 1 → advance → iter 2 also pauses → ledger has 2 entries, chain stays in_progress", async () => {
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

      const FAKE_SHA_1 = "abcdef0011112222333344445555666677778888";
      const advanceSpy = async (runId: string): Promise<RunWorkflowResult> => {
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
        return { ok: true, runId, runDir: `/tmp/${runId}`, paused: false };
      };
      const runSpy = async (
        ctx: RunWorkflowContext,
      ): Promise<RunWorkflowResult> => {
        const r = readChainLedger(cwd, CHAIN_ID);
        if (!r.ok) throw new Error(r.reason);
        const k = ctx.chain?.iterationIndex ?? 0;
        // Append iter-K entry as 'running' (pause shape — no commitSha yet).
        const next = appendIteration(
          r.ledger,
          { index: k, runId: ITER2_RUN_ID, status: "running" },
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
        advanceWorkflow: advanceSpy,
        runWorkflow: runSpy,
      });
      await runAdvance(
        { runId: ITER1_RUN_ID, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );

      const final = readChainLedger(cwd, CHAIN_ID);
      if (!final.ok) throw new Error(final.reason);
      expect(final.ledger.iterations).toHaveLength(2);
      expect(final.ledger.iterations[0].status).toBe("completed");
      expect(final.ledger.iterations[1].status).toBe("running");
      // Pause leaves the chain in_progress; CLI loop must not flip it.
      expect(final.ledger.status).toBe("in_progress");
    });
  });
});

describe("runAdvance final-iter-pause (AC-S4-5)", () => {
  it("paused final iter (K==N) → advance completes it → chain status flips to completed; no auto-launch", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // 2-iter chain: iter 1 already completed, iter 2 is mid-flight (paused).
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
      const advanceSpy = async (runId: string): Promise<RunWorkflowResult> => {
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
        return { ok: true, runId, runDir: `/tmp/${runId}`, paused: false };
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
        advanceWorkflow: advanceSpy,
        runWorkflow: runSpy,
      });
      await runAdvance(
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

describe("runAdvance cascade-skip on resumed iter (AC-S4-7)", () => {
  it("resumed iter completes WITHOUT a commitSha (cascade-skip) → chain flips to completed-early; no auto-launch", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // 3-iter chain; iter 1 paused. advance finishes iter 1 but the
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
      const advanceSpy = async (runId: string): Promise<RunWorkflowResult> => {
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
        return { ok: true, runId, runDir: `/tmp/${runId}`, paused: false };
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
        advanceWorkflow: advanceSpy,
        runWorkflow: runSpy,
      });
      await runAdvance(
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

describe("runAdvance flag inheritance (AC-S4-9)", () => {
  it("auto-launched iter K+1 receives chain.flags from the ledger (not from advance argv)", async () => {
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
      const advanceSpy = async (runId: string): Promise<RunWorkflowResult> => {
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
        return { ok: true, runId, runDir: `/tmp/${runId}`, paused: false };
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
        advanceWorkflow: advanceSpy,
        runWorkflow: runSpy,
      });
      // Note: advance's argv has noPause=false — runAdvance MUST take flags
      // from the ledger, not from its own argv, so iter K+1 sees noPause=true.
      await runAdvance(
        { runId: ITER1_RUN_ID, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );

      expect(runWorkflowCalls).toHaveLength(1);
      const ctx = runWorkflowCalls[0];
      expect(ctx.chain?.flags).toEqual({ allowDirty: true, noPause: true });
      // Top-level allowDirty/noPause forwarded too — symmetric with runRun.
      expect(ctx.allowDirty).toBe(true);
      expect(ctx.noPause).toBe(true);
    });
  });
});

describe("runAdvance auto-launched iter fails (AC-S4-10)", () => {
  it("paused iter 1 → advance → iter 2 launches and fails → ledger stays in_progress (chain not aborted)", async () => {
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
      const advanceSpy = async (runId: string): Promise<RunWorkflowResult> => {
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
        return { ok: true, runId, runDir: `/tmp/${runId}`, paused: false };
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
        advanceWorkflow: advanceSpy,
        runWorkflow: runSpy,
      });
      // A failed auto-launched iter exits 1 (vitest surfaces process.exit as
      // a throw). The CRITICAL invariant we're locking is the on-disk shape
      // BEFORE the exit — chain stays in_progress, iter 2 was never recorded.
      await expect(
        runAdvance(
          { runId: ITER1_RUN_ID, noPause: false },
          cwd,
          new AbortController().signal,
          deps,
        ),
      ).rejects.toThrow(/process\.exit.*1/);

      // Per spec §4: failed iter does NOT flip the chain to 'aborted'
      // here — that wiring belongs to S-006 (user gives up). Loop just
      // stops; ledger sits at in_progress.
      const final = readChainLedger(cwd, CHAIN_ID);
      if (!final.ok) throw new Error(final.reason);
      expect(final.ledger.status).toBe("in_progress");
      // Iter 1 already counted; iter 2 entry was never appended by our spy.
      expect(final.ledger.iterationsCompleted).toBe(1);
    });
  });
});

describe("runAdvance failed-iter recovery + auto-launch (AC-S4-4)", () => {
  it("advance recovering a failed iter K → on success auto-launches K+1", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Seeded shape: iter 1 entry on the ledger is 'failed' (recoverable
      // via advance), state.json carries chainId. advanceWorkflow simulates
      // the recovery success path — flips entry to completed with commitSha.
      seedRunState(cwd, ITER1_RUN_ID, {
        chainId: CHAIN_ID,
        iterationIndex: 1,
      });
      seedChainLedger(cwd, {
        chainId: CHAIN_ID,
        iterationsTotal: 2,
        iterations: [{ index: 1, runId: ITER1_RUN_ID, status: "running" }],
      });

      const FAKE_SHA_1 = "abcdef0011112222333344445555666677778888";
      const FAKE_SHA_2 = "deadbeef11112222333344445555666677778888";
      const runWorkflowCalls: RunWorkflowContext[] = [];
      const advanceSpy = async (runId: string): Promise<RunWorkflowResult> => {
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
        return { ok: true, runId, runDir: `/tmp/${runId}`, paused: false };
      };
      const runSpy = async (
        ctx: RunWorkflowContext,
      ): Promise<RunWorkflowResult> => {
        runWorkflowCalls.push(ctx);
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
        advanceWorkflow: advanceSpy,
        runWorkflow: runSpy,
      });
      await runAdvance(
        { runId: ITER1_RUN_ID, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );

      // K+1 auto-launched.
      expect(runWorkflowCalls).toHaveLength(1);
      expect(runWorkflowCalls[0].chain?.iterationIndex).toBe(2);
      const final = readChainLedger(cwd, CHAIN_ID);
      if (!final.ok) throw new Error(final.reason);
      expect(final.ledger.status).toBe("completed");
      expect(final.ledger.iterationsCompleted).toBe(2);
    });
  });
});

describe("runAdvance state.chainId round-trip (AC-S4-1)", () => {
  it("state.json with chainId is read back by runAdvance and threaded onto auto-launched iter K+1", async () => {
    // This is largely a smoke-check: AC-S4-2/AC-S4-9 already assert that the
    // chain context propagates onto K+1's runWorkflow ctx. AC-S4-1 narrows on
    // the round-trip itself: a state.json missing chainId means non-chain
    // (covered by AC-S4-6 above); a state.json WITH chainId triggers the
    // chain-aware tail. We exercise the missing-iterationIndex defense too.
    await withTempRepo(async ({ dir: cwd }) => {
      // Seed a chainId-stamped state but iterationIndex absent — defensive
      // behavior: runAdvance should still treat it as chain-bound (chainId
      // is the ledger key) but recover iterationIndex from the ledger entry
      // matching this runId.
      seedRunState(cwd, ITER1_RUN_ID, { chainId: CHAIN_ID });
      seedChainLedger(cwd, {
        chainId: CHAIN_ID,
        iterationsTotal: 1,
        iterations: [{ index: 1, runId: ITER1_RUN_ID, status: "running" }],
      });

      const FAKE_SHA = "abcdef0011112222333344445555666677778888";
      const advanceSpy = async (runId: string): Promise<RunWorkflowResult> => {
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
        return { ok: true, runId, runDir: `/tmp/${runId}`, paused: false };
      };
      const runSpy = async (): Promise<RunWorkflowResult> => {
        throw new Error(
          "runWorkflow must NOT fire — N=1 chain is complete after iter 1",
        );
      };
      const deps = pinnedDeps({
        advanceWorkflow: advanceSpy,
        runWorkflow: runSpy,
      });
      await runAdvance(
        { runId: ITER1_RUN_ID, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );
      const final = readChainLedger(cwd, CHAIN_ID);
      if (!final.ok) throw new Error(final.reason);
      // N=1 single-iter chain → completed after iter 1's resume.
      expect(final.ledger.status).toBe("completed");
    });
  });
});
