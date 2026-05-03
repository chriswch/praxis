import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runRun } from "../../src/cli.js";
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
  RunWorkflowContext,
  RunWorkflowResult,
} from "../../src/workflow/runner.js";
import type { CreateQueryFn, Deps } from "../../src/workflow/stage.js";
import { RecordingReporter } from "../support/recording-reporter.js";
import { withTempRepo } from "../support/tmp-repo.js";

/**
 * S-003 — `runRun` multi-iteration loop. Suite uses an injected `runWorkflow`
 * spy (the optional `Deps & { runWorkflow? }` field on the CLI surface) so we
 * can assert per-iteration argument shape (flags, chainId, iterationIndex)
 * and ledger transitions WITHOUT spinning up the real 7-stage workflow on
 * every test. The real-runner end-to-end paths live in
 * `tests/e2e/run-iterations-multi.test.ts`.
 */

const STUB_RUN_IDS = [
  "2026-05-02-1430-0001",
  "2026-05-02-1430-0002",
  "2026-05-02-1430-0003",
];

function noopQueryFn(): CreateQueryFn {
  // The injected runWorkflow spy never actually dispatches — but `Deps`
  // requires a function shape, so satisfy the contract with a stub that
  // would throw if anything called it.
  return () => {
    throw new Error(
      "noopQueryFn: should not be called when runWorkflow is stubbed",
    );
  };
}

function pinnedDeps(
  runWorkflow: (
    ctx: RunWorkflowContext,
    deps: Deps,
  ) => Promise<RunWorkflowResult>,
  opts: { reporter?: Reporter } = {},
): Deps & {
  runWorkflow: (
    ctx: RunWorkflowContext,
    deps: Deps,
  ) => Promise<RunWorkflowResult>;
} {
  return {
    clock: () => new Date("2026-05-02T14:30:12Z"),
    rng: (n) => new Uint8Array([0x9f, 0x3c]).slice(0, n),
    createQueryFn: noopQueryFn(),
    reporter: opts.reporter ?? new LineReporter(),
    commit: () => ({ ok: true, skipped: true }),
    runPreflight,
    appendPraxisToGitignore,
    runWorkflow,
  };
}

/**
 * Build a runWorkflow spy that returns an `ok` result for the first `n`
 * iterations (using the supplied run-ids), recording every received context.
 * Marks each iteration as if it landed a real commit by writing a stub
 * commit-bearing ledger entry — the spy itself owns the ledger writes a real
 * runner would have made (since runRun reads them back to detect cascade-skip).
 */
type SpyRecord = {
  contexts: RunWorkflowContext[];
};

function happyRunWorkflowSpy(
  cwd: string,
  runIds: string[],
  shaPrefix = "abcdef00",
): {
  fn: (ctx: RunWorkflowContext, deps: Deps) => Promise<RunWorkflowResult>;
  record: SpyRecord;
} {
  const record: SpyRecord = { contexts: [] };
  let call = 0;
  const fn = async (
    ctx: RunWorkflowContext,
    _deps: Deps,
  ): Promise<RunWorkflowResult> => {
    record.contexts.push(ctx);
    const runId = runIds[call] ?? `run-${call}`;
    call++;
    // Mimic what the real runner does: write the ledger so runRun's
    // post-iteration ledger-read sees a 'completed' entry with a commitSha.
    if (ctx.chain) {
      const ledgerPath = join(
        cwd,
        ".praxis",
        "chains",
        `${ctx.chain.chainId}.json`,
      );
      let base: ChainLedger;
      if (existsSync(ledgerPath)) {
        const r = readChainLedger(cwd, ctx.chain.chainId);
        if (!r.ok) throw new Error(r.reason);
        base = r.ledger;
      } else {
        base = buildInitialChainLedger({
          chainId: ctx.chain.chainId,
          intent: ctx.intent,
          iterationsTotal: ctx.chain.iterationsTotal,
          flags: ctx.chain.flags,
          createdAt: "2026-05-02T14:30:12Z",
        });
      }
      const next = appendIteration(
        base,
        {
          index: ctx.chain.iterationIndex,
          runId,
          status: "completed",
          commitSha: `${shaPrefix}${String(ctx.chain.iterationIndex).padStart(32, "0")}`,
        },
        "2026-05-02T14:30:12Z",
      );
      // Also bump iterationsCompleted manually since we go straight to completed.
      writeChainLedger(cwd, {
        ...next,
        iterationsCompleted: next.iterations.filter(
          (e) => e.status === "completed",
        ).length,
      });
    }
    return {
      ok: true,
      runId,
      runDir: `/tmp/${runId}`,
      paused: false,
    };
  };
  return { fn, record };
}

