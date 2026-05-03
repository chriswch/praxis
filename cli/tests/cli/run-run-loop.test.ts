import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runRun } from "../../src/cli.js";
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
  RunWorkflowContext,
  RunWorkflowResult,
} from "../../src/workflow/runner.js";
import type { CreateQueryFn, Deps } from "../../src/workflow/stage.js";
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
    reporter: new LineReporter(),
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
