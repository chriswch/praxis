import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runAdvance } from "../../src/cli.js";
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
  AdvanceWorkflowContext,
  RunWorkflowContext,
  RunWorkflowResult,
} from "../../src/workflow/runner.js";
import type { CreateQueryFn, Deps } from "../../src/workflow/stage.js";
import { type State, writeState } from "../../src/workflow/state.js";
import { RecordingReporter } from "../support/recording-reporter.js";
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
        // S-004 M-2: runner threads chain identity onto the success result;
        // the spy mirrors that so runAdvance can drive the chain-aware tail
        // without re-reading state.json.
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
        // S-004 M-2: spy mirrors the runner threading chain identity onto the
        // success result.
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
        // S-004 M-2: spy mirrors the runner threading chain identity onto the
        // success result.
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
        // S-004 M-2: spy mirrors the runner threading chain identity onto the
        // success result.
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
        // S-004 M-2: spy mirrors the runner threading chain identity onto the
        // success result.
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

describe("runAdvance auto-launched iter fails (AC-S4-10 + S-006 AC-S6-7)", () => {
  it("paused iter 1 → advance → iter 2 launches and fails → ledger flips to 'aborted'", async () => {
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
        // S-004 M-2: spy mirrors the runner threading chain identity onto the
        // success result.
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
        advanceWorkflow: advanceSpy,
        runWorkflow: runSpy,
      });
      // A failed auto-launched iter exits 1 (vitest surfaces process.exit as
      // a throw). The CRITICAL invariant we're locking is the on-disk shape
      // BEFORE the exit — chain flips to 'aborted', iter 2 was never recorded.
      await expect(
        runAdvance(
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
        // S-004 M-2: spy mirrors the runner threading chain identity onto the
        // success result.
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
    // chain-aware tail.
    await withTempRepo(async ({ dir: cwd }) => {
      // Seed a chain-bound state. Per spec AC-7, chainId and iterationIndex
      // are always stamped together on a chain iteration's state.json — the
      // runner's recoverChainContextFromState bails if either is missing, and
      // the CLI relies on the runner threading both fields onto the success
      // result (S-004 M-2). N=1 single-iter chain → ledger flips to completed
      // after iter 1's resume; no K+1 to launch.
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
        // S-004 M-2: spy mirrors the runner threading chain identity onto the
        // success result.
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

/**
 * S-006 AC-S6-5 — when `advanceWorkflow` returns a failure on a chain-bound
 * resume, the chain ledger's `status` must flip to `aborted` (or `cancelled`
 * when the underlying failure was a SIGINT) before the CLI exits. Mirrors
 * the orchestrator's resolution: helper invocation goes in `runResume`'s
 * `!result.ok` branch, keyed off `result.chainId` (threaded by the runner
 * via S-6 AC-S6-13).
 */
describe("runAdvance dispatcher failure → ledger 'aborted' (S-006 AC-S6-5)", () => {
  it("AC-S6-5: advanceWorkflow returns failure on a chain-bound resume → ledger flips to 'aborted'", async () => {
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

      const advanceSpy = async (runId: string): Promise<RunWorkflowResult> => {
        // Recovery failure: dispatcher returns the failure shape with chain
        // identity threaded onto it (per S-6 AC-S6-13).
        return {
          ok: false,
          reason: "artifact missing for stage clarify-assess",
          runId,
          runDir: `/tmp/${runId}`,
          failedStageId: "clarify-assess",
          status: "failed",
          chainId: CHAIN_ID,
          iterationIndex: 1,
        };
      };
      const runSpy = async (): Promise<RunWorkflowResult> => {
        throw new Error(
          "runWorkflow must NOT fire — advance dispatcher itself failed",
        );
      };
      const deps = pinnedDeps({
        advanceWorkflow: advanceSpy,
        runWorkflow: runSpy,
      });
      // process.exit(1) surfaces as throw via vitest.
      await expect(
        runAdvance(
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

  it("AC-S6-5 (cancelled variant): advanceWorkflow returns status='cancelled' → ledger flips to 'cancelled'", async () => {
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

      const advanceSpy = async (runId: string): Promise<RunWorkflowResult> => ({
        ok: false,
        reason: "cancelled by user (SIGINT)",
        runId,
        runDir: `/tmp/${runId}`,
        failedStageId: "clarify-assess",
        status: "cancelled",
        chainId: CHAIN_ID,
        iterationIndex: 1,
      });
      const deps = pinnedDeps({
        advanceWorkflow: advanceSpy,
        runWorkflow: async (): Promise<RunWorkflowResult> => {
          throw new Error("runWorkflow must NOT fire");
        },
      });
      await expect(
        runAdvance(
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
 * S-006 AC-S6-8 — auto-launched K+1 inside `runAdvance`'s tail returns
 * status='cancelled' (SIGINT mid-iteration). The shared
 * `launchRemainingIterations` helper must flip the chain to 'cancelled'.
 * Companion to AC-S6-7 (which covers the default 'aborted' case via the
 * existing AC-S4-10 test, now updated).
 */
describe("runAdvance auto-launched iter SIGINT → ledger 'cancelled' (S-006 AC-S6-8)", () => {
  it("AC-S6-8: paused iter 1 → advance → iter 2 cancelled → ledger flips to 'cancelled'", async () => {
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
        return {
          ok: true,
          runId,
          runDir: `/tmp/${runId}`,
          paused: false,
          chainId: CHAIN_ID,
          iterationIndex: 1,
        };
      };
      const runSpy = async (): Promise<RunWorkflowResult> => ({
        ok: false,
        reason: "cancelled by user (SIGINT)",
        runId: ITER2_RUN_ID,
        runDir: `/tmp/${ITER2_RUN_ID}`,
        failedStageId: "clarify-assess",
        status: "cancelled",
      });
      const deps = pinnedDeps({
        advanceWorkflow: advanceSpy,
        runWorkflow: runSpy,
      });
      await expect(
        runAdvance(
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
 * S-007 — `runAdvance` reporter wiring. The resume dispatcher
 * (`advanceWorkflow`) re-enters `executeStages` directly, so the chain banner
 * must NOT re-fire on the resumed iteration (AC-S7-5). The auto-launched
 * iter K+1 goes through `runWorkflow` again, so its banner DOES fire — but
 * that emit lives in the runner; the CLI's job here is just forwarding the
 * reporter through deps.
 *
 * The chainEnd line, by contrast, is the CLI's responsibility — fired after
 * `handleIterationOutcome` flips the ledger to a terminal status (AC-S7-7) or
 * after `writeChainTerminalStatus` flips it to aborted/cancelled (AC-S7-9).
 */
describe("runAdvance reporter chain events (S-007 AC-S7-5/AC-S7-7)", () => {
  it("AC-S7-5: resumed iter (advanceWorkflow path) → CLI never invokes reporter.chainStart on its own", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Final-iter pause: iter 2 of 2 already 'running' on disk; advance
      // completes it cleanly. No auto-launch (K === N), so the only path
      // that could emit chainStart is the resume dispatcher itself — which
      // must not.
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

      const FAKE_SHA_2 = "abcdef0011112222333344445555666677778888";
      const advanceSpy = async (
        runId: string,
      ): Promise<RunWorkflowResult> => {
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

      const reporter = new RecordingReporter();
      const deps = pinnedDeps({
        advanceWorkflow: advanceSpy,
        // runWorkflow not provided — final iter, no auto-launch, so the spy
        // would never fire anyway. Throw if it does to lock the contract.
        runWorkflow: async () => {
          throw new Error("auto-launch must NOT fire when K === N");
        },
        reporter,
      });
      await runAdvance(
        { runId: ITER2_RUN_ID, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );
      // Resume re-enters executeStages directly via advanceWorkflow; the CLI
      // never invokes reporter.chainStart itself. The advanceWorkflow spy
      // doesn't either (it returns synthetic results), so chainStart count = 0.
      expect(reporter.countOf("chainStart")).toBe(0);
      // chainEnd fires once for the completed final iter (AC-S7-7).
      expect(reporter.countOf("chainEnd")).toBe(1);
    });
  });

  it("AC-S7-7 (advance happy path): chain status flips to completed → reporter.chainEnd fires once", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Mid-chain pause: iter 1 of 2 paused, advance completes it, auto-
      // launches iter 2. We assert chainEnd fires exactly once at the end.
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
      const advanceSpy = async (
        runId: string,
      ): Promise<RunWorkflowResult> => {
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
      const reporter = new RecordingReporter();
      const deps = pinnedDeps({
        advanceWorkflow: advanceSpy,
        runWorkflow: runSpy,
        reporter,
      });
      await runAdvance(
        { runId: ITER1_RUN_ID, noPause: false },
        cwd,
        new AbortController().signal,
        deps,
      );
      const ends = reporter.calls.filter((c) => c.kind === "chainEnd");
      expect(ends).toHaveLength(1);
      expect(ends[0]).toMatchObject({
        kind: "chainEnd",
        status: "completed",
        iterationsCompleted: 2,
        iterationsTotal: 2,
      });
    });
  });
});

describe("runAdvance reporter chain events on failure (S-007 AC-S7-9)", () => {
  it("AC-S7-9: dispatcher returns failed → reporter.chainEnd fires once with status='aborted'", async () => {
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
      const failingAdvance = async (
        runId: string,
      ): Promise<RunWorkflowResult> => {
        return {
          ok: false,
          reason: "validator_failed: bad artifact",
          runId,
          runDir: `/tmp/${runId}`,
          failedStageId: "clarify-assess",
          status: "failed",
          chainId: CHAIN_ID,
          iterationIndex: 1,
        };
      };
      const reporter = new RecordingReporter();
      const deps = pinnedDeps({
        advanceWorkflow: failingAdvance,
        reporter,
      });
      // runResume calls process.exit(1) on failure; intercept to keep the test alive.
      const exitSpy = vi
        .spyOn(process, "exit")
        // biome-ignore lint/suspicious/noExplicitAny: spy stub.
        .mockImplementation(((_code?: number) => {
          throw new Error("process.exit(1)");
        }) as any);
      // Swallow stderr noise from the failure-print path.
      const errSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);
      try {
        await expect(
          runAdvance(
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