describe("runRun multi-iteration loop (AC-S3-9: flags carried forward)", () => {
  it("forwards chain.flags to every iteration's runWorkflow call", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const { fn, record } = happyRunWorkflowSpy(cwd, STUB_RUN_IDS);
      const deps = pinnedDeps(fn);
      const result = await runRun(
        {
          intent: "ship the chain",
          allowDirty: true,
          noPause: true,
          iterations: 3,
        },
        cwd,
        new AbortController().signal,
        deps,
      );
      expect(result.ok).toBe(true);

      expect(record.contexts).toHaveLength(3);
      // Every iteration receives the SAME flags shape (allowDirty + noPause).
      for (const ctx of record.contexts) {
        expect(ctx.chain).toBeDefined();
        expect(ctx.chain?.flags).toEqual({
          allowDirty: true,
          noPause: true,
        });
        // Top-level allowDirty/noPause also forwarded (so iter 2+ can no-op
        // preflight from the same context shape).
        expect(ctx.allowDirty).toBe(true);
        expect(ctx.noPause).toBe(true);
      }
    });
  });

  it("threads chainId verbatim across iterations and increments iterationIndex 1..N", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const { fn, record } = happyRunWorkflowSpy(cwd, STUB_RUN_IDS);
      const deps = pinnedDeps(fn);
      const result = await runRun(
        {
          intent: "ship the chain",
          allowDirty: false,
          noPause: false,
          iterations: 3,
        },
        cwd,
        new AbortController().signal,
        deps,
      );
      // Pause behaviour: noPause=false but the spy returns paused=false anyway,
      // so the loop runs all 3 iterations.
      expect(result.ok).toBe(true);

      const chainIds = record.contexts.map((c) => c.chain?.chainId);
      expect(new Set(chainIds).size).toBe(1);
      expect(chainIds[0]).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}-[0-9a-f]{4}$/);

      const indices = record.contexts.map((c) => c.chain?.iterationIndex);
      expect(indices).toEqual([1, 2, 3]);

      const totals = record.contexts.map((c) => c.chain?.iterationsTotal);
      expect(totals).toEqual([3, 3, 3]);
    });
  });
});

/**
 * S-006 — `runRun` chain termination paths. The chain ledger is the source
 * of truth for the chain's terminal status; on iteration failure the loop
 * must flip the on-disk ledger to either `aborted` (validator/timeout/
 * commit_failed/etc.) or `cancelled` (SIGINT). Failure of iter 1 vs. mid-
 * chain (K=2..N) both share the same termination shape because both go
 * through `launchRemainingIterations`'s `!result.ok` branch.
 */
describe("runRun chain failure → ledger 'aborted' (S-006 AC-S6-1)", () => {
  it("AC-S6-1: iter 1 fails → ledger flips to 'aborted'; iters 2..N never start", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Spy iter 1: writes the running entry to the ledger then returns the
      // failure shape (the real runner does both during executeStages).
      let calls = 0;
      const failingSpy = async (
        ctx: RunWorkflowContext,
        _deps: Deps,
      ): Promise<RunWorkflowResult> => {
        calls += 1;
        if (!ctx.chain) throw new Error("expected chain context");
        // Mimic runner: write the iter-1 entry as 'running' before returning.
        const seeded = buildInitialChainLedger({
          chainId: ctx.chain.chainId,
          intent: ctx.intent,
          iterationsTotal: ctx.chain.iterationsTotal,
          flags: ctx.chain.flags,
          createdAt: "2026-05-02T14:30:12Z",
        });
        const next = appendIteration(
          seeded,
          { index: 1, runId: STUB_RUN_IDS[0], status: "running" },
          "2026-05-02T14:30:12Z",
        );
        writeChainLedger(cwd, next);
        return {
          ok: false,
          reason: "validator_failed: bad artifact",
          runId: STUB_RUN_IDS[0],
          runDir: `/tmp/${STUB_RUN_IDS[0]}`,
          failedStageId: "clarify-assess",
          status: "failed",
          chainId: ctx.chain.chainId,
          iterationIndex: 1,
        };
      };
      const deps = pinnedDeps(failingSpy);
      const result = await runRun(
        {
          intent: "ship the chain",
          allowDirty: false,
          noPause: true,
          iterations: 3,
        },
        cwd,
        new AbortController().signal,
        deps,
      );
      expect(result.ok).toBe(false);
      // Only iter 1 ran — iters 2..N never started.
      expect(calls).toBe(1);
      // Ledger flipped to 'aborted'.
      const chainsDir = join(cwd, ".praxis", "chains");
      const dirEntries = await import("node:fs").then((fs) =>
        fs.readdirSync(chainsDir),
      );
      expect(dirEntries).toHaveLength(1);
      const chainId = dirEntries[0].replace(/\.json$/, "");
      const read = readChainLedger(cwd, chainId);
      if (!read.ok) throw new Error(read.reason);
      expect(read.ledger.status).toBe("aborted");
    });
  });
});

describe("runRun chain SIGINT → ledger 'cancelled' (S-006 AC-S6-2)", () => {
  it("AC-S6-2: iter 1 returns status='cancelled' (SIGINT) → ledger flips to 'cancelled'", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      let calls = 0;
      const cancelledSpy = async (
        ctx: RunWorkflowContext,
        _deps: Deps,
      ): Promise<RunWorkflowResult> => {
        calls += 1;
        if (!ctx.chain) throw new Error("expected chain context");
        const seeded = buildInitialChainLedger({
          chainId: ctx.chain.chainId,
          intent: ctx.intent,
          iterationsTotal: ctx.chain.iterationsTotal,
          flags: ctx.chain.flags,
          createdAt: "2026-05-02T14:30:12Z",
        });
        const next = appendIteration(
          seeded,
          { index: 1, runId: STUB_RUN_IDS[0], status: "running" },
          "2026-05-02T14:30:12Z",
        );
        writeChainLedger(cwd, next);
        return {
          ok: false,
          reason: "cancelled by user (SIGINT)",
          runId: STUB_RUN_IDS[0],
          runDir: `/tmp/${STUB_RUN_IDS[0]}`,
          failedStageId: "clarify-assess",
          status: "cancelled",
          chainId: ctx.chain.chainId,
          iterationIndex: 1,
        };
      };
      const deps = pinnedDeps(cancelledSpy);
      const result = await runRun(
        {
          intent: "ship the chain",
          allowDirty: false,
          noPause: true,
          iterations: 3,
        },
        cwd,
        new AbortController().signal,
        deps,
      );
      expect(result.ok).toBe(false);
      expect(calls).toBe(1);
      const dirEntries = await import("node:fs").then((fs) =>
        fs.readdirSync(join(cwd, ".praxis", "chains")),
      );
      const chainId = dirEntries[0].replace(/\.json$/, "");
      const read = readChainLedger(cwd, chainId);
      if (!read.ok) throw new Error(read.reason);
      expect(read.ledger.status).toBe("cancelled");
    });
  });
});

describe("runRun mid-chain failure (K>=2) → ledger 'aborted' (S-006 AC-S6-9)", () => {
  it("AC-S6-9: iter 1 succeeds, iter 2 fails → ledger flips to 'aborted'; iter 3 never starts", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      let calls = 0;
      const dispatch = async (
        ctx: RunWorkflowContext,
        _deps: Deps,
      ): Promise<RunWorkflowResult> => {
        calls += 1;
        if (!ctx.chain) throw new Error("expected chain context");
        const k = ctx.chain.iterationIndex;
        if (k === 1) {
          // Iter 1: writes a completed entry with a real-looking commit SHA so
          // the loop's cascade-skip predicate keeps going to iter 2.
          const seeded = buildInitialChainLedger({
            chainId: ctx.chain.chainId,
            intent: ctx.intent,
            iterationsTotal: ctx.chain.iterationsTotal,
            flags: ctx.chain.flags,
            createdAt: "2026-05-02T14:30:12Z",
          });
          const withIter1 = appendIteration(
            seeded,
            {
              index: 1,
              runId: STUB_RUN_IDS[0],
              status: "completed",
              commitSha: "abcdef00".repeat(5),
            },
            "2026-05-02T14:30:12Z",
          );
          writeChainLedger(cwd, {
            ...withIter1,
            iterationsCompleted: 1,
          });
          return {
            ok: true,
            runId: STUB_RUN_IDS[0],
            runDir: `/tmp/${STUB_RUN_IDS[0]}`,
            paused: false,
            chainId: ctx.chain.chainId,
            iterationIndex: 1,
          };
        }
        if (k === 2) {
          // Iter 2: writes the running entry (mimicking the runner) then
          // returns a failure. launchRemainingIterations should detect this
          // and flip the ledger to 'aborted' (NOT loop on to iter 3).
          const r = readChainLedger(cwd, ctx.chain.chainId);
          if (!r.ok) throw new Error(r.reason);
          const next = appendIteration(
            r.ledger,
            { index: 2, runId: STUB_RUN_IDS[1], status: "running" },
            "2026-05-02T14:30:12Z",
          );
          writeChainLedger(cwd, next);
          return {
            ok: false,
            reason: "validator_failed: bad artifact",
            runId: STUB_RUN_IDS[1],
            runDir: `/tmp/${STUB_RUN_IDS[1]}`,
            failedStageId: "clarify-assess",
            status: "failed",
            chainId: ctx.chain.chainId,
            iterationIndex: 2,
          };
        }
        throw new Error(`runWorkflow must NOT fire for iter ${k}`);
      };
      const deps = pinnedDeps(dispatch);
      const result = await runRun(
        {
          intent: "ship the chain",
          allowDirty: false,
          noPause: true,
          iterations: 3,
        },
        cwd,
        new AbortController().signal,
        deps,
      );
      expect(result.ok).toBe(false);
      // Only iter 1 + iter 2 ran; iter 3 never started.
      expect(calls).toBe(2);
      const dirEntries = await import("node:fs").then((fs) =>
        fs.readdirSync(join(cwd, ".praxis", "chains")),
      );
      const chainId = dirEntries[0].replace(/\.json$/, "");
      const read = readChainLedger(cwd, chainId);
      if (!read.ok) throw new Error(read.reason);
      expect(read.ledger.status).toBe("aborted");
      // Iter 1 completed, iter 2 entry on disk as 'running' (we don't flip
      // the iteration entry — only the chain status). Iter 3 never appended.
      expect(read.ledger.iterations).toHaveLength(2);
    });
  });
});

/**
 * S-007 — `runRun` chain-end emit. After `handleIterationOutcome` flips the
 * chain ledger to `completed` (final iter landed clean) or `completed-early`
 * (auto-commit cascade-skipped), the CLI must emit `reporter.chainEnd?.(...)`
 * so operators see the chain's final shape on stdout. The emit lives just
 * after the `setChainStatus` writeChainLedger call.
 */
describe("runRun chainEnd emit on completed (S-007 AC-S7-7)", () => {
  it("AC-S7-7: N=3 happy path → reporter.chainEnd fires once with status='completed', K=N", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const reporter = new RecordingReporter();
      const { fn } = happyRunWorkflowSpy(cwd, STUB_RUN_IDS);
      const deps = pinnedDeps(fn, { reporter });
      const result = await runRun(
        {
          intent: "ship the chain",
          allowDirty: true,
          noPause: true,
          iterations: 3,
        },
        cwd,
        new AbortController().signal,
        deps,
      );
      expect(result.ok).toBe(true);
      const ends = reporter.calls.filter((c) => c.kind === "chainEnd");
      expect(ends).toHaveLength(1);
      expect(ends[0]).toMatchObject({
        kind: "chainEnd",
        status: "completed",
        iterationsCompleted: 3,
        iterationsTotal: 3,
      });
      // chainStart is emitted by the real runner (covered by
      // tests/workflow/runner-chain.test.ts); this CLI-level test stubs the
      // dispatcher, so we only assert chainEnd here.
    });
  });
});

describe("runRun chainEnd emit on cascade-skip (S-007 AC-S7-8)", () => {
  it("auto-commit cascade-skip → ledger flips to 'completed-early'; reporter.chainEnd fires with that status", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Iter 1: writes a 'completed' entry WITHOUT commitSha (simulates
      // cascade-skip on auto-commit). Iter 2 should never start.
      let calls = 0;
      const cascadeSpy = async (
        ctx: RunWorkflowContext,
        _deps: Deps,
      ): Promise<RunWorkflowResult> => {
        calls += 1;
        if (!ctx.chain) throw new Error("expected chain context");
        const seeded = buildInitialChainLedger({
          chainId: ctx.chain.chainId,
          intent: ctx.intent,
          iterationsTotal: ctx.chain.iterationsTotal,
          flags: ctx.chain.flags,
          createdAt: "2026-05-02T14:30:12Z",
        });
        const next = appendIteration(
          seeded,
          {
            index: 1,
            runId: STUB_RUN_IDS[0],
            status: "completed",
            // no commitSha — cascade-skip shape.
          },
          "2026-05-02T14:30:12Z",
        );
        writeChainLedger(cwd, { ...next, iterationsCompleted: 1 });
        return {
          ok: true,
          runId: STUB_RUN_IDS[0],
          runDir: `/tmp/${STUB_RUN_IDS[0]}`,
          paused: false,
        };
      };
      const reporter = new RecordingReporter();
      const deps = pinnedDeps(cascadeSpy, { reporter });
      const result = await runRun(
        {
          intent: "ship the chain",
          allowDirty: true,
          noPause: true,
          iterations: 3,
        },
        cwd,
        new AbortController().signal,
        deps,
      );
      expect(result.ok).toBe(true);
      // Only iter 1 ran.
      expect(calls).toBe(1);
      const ends = reporter.calls.filter((c) => c.kind === "chainEnd");
      expect(ends).toHaveLength(1);
      expect(ends[0]).toMatchObject({
        kind: "chainEnd",
        status: "completed-early",
        iterationsCompleted: 1,
        iterationsTotal: 3,
      });
    });
  });
});

describe("runRun chainEnd emit on aborted (S-007 AC-S7-9)", () => {
  it("AC-S7-9: iter 1 fails → reporter.chainEnd fires with status='aborted'", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const failingSpy = async (
        ctx: RunWorkflowContext,
        _deps: Deps,
      ): Promise<RunWorkflowResult> => {
        if (!ctx.chain) throw new Error("expected chain context");
        const seeded = buildInitialChainLedger({
          chainId: ctx.chain.chainId,
          intent: ctx.intent,
          iterationsTotal: ctx.chain.iterationsTotal,
          flags: ctx.chain.flags,
          createdAt: "2026-05-02T14:30:12Z",
        });
        const next = appendIteration(
          seeded,
          { index: 1, runId: STUB_RUN_IDS[0], status: "running" },
          "2026-05-02T14:30:12Z",
        );
        writeChainLedger(cwd, next);
        return {
          ok: false,
          reason: "validator_failed: bad artifact",
          runId: STUB_RUN_IDS[0],
          runDir: `/tmp/${STUB_RUN_IDS[0]}`,
          failedStageId: "clarify-assess",
          status: "failed",
          chainId: ctx.chain.chainId,
          iterationIndex: 1,
        };
      };
      const reporter = new RecordingReporter();
      const deps = pinnedDeps(failingSpy, { reporter });
      const result = await runRun(
        {
          intent: "ship the chain",
          allowDirty: false,
          noPause: true,
          iterations: 3,
        },
        cwd,
        new AbortController().signal,
        deps,
      );
      expect(result.ok).toBe(false);
      const ends = reporter.calls.filter((c) => c.kind === "chainEnd");
      expect(ends).toHaveLength(1);
      expect(ends[0]).toMatchObject({
        kind: "chainEnd",
        status: "aborted",
        // Iter 1 failed before recording any 'completed' entry; ledger reads 0.
        iterationsCompleted: 0,
        iterationsTotal: 3,
      });
    });
  });
});

describe("runRun chainEnd emit on cancelled (S-007 AC-S7-10)", () => {
  it("AC-S7-10: iter 1 SIGINT → reporter.chainEnd fires with status='cancelled'", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const cancelSpy = async (
        ctx: RunWorkflowContext,
        _deps: Deps,
      ): Promise<RunWorkflowResult> => {
        if (!ctx.chain) throw new Error("expected chain context");
        const seeded = buildInitialChainLedger({
          chainId: ctx.chain.chainId,
          intent: ctx.intent,
          iterationsTotal: ctx.chain.iterationsTotal,
          flags: ctx.chain.flags,
          createdAt: "2026-05-02T14:30:12Z",
        });
        const next = appendIteration(
          seeded,
          { index: 1, runId: STUB_RUN_IDS[0], status: "running" },
          "2026-05-02T14:30:12Z",
        );
        writeChainLedger(cwd, next);
        return {
          ok: false,
          reason: "cancelled by user (SIGINT)",
          runId: STUB_RUN_IDS[0],
          runDir: `/tmp/${STUB_RUN_IDS[0]}`,
          failedStageId: "clarify-assess",
          status: "cancelled",
          chainId: ctx.chain.chainId,
          iterationIndex: 1,
        };
      };
      const reporter = new RecordingReporter();
      const deps = pinnedDeps(cancelSpy, { reporter });
      const result = await runRun(
        {
          intent: "ship the chain",
          allowDirty: false,
          noPause: true,
          iterations: 3,
        },
        cwd,
        new AbortController().signal,
        deps,
      );
      expect(result.ok).toBe(false);
      const ends = reporter.calls.filter((c) => c.kind === "chainEnd");
      expect(ends).toHaveLength(1);
      expect(ends[0]).toMatchObject({
        kind: "chainEnd",
        status: "cancelled",
        iterationsCompleted: 0,
        iterationsTotal: 3,
      });
    });
  });
});

describe("runRun standalone (no --iterations) → no chain events emitted (S-007 AC-S7-14 regression)", () => {
  it("standalone happy path: chainStart and chainEnd never fire", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const standaloneSpy = async (
        _ctx: RunWorkflowContext,
        _deps: Deps,
      ): Promise<RunWorkflowResult> => {
        return {
          ok: true,
          runId: STUB_RUN_IDS[0],
          runDir: `/tmp/${STUB_RUN_IDS[0]}`,
          paused: false,
        };
      };
      const reporter = new RecordingReporter();
      const deps = pinnedDeps(standaloneSpy, { reporter });
      const result = await runRun(
        {
          intent: "standalone",
          allowDirty: true,
          noPause: true,
          // iterations undefined → standalone path; no ledger, no chain events.
        },
        cwd,
        new AbortController().signal,
        deps,
      );
      expect(result.ok).toBe(true);
      expect(reporter.countOf("chainStart")).toBe(0);
      expect(reporter.countOf("chainEnd")).toBe(0);
    });
  });
});
