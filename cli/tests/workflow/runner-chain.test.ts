import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAdvance, runRetry } from "../../src/cli.js";
import {
  AUTO_COMMIT_ID,
  CODE_IMPROVING_ID,
  CODE_REVIEWING_ID,
} from "../../src/config/defaults.js";
import type { PraxisConfig } from "../../src/config/schema.js";
import { LineReporter } from "../../src/ui/line-reporter.js";
import type { Reporter } from "../../src/ui/reporter.js";
import {
  buildInitialChainLedger,
  readChainLedger,
  writeChainLedger,
} from "../../src/workflow/chain.js";
import {
  appendPraxisToGitignore,
  runPreflight,
} from "../../src/workflow/preflight.js";
import {
  type RunWorkflowResult,
  runWorkflow,
} from "../../src/workflow/runner.js";
import type {
  CreateQueryFn,
  Deps,
  SdkMessage,
} from "../../src/workflow/stage.js";
import { type State, writeState } from "../../src/workflow/state.js";
import { RecordingReporter } from "../support/recording-reporter.js";
import { scriptedQuery } from "../support/scripted-query.js";
import { withTempRepo } from "../support/tmp-repo.js";

/**
 * S-002 — `runWorkflow` chain bootstrap. Suite covers the
 * `RunWorkflowContext.chain` plumbing: initial ledger write before the first
 * stage runs, state.json stamp of chainId/iterationIndex, terminal entry
 * patch on success, and back-compat (no chain context → no ledger).
 */

const CHAIN_ID = "2026-05-02-1430-9f3c";
const ITER1_RUN_ID = "2026-05-02-1430-7af2";

function noopMessages(sessionId = "sess_noop"): SdkMessage[] {
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
      message: { content: [{ type: "text", text: "ok\n" }] },
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
 * Single-stage workflow that pauses on its only stage. Lets the chain tests
 * exercise the bootstrap-then-stage-1 ordering (AC-S2-10) without dragging in
 * the full 7-stage default workflow on every assertion.
 */
const oneStagePauseConfig: PraxisConfig = {
  version: 1,
  workflow: [
    {
      id: "noop",
      systemPrompt: { file: "clarify-assess.md" },
      userPromptTemplate: "{{intent}}",
      outputArtifact: "noop.md",
      pauseAfter: true,
    },
  ],
};

/**
 * Two-stage workflow used by the commitSha-threading test: the first stage
 * is a generic noop (the test wraps its createQueryFn to advance HEAD via a
 * real `git commit` so the auto-commit clean-tree-skip predicate doesn't
 * fire), the second stage carries the canonical `auto-commit` id so the
 * runner's special-case commit hand-off dispatches.
 */
const noopThenCommitWorkflow: PraxisConfig = {
  version: 1,
  workflow: [
    {
      id: "noop",
      systemPrompt: { file: "clarify-assess.md" },
      userPromptTemplate: "{{intent}}",
      outputArtifact: "noop.md",
    },
    {
      id: "auto-commit",
      systemPrompt: { file: "auto-commit.md" },
      userPromptTemplate: "{{intent}}",
      outputArtifact: "07-commit.txt",
    },
  ],
};

function pinnedDeps(opts: {
  date?: Date;
  bytes?: Uint8Array;
  createQueryFn: CreateQueryFn;
  commit?: Deps["commit"];
  reporter?: Reporter;
}): Deps {
  return {
    clock: () => opts.date ?? new Date("2026-05-02T14:30:12Z"),
    rng: (n) => (opts.bytes ?? new Uint8Array([0x7a, 0xf2])).slice(0, n),
    createQueryFn: opts.createQueryFn,
    reporter: opts.reporter ?? new LineReporter(),
    commit: opts.commit ?? (() => ({ ok: true, skipped: true })),
    runPreflight,
    appendPraxisToGitignore,
  };
}

describe("runWorkflow chain bootstrap (AC-S2-9..AC-S2-17)", () => {
  it("AC-S2-9 + AC-S2-15: writes the chain ledger on disk with the chain context fields", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const result = await runWorkflow(
        {
          intent: "ship the chain ledger",
          cwd,
          allowDirty: true,
          config: oneStagePauseConfig,
          chain: {
            chainId: CHAIN_ID,
            iterationIndex: 1,
            iterationsTotal: 1,
            flags: { allowDirty: true, noPause: false },
          },
        },
        pinnedDeps({
          createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
        }),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      const ledgerPath = join(cwd, ".praxis", "chains", `${CHAIN_ID}.json`);
      expect(existsSync(ledgerPath)).toBe(true);
      const read = readChainLedger(cwd, CHAIN_ID);
      expect(read.ok).toBe(true);
      if (!read.ok) throw new Error(read.reason);
      expect(read.ledger.chainId).toBe(CHAIN_ID);
      expect(read.ledger.intent).toBe("ship the chain ledger");
      expect(read.ledger.iterationsTotal).toBe(1);
      expect(read.ledger.flags).toEqual({ allowDirty: true, noPause: false });
    });
  });

  it("AC-S2-9: appends the iter-1 entry referencing this run's runId", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const result = await runWorkflow(
        {
          intent: "ship it",
          cwd,
          allowDirty: true,
          config: oneStagePauseConfig,
          chain: {
            chainId: CHAIN_ID,
            iterationIndex: 1,
            iterationsTotal: 3,
            flags: { allowDirty: false, noPause: true },
          },
        },
        pinnedDeps({
          createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
        }),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
      expect(result.runId).toBe(ITER1_RUN_ID);

      const read = readChainLedger(cwd, CHAIN_ID);
      if (!read.ok) throw new Error(read.reason);
      expect(read.ledger.iterations).toHaveLength(1);
      expect(read.ledger.iterations[0]).toMatchObject({
        index: 1,
        runId: ITER1_RUN_ID,
      });
    });
  });

  it("AC-S2-10: ledger is on disk with iter-1 entry BEFORE the first stage runs", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Capture the ledger contents from inside stage-1's createQueryFn — by
      // the time the SDK is dispatched, the on-disk file must already include
      // the iter-1 entry.
      let snapshotAtStage1: ReturnType<typeof readChainLedger> | undefined;
      const probingQuery: CreateQueryFn = (_input) => {
        snapshotAtStage1 = readChainLedger(cwd, CHAIN_ID);
        return {
          pushUserMessage() {},
          stream: (async function* () {
            for (const m of noopMessages()) yield m;
          })(),
        };
      };
      const result = await runWorkflow(
        {
          intent: "ship it",
          cwd,
          allowDirty: true,
          config: oneStagePauseConfig,
          chain: {
            chainId: CHAIN_ID,
            iterationIndex: 1,
            iterationsTotal: 1,
            flags: { allowDirty: true, noPause: false },
          },
        },
        pinnedDeps({ createQueryFn: probingQuery }),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      expect(snapshotAtStage1).toBeDefined();
      if (!snapshotAtStage1?.ok) {
        throw new Error(
          `ledger missing at stage 1 dispatch: ${snapshotAtStage1?.ok === false ? snapshotAtStage1.reason : "undefined"}`,
        );
      }
      expect(snapshotAtStage1.ledger.iterations).toHaveLength(1);
      expect(snapshotAtStage1.ledger.iterations[0].index).toBe(1);
      expect(snapshotAtStage1.ledger.iterations[0].runId).toBe(ITER1_RUN_ID);
      // The entry starts in 'running' (terminal patch comes only on success).
      expect(snapshotAtStage1.ledger.iterations[0].status).toBe("running");
    });
  });

  it("AC-S2-11: state.json carries chainId + iterationIndex from chain context", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const result = await runWorkflow(
        {
          intent: "ship it",
          cwd,
          allowDirty: true,
          config: oneStagePauseConfig,
          chain: {
            chainId: CHAIN_ID,
            iterationIndex: 1,
            iterationsTotal: 5,
            flags: { allowDirty: true, noPause: false },
          },
        },
        pinnedDeps({
          createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
        }),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(persisted.chainId).toBe(CHAIN_ID);
      expect(persisted.iterationIndex).toBe(1);
    });
  });

  it("AC-S2-12: on happy-path success, iter entry flips to 'completed' with commitSha from auto-commit", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Stage 1's createQueryFn advances HEAD via a real `git commit` so the
      // auto-commit clean-tree-skip predicate does NOT fire on stage 2 — the
      // runner then dispatches deps.commit, which we stub to return a SHA.
      const fakeSha = "abcdef0123456789abcdef0123456789abcdef01";
      let call = 0;
      const composedQuery: CreateQueryFn = (_input) => {
        call++;
        if (call === 1) {
          // Real commit so HEAD advances past baselineSha.
          writeFileSync(join(cwd, "stage1-marker.txt"), "stage1\n", "utf8");
          spawnSync("git", ["add", "stage1-marker.txt"], { cwd });
          spawnSync("git", ["commit", "-m", "stage1"], { cwd });
        }
        return {
          pushUserMessage() {},
          stream: (async function* () {
            for (const m of noopMessages(`sess_${call}`)) yield m;
          })(),
        };
      };
      const result = await runWorkflow(
        {
          intent: "ship it",
          cwd,
          allowDirty: true,
          noPause: true,
          config: noopThenCommitWorkflow,
          chain: {
            chainId: CHAIN_ID,
            iterationIndex: 1,
            iterationsTotal: 1,
            flags: { allowDirty: true, noPause: true },
          },
        },
        pinnedDeps({
          createQueryFn: composedQuery,
          commit: () => ({ ok: true, sha: fakeSha }),
        }),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
      const read = readChainLedger(cwd, CHAIN_ID);
      if (!read.ok) throw new Error(read.reason);
      expect(read.ledger.iterations[0].status).toBe("completed");
      expect(read.ledger.iterations[0].commitSha).toBe(fakeSha);
      expect(read.ledger.iterationsCompleted).toBe(1);
    });
  });

  it("AC-S2-13: cascade-skip auto-commit (no real commit) marks iter completed with commitSha omitted", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Single-stage no-commit workflow — the runner's clean-tree skip
      // predicate doesn't fire for non-auto-commit ids, so use the noop
      // pause-after stage. After the stage runs, no auto-commit ran, so
      // state.stages['auto-commit'] is undefined — our recordChainIteration
      // helper must omit commitSha rather than crash.
      const noopNoPauseConfig: PraxisConfig = {
        version: 1,
        workflow: [
          {
            id: "noop",
            systemPrompt: { file: "clarify-assess.md" },
            userPromptTemplate: "{{intent}}",
            outputArtifact: "noop.md",
          },
        ],
      };
      const result = await runWorkflow(
        {
          intent: "ship it",
          cwd,
          allowDirty: true,
          noPause: true,
          config: noopNoPauseConfig,
          chain: {
            chainId: CHAIN_ID,
            iterationIndex: 1,
            iterationsTotal: 1,
            flags: { allowDirty: true, noPause: true },
          },
        },
        pinnedDeps({
          createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
        }),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
      const read = readChainLedger(cwd, CHAIN_ID);
      if (!read.ok) throw new Error(read.reason);
      expect(read.ledger.iterations[0].status).toBe("completed");
      expect(read.ledger.iterations[0].commitSha).toBeUndefined();
    });
  });

  it("AC-S2-14: when ctx.chain is absent, no chain ledger is written and state lacks chainId", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const result = await runWorkflow(
        {
          intent: "ship it",
          cwd,
          allowDirty: true,
          config: oneStagePauseConfig,
          // No `chain` field — back-compat with pre-S-002 callers.
        },
        pinnedDeps({
          createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
        }),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
      // No `.praxis/chains/` directory should exist on disk.
      expect(existsSync(join(cwd, ".praxis", "chains"))).toBe(false);
      // state.json must not stamp chainId / iterationIndex.
      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(persisted.chainId).toBeUndefined();
      expect(persisted.iterationIndex).toBeUndefined();
    });
  });

  it("AC-S2-16: chain.flags carry through to the ledger verbatim (allowDirty + noPause)", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Pre-make a dirty file so allowDirty matters at preflight.
      writeFileSync(join(cwd, "dirty.txt"), "uncommitted\n", "utf8");
      const result = await runWorkflow(
        {
          intent: "ship it",
          cwd,
          allowDirty: true,
          noPause: true,
          config: oneStagePauseConfig,
          chain: {
            chainId: CHAIN_ID,
            iterationIndex: 1,
            iterationsTotal: 2,
            flags: { allowDirty: true, noPause: true },
          },
        },
        pinnedDeps({
          createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
        }),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
      const read = readChainLedger(cwd, CHAIN_ID);
      if (!read.ok) throw new Error(read.reason);
      expect(read.ledger.flags).toEqual({ allowDirty: true, noPause: true });
    });
  });

  it("AC-S2-17: paused iter leaves the ledger entry in 'running' (chain not yet completed)", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // pauseAfter: true on the only stage — runner returns paused, so the
      // success-path patch never runs; the iter entry must remain 'running'.
      const result = await runWorkflow(
        {
          intent: "ship it",
          cwd,
          allowDirty: true,
          // noPause defaults false → stage pauses.
          config: oneStagePauseConfig,
          chain: {
            chainId: CHAIN_ID,
            iterationIndex: 1,
            iterationsTotal: 2,
            flags: { allowDirty: true, noPause: false },
          },
        },
        pinnedDeps({
          createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
        }),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
      expect(result.paused).toBe(true);
      const read = readChainLedger(cwd, CHAIN_ID);
      if (!read.ok) throw new Error(read.reason);
      expect(read.ledger.iterations[0].status).toBe("running");
      expect(read.ledger.iterationsCompleted).toBe(0);
      // Chain itself still in_progress; CLI sets terminal status, not runner.
      expect(read.ledger.status).toBe("in_progress");
    });
  });
});

/**
 * S-003 AC-S3-5 / AC-S3-7 / AC-S3-8 — iter-2+ preflight skip and the
 * complementary iter-1-still-runs-both invariant. Uses spies on the two
 * Deps slots so we can count call counts directly.
 */
describe("runWorkflow iter 2+ preflight skip (S-003 AC-S3-5/AC-S3-7/AC-S3-8)", () => {
  function spyDeps(opts: {
    createQueryFn: CreateQueryFn;
    runPreflightImpl?: Deps["runPreflight"];
    appendPraxisToGitignoreImpl?: Deps["appendPraxisToGitignore"];
  }): Deps & {
    runPreflightCalls: Array<{ cwd: string; allowDirty: boolean }>;
    appendPraxisToGitignoreCalls: string[];
  } {
    const runPreflightCalls: Array<{ cwd: string; allowDirty: boolean }> = [];
    const appendPraxisToGitignoreCalls: string[] = [];
    const deps = pinnedDeps({
      createQueryFn: opts.createQueryFn,
    }) as Deps & {
      runPreflightCalls: Array<{ cwd: string; allowDirty: boolean }>;
      appendPraxisToGitignoreCalls: string[];
    };
    deps.runPreflight = (cwd, options) => {
      runPreflightCalls.push({ cwd, allowDirty: options.allowDirty });
      return opts.runPreflightImpl?.(cwd, options) ?? { ok: true as const };
    };
    deps.appendPraxisToGitignore = (cwd) => {
      appendPraxisToGitignoreCalls.push(cwd);
      opts.appendPraxisToGitignoreImpl?.(cwd);
    };
    deps.runPreflightCalls = runPreflightCalls;
    deps.appendPraxisToGitignoreCalls = appendPraxisToGitignoreCalls;
    return deps;
  }

  it("AC-S3-8: iter 1 calls runPreflight AND appendPraxisToGitignore exactly once", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const deps = spyDeps({
        createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
      });
      const result = await runWorkflow(
        {
          intent: "ship it",
          cwd,
          allowDirty: true,
          config: oneStagePauseConfig,
          chain: {
            chainId: CHAIN_ID,
            iterationIndex: 1,
            iterationsTotal: 3,
            flags: { allowDirty: true, noPause: false },
          },
        },
        deps,
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
      expect(deps.runPreflightCalls).toHaveLength(1);
      expect(deps.runPreflightCalls[0]).toEqual({
        cwd,
        allowDirty: true,
      });
      expect(deps.appendPraxisToGitignoreCalls).toEqual([cwd]);
    });
  });

  it("AC-S3-5 + AC-S3-7: iter 2 calls NEITHER runPreflight NOR appendPraxisToGitignore", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Seed the ledger as iter 1 would have left it; iter 2 reads + appends.
      const seeded = buildInitialChainLedger({
        chainId: CHAIN_ID,
        intent: "ship it",
        iterationsTotal: 3,
        flags: { allowDirty: true, noPause: false },
        createdAt: "2026-05-02T14:25:00Z",
      });
      writeChainLedger(cwd, {
        ...seeded,
        iterations: [
          {
            index: 1,
            runId: "2026-05-02-1425-aaaa",
            status: "completed",
            commitSha: "feedface".repeat(5),
          },
        ],
        iterationsCompleted: 1,
      });
      const deps = spyDeps({
        createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
      });
      const result = await runWorkflow(
        {
          intent: "ship it",
          cwd,
          allowDirty: true,
          config: oneStagePauseConfig,
          chain: {
            chainId: CHAIN_ID,
            iterationIndex: 2, // mid-chain
            iterationsTotal: 3,
            flags: { allowDirty: true, noPause: false },
          },
        },
        deps,
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
      expect(deps.runPreflightCalls).toHaveLength(0);
      expect(deps.appendPraxisToGitignoreCalls).toHaveLength(0);
    });
  });

  it("standalone runs (no chain) still call both preflight gates exactly once", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const deps = spyDeps({
        createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
      });
      const result = await runWorkflow(
        {
          intent: "ship it",
          cwd,
          allowDirty: true,
          config: oneStagePauseConfig,
          // No chain — back-compat path; preflight + gitignore both run.
        },
        deps,
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
      expect(deps.runPreflightCalls).toHaveLength(1);
      expect(deps.appendPraxisToGitignoreCalls).toHaveLength(1);
    });
  });
});

/**
 * S-003 — `bootstrapChainOnIterationStart` branches on iter index. Iter 1
 * builds the initial ledger and appends entry 1 in one shot (existing
 * S-002 behavior). Iter 2+ MUST read the ledger written by iter 1, append
 * entry K against it, and write back — preserving the prior entries. A
 * missing ledger on iter 2+ is unrecoverable and throws (the runner has
 * no way to reconstruct the chain context).
 */
describe("bootstrapChainOnIterationStart iter-2+ branch (S-003)", () => {
  it("iter 2 reads the existing ledger and appends entry 2 (entry 1 preserved)", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Pre-stage a ledger with iter 1 already completed (mimicking what
      // iter 1's runner would have left on disk).
      const seeded = buildInitialChainLedger({
        chainId: CHAIN_ID,
        intent: "ship it",
        iterationsTotal: 2,
        flags: { allowDirty: true, noPause: false },
        createdAt: "2026-05-02T14:25:00Z",
      });
      writeChainLedger(cwd, {
        ...seeded,
        iterations: [
          {
            index: 1,
            runId: "2026-05-02-1425-aaaa",
            status: "completed",
            commitSha: "feedface".repeat(5),
          },
        ],
        iterationsCompleted: 1,
      });

      const result = await runWorkflow(
        {
          intent: "ship it",
          cwd,
          allowDirty: true,
          config: oneStagePauseConfig,
          chain: {
            chainId: CHAIN_ID,
            iterationIndex: 2,
            iterationsTotal: 2,
            flags: { allowDirty: true, noPause: false },
          },
        },
        pinnedDeps({
          createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
        }),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      const read = readChainLedger(cwd, CHAIN_ID);
      if (!read.ok) throw new Error(read.reason);
      expect(read.ledger.iterations).toHaveLength(2);
      // Iter 1 entry preserved verbatim.
      expect(read.ledger.iterations[0]).toMatchObject({
        index: 1,
        runId: "2026-05-02-1425-aaaa",
        status: "completed",
      });
      // Iter 2 entry appended with this run's runId.
      expect(read.ledger.iterations[1].index).toBe(2);
      expect(read.ledger.iterations[1].runId).toBe(ITER1_RUN_ID);
    });
  });

  it("iter 2+ throws when the ledger is missing on disk (unrecoverable)", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // No ledger on disk. Iter 2+ has no way to reconstruct the chain;
      // the runner must throw rather than silently rebuild.
      await expect(
        runWorkflow(
          {
            intent: "ship it",
            cwd,
            allowDirty: true,
            config: oneStagePauseConfig,
            chain: {
              chainId: CHAIN_ID,
              iterationIndex: 2,
              iterationsTotal: 2,
              flags: { allowDirty: true, noPause: false },
            },
          },
          pinnedDeps({
            createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
          }),
        ),
      ).rejects.toThrow(/chain ledger.*not found/i);
    });
  });
});

/**
 * S-004 AC-S4-8 — when `runAdvance` auto-launches iter K+1 after a paused
 * iter K resumes, the runner's preflight + .gitignore touch MUST be skipped
 * (same predicate as S-003 AC-S3-5/AC-S3-7, just reached via the advance
 * path instead of `runRun`'s top-level loop). Locks the contract that the
 * advance auto-launch routes through the same `iterationIndex > 1` skip
 * branch and doesn't accidentally reintroduce a duplicate preflight call
 * from outside the runner.
 */
describe("runAdvance auto-launched iter skips preflight (S-004 AC-S4-8)", () => {
  it("auto-launched iter K+1 never calls runPreflight or appendPraxisToGitignore", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const PAUSED_RUN_ID = "2026-05-02-1430-aaaa";
      const NEXT_RUN_ID = "2026-05-02-1442-bbbb";

      // Seed iter 1's state.json (chain-stamped) and the chain ledger with
      // iter 1 entry — mimicking the post-pause on-disk shape.
      const runDir = join(cwd, ".praxis", "runs", PAUSED_RUN_ID);
      mkdirSync(runDir, { recursive: true });
      const state: State = {
        runId: PAUSED_RUN_ID,
        intent: "ship it",
        startedAt: "2026-05-02T14:30:12Z",
        baselineSha: "0123456789abcdef0123456789abcdef01234567",
        chainId: CHAIN_ID,
        iterationIndex: 1,
        currentStage: "auto-commit",
        cost: { totalTokens: 0, totalUsd: 0 },
        stages: {
          "clarify-assess": { status: "completed", sessionId: "sess" },
        },
      };
      writeState(runDir, state);
      const seeded = buildInitialChainLedger({
        chainId: CHAIN_ID,
        intent: "ship it",
        iterationsTotal: 2,
        flags: { allowDirty: true, noPause: true },
        createdAt: "2026-05-02T14:25:00Z",
      });
      writeChainLedger(cwd, {
        ...seeded,
        iterations: [{ index: 1, runId: PAUSED_RUN_ID, status: "running" }],
      });

      // Spy advanceWorkflow: just patches iter 1 to completed with a SHA so
      // the chain-aware tail decides to launch K+1 (not stop on cascade-skip
      // or final-iter-completed). No state.json mutation needed — advance
      // already wrote it during seeding.
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
          runDir,
          paused: false,
          chainId: CHAIN_ID,
          iterationIndex: 1,
        };
      };

      // Spy preflight + gitignore — count calls. Pass real runWorkflow as
      // dispatch so the auto-launch goes through the runner's actual
      // preflight predicate, not a stub.
      const runPreflightCalls: Array<{ cwd: string; allowDirty: boolean }> = [];
      const appendPraxisToGitignoreCalls: string[] = [];

      // Custom pinnedDeps with spy preflight slots — overrides the imported
      // production `runPreflight` / `appendPraxisToGitignore` so the call
      // counts isolate to *this* test's auto-launched iter.
      const baseDeps = pinnedDeps({
        // Iter 2 needs a config; we route runWorkflow through the same
        // single-stage pause config so the test stays focused on preflight.
        // (The iter 2 stage will pause and the loop will exit; but
        // pauseAfter doesn't run preflight — we get to assert the count.)
        createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
      });
      const deps = {
        ...baseDeps,
        runPreflight: (
          c: string,
          opts: { allowDirty: boolean },
        ): { ok: true } => {
          runPreflightCalls.push({ cwd: c, allowDirty: opts.allowDirty });
          return { ok: true } as const;
        },
        appendPraxisToGitignore: (c: string): void => {
          appendPraxisToGitignoreCalls.push(c);
        },
        advanceWorkflow: advanceSpy,
        runWorkflow: async (
          ctx: Parameters<typeof runWorkflow>[0],
        ): Promise<RunWorkflowResult> => {
          // Override the iter-2 config so the real runner's preflight branch
          // dispatches: a fresh runWorkflow with the iter-2 chain context.
          // Using the test's `oneStagePauseConfig` keeps stage execution
          // bounded (one stage, then pause).
          return runWorkflow(
            { ...ctx, config: oneStagePauseConfig },
            // Hand back the SAME deps so preflight spy counts capture iter 2.
            // Stamp NEXT_RUN_ID via fixed clock+rng — pinnedDeps already does
            // this (clock=1430+12s, rng=7af2), so the runId would clash with
            // PAUSED_RUN_ID. Override the rng for iter 2 to avoid the clash.
            { ...deps, rng: () => new Uint8Array([0xbb, 0xbb]) },
          );
        },
      };

      await runAdvance(
        { runId: PAUSED_RUN_ID, noPause: true },
        cwd,
        new AbortController().signal,
        deps,
      );

      // Auto-launched iter 2 must have skipped both preflight gates.
      expect(runPreflightCalls).toEqual([]);
      expect(appendPraxisToGitignoreCalls).toEqual([]);
      // Confirm iter 2 actually ran (otherwise the assertion above is vacuous):
      // ledger should have a 2nd entry now.
      const final = readChainLedger(cwd, CHAIN_ID);
      if (!final.ok) throw new Error(final.reason);
      expect(final.ledger.iterations).toHaveLength(2);
      expect(final.ledger.iterations[1].index).toBe(2);
      // Lint silences unused locals in test scopes; tighten sentinel binding:
      expect(NEXT_RUN_ID).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}-[0-9a-f]{4}$/);
    });
  });
});

/**
 * S-005 AC-S5-6 — when `runRetry` auto-launches iter K+1 after a failed iter
 * K's code-improving stage resumes, the runner's preflight + .gitignore touch
 * MUST be skipped (same predicate as S-003 AC-S3-5/AC-S3-7 and S-004
 * AC-S4-8, just reached via the retry path instead of `runRun`'s top-level
 * loop or `runAdvance`'s resume tail). Locks the contract that the retry
 * auto-launch routes through the same `iterationIndex > 1` skip branch and
 * doesn't accidentally reintroduce a duplicate preflight call from outside
 * the runner.
 */
describe("runRetry auto-launched iter skips preflight (S-005 AC-S5-6)", () => {
  it("auto-launched iter K+1 never calls runPreflight or appendPraxisToGitignore", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const FAILED_RUN_ID = "2026-05-02-1430-aaaa";
      const NEXT_RUN_ID = "2026-05-02-1442-bbbb";

      // Seed iter 1's state.json (chain-stamped) and the chain ledger with
      // iter 1 entry — mimicking the post-failure on-disk shape that a
      // `praxis retry` user lands on.
      const runDir = join(cwd, ".praxis", "runs", FAILED_RUN_ID);
      mkdirSync(runDir, { recursive: true });
      const state: State = {
        runId: FAILED_RUN_ID,
        intent: "ship it",
        startedAt: "2026-05-02T14:30:12Z",
        baselineSha: "0123456789abcdef0123456789abcdef01234567",
        chainId: CHAIN_ID,
        iterationIndex: 1,
        currentStage: CODE_IMPROVING_ID,
        cost: { totalTokens: 0, totalUsd: 0 },
        stages: {
          "clarify-assess": { status: "completed", sessionId: "sess" },
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
      writeState(runDir, state);
      const seeded = buildInitialChainLedger({
        chainId: CHAIN_ID,
        intent: "ship it",
        iterationsTotal: 2,
        flags: { allowDirty: true, noPause: true },
        createdAt: "2026-05-02T14:25:00Z",
      });
      writeChainLedger(cwd, {
        ...seeded,
        iterations: [{ index: 1, runId: FAILED_RUN_ID, status: "running" }],
      });

      // Spy retryWorkflow: just patches iter 1 to completed with a SHA so
      // the chain-aware tail decides to launch K+1 (not stop on cascade-skip
      // or final-iter-completed).
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
        // S-005: spy mirrors the runner threading chain identity onto the
        // success result so runRetry can drive the chain-aware tail without
        // a state.json re-read.
        return {
          ok: true,
          runId,
          runDir,
          paused: false,
          chainId: CHAIN_ID,
          iterationIndex: 1,
        };
      };

      // Spy preflight + gitignore — count calls. Pass real runWorkflow as
      // dispatch so the auto-launch goes through the runner's actual
      // preflight predicate, not a stub.
      const runPreflightCalls: Array<{ cwd: string; allowDirty: boolean }> = [];
      const appendPraxisToGitignoreCalls: string[] = [];

      // Custom pinnedDeps with spy preflight slots — overrides the imported
      // production `runPreflight` / `appendPraxisToGitignore` so the call
      // counts isolate to *this* test's auto-launched iter.
      const baseDeps = pinnedDeps({
        // Iter 2 needs a config; we route runWorkflow through the same
        // single-stage pause config so the test stays focused on preflight.
        createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
      });
      const deps = {
        ...baseDeps,
        runPreflight: (
          c: string,
          opts: { allowDirty: boolean },
        ): { ok: true } => {
          runPreflightCalls.push({ cwd: c, allowDirty: opts.allowDirty });
          return { ok: true } as const;
        },
        appendPraxisToGitignore: (c: string): void => {
          appendPraxisToGitignoreCalls.push(c);
        },
        retryWorkflow: retrySpy,
        runWorkflow: async (
          ctx: Parameters<typeof runWorkflow>[0],
        ): Promise<RunWorkflowResult> => {
          // Override the iter-2 config so the real runner's preflight branch
          // dispatches: a fresh runWorkflow with the iter-2 chain context.
          // Using the test's `oneStagePauseConfig` keeps stage execution
          // bounded (one stage, then pause).
          return runWorkflow(
            { ...ctx, config: oneStagePauseConfig },
            // Hand back the SAME deps so preflight spy counts capture iter 2.
            // Stamp NEXT_RUN_ID via fixed clock+rng — pinnedDeps already does
            // this (clock=1430+12s, rng=7af2), so the runId would clash with
            // FAILED_RUN_ID. Override the rng for iter 2 to avoid the clash.
            { ...deps, rng: () => new Uint8Array([0xbb, 0xbb]) },
          );
        },
      };

      await runRetry(
        { runId: FAILED_RUN_ID, noPause: true },
        cwd,
        new AbortController().signal,
        deps,
      );

      // Auto-launched iter 2 must have skipped both preflight gates.
      expect(runPreflightCalls).toEqual([]);
      expect(appendPraxisToGitignoreCalls).toEqual([]);
      // Confirm iter 2 actually ran (otherwise the assertion above is vacuous):
      // ledger should have a 2nd entry now.
      const final = readChainLedger(cwd, CHAIN_ID);
      if (!final.ok) throw new Error(final.reason);
      expect(final.ledger.iterations).toHaveLength(2);
      expect(final.ledger.iterations[1].index).toBe(2);
      // Lint silences unused locals in test scopes; tighten sentinel binding:
      expect(NEXT_RUN_ID).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}-[0-9a-f]{4}$/);
    });
  });
});

/**
 * S-006 AC-S6-13 — `RunWorkflowFailure` carries the chain identity (chainId +
 * iterationIndex) of the iteration that failed, mirroring the M-2 pattern
 * already in place for `RunWorkflowSuccess`. The CLI's
 * `writeChainTerminalStatus` helper uses these fields to drive the chain
 * ledger to its terminal status (aborted / cancelled) without re-reading
 * state.json.
 *
 * Covers all three failure-return sites:
 *   - `executeStages`'s failed branch (chain stamped from ctx.chain).
 *   - `advanceWorkflow`'s post-recovery failure return (chain recovered from
 *     state.json via `recoverChainContextFromState`).
 *   - `retryWorkflow`'s `finalizeRetryFailure` (chain read directly off the
 *     resumed run's state.json — `state.chainId` / `state.iterationIndex`).
 */
describe("RunWorkflowFailure carries chain identity (S-006 AC-S6-13)", () => {
  /**
   * Two-stage workflow where stage 1 (noop) commits a marker so HEAD advances
   * past baseline (so the auto-commit stage doesn't clean-tree-skip), then
   * stage 2 is the canonical `auto-commit` id. We inject a `deps.commit` stub
   * that returns `{ ok: false, reason: ... }` so the runner takes the
   * `commit_failed` branch — `runOneStage` calls `failStage` and
   * `executeStages` returns its failed-branch shape.
   */
  const noopThenFailingCommitConfig: PraxisConfig = {
    version: 1,
    workflow: [
      {
        id: "noop",
        systemPrompt: { file: "clarify-assess.md" },
        userPromptTemplate: "{{intent}}",
        outputArtifact: "noop.md",
      },
      {
        id: "auto-commit",
        systemPrompt: { file: "auto-commit.md" },
        userPromptTemplate: "{{intent}}",
        outputArtifact: "07-commit.txt",
      },
    ],
  };

  function commitAdvancingQuery(cwd: string): CreateQueryFn {
    let call = 0;
    return (_input) => {
      call++;
      if (call === 1) {
        // Real commit so HEAD advances past baselineSha → auto-commit doesn't
        // clean-tree-skip.
        writeFileSync(join(cwd, "marker-fail.txt"), "marker\n", "utf8");
        spawnSync("git", ["add", "marker-fail.txt"], { cwd });
        spawnSync("git", ["commit", "-m", "marker"], { cwd });
      }
      return {
        pushUserMessage() {},
        stream: (async function* () {
          for (const m of noopMessages(`sess_${call}`)) yield m;
        })(),
      };
    };
  }

  it("AC-S6-13a: executeStages failure carries chainId + iterationIndex from ctx.chain", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const result = await runWorkflow(
        {
          intent: "ship it",
          cwd,
          allowDirty: true,
          noPause: true,
          config: noopThenFailingCommitConfig,
          chain: {
            chainId: CHAIN_ID,
            iterationIndex: 1,
            iterationsTotal: 2,
            flags: { allowDirty: true, noPause: true },
          },
        },
        pinnedDeps({
          createQueryFn: commitAdvancingQuery(cwd),
          commit: () => ({ ok: false, reason: "test-injected commit failure" }),
        }),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.chainId).toBe(CHAIN_ID);
      expect(result.iterationIndex).toBe(1);
      expect(result.status).toBe("failed");
    });
  });

  it("AC-S6-13b: standalone (no chain) failure leaves chainId/iterationIndex undefined", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const result = await runWorkflow(
        {
          intent: "ship it",
          cwd,
          allowDirty: true,
          noPause: true,
          config: noopThenFailingCommitConfig,
          // No `chain` field — back-compat path; failure carries no chain id.
        },
        pinnedDeps({
          createQueryFn: commitAdvancingQuery(cwd),
          commit: () => ({ ok: false, reason: "test-injected commit failure" }),
        }),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.chainId).toBeUndefined();
      expect(result.iterationIndex).toBeUndefined();
    });
  });

  it("AC-S6-13c: advanceWorkflow's post-recovery failure carries chainId + iterationIndex from state.json", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const PAUSED_RUN_ID = "2026-05-02-1430-aaaa";
      const runDir = join(cwd, ".praxis", "runs", PAUSED_RUN_ID);
      mkdirSync(runDir, { recursive: true });
      // Stage previously failed; recovery will fail because the artifact is
      // missing on disk (recoverFailedStage's existsSync gate).
      const state: State = {
        runId: PAUSED_RUN_ID,
        intent: "ship it",
        startedAt: "2026-05-02T14:30:12Z",
        baselineSha: "0123456789abcdef0123456789abcdef01234567",
        chainId: CHAIN_ID,
        iterationIndex: 2,
        currentStage: "fail-stage",
        cost: { totalTokens: 0, totalUsd: 0 },
        stages: {
          "fail-stage": {
            status: "failed",
            sessionId: "sess_failed",
            error: "stage failed",
          },
        },
      };
      writeState(runDir, state);
      const seeded = buildInitialChainLedger({
        chainId: CHAIN_ID,
        intent: "ship it",
        iterationsTotal: 2,
        flags: { allowDirty: true, noPause: true },
        createdAt: "2026-05-02T14:25:00Z",
      });
      writeChainLedger(cwd, {
        ...seeded,
        iterations: [
          {
            index: 1,
            runId: "2026-05-02-1425-cccc",
            status: "completed",
            commitSha: "feedface".repeat(5),
          },
          { index: 2, runId: PAUSED_RUN_ID, status: "running" },
        ],
        iterationsCompleted: 1,
      });

      const noopConfig: PraxisConfig = {
        version: 1,
        workflow: [
          {
            id: "fail-stage",
            systemPrompt: { file: "clarify-assess.md" },
            userPromptTemplate: "{{intent}}",
            outputArtifact: "fail.md",
          },
        ],
      };

      const { advanceWorkflow } = await import("../../src/workflow/runner.js");
      const result = await advanceWorkflow(
        PAUSED_RUN_ID,
        { cwd, noPause: true, config: noopConfig },
        pinnedDeps({
          createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
        }),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.chainId).toBe(CHAIN_ID);
      expect(result.iterationIndex).toBe(2);
    });
  });

  it("AC-S6-13d: retryWorkflow's finalizeRetryFailure carries chainId + iterationIndex from state.json", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const FAILED_RUN_ID = "2026-05-02-1430-aaaa";
      const runDir = join(cwd, ".praxis", "runs", FAILED_RUN_ID);
      mkdirSync(runDir, { recursive: true });
      // session-unresumable shape: code-improving failed with no sessionId
      // → retryWorkflow goes through finalizeRetryFailure on the up-front
      // guard branch.
      const state: State = {
        runId: FAILED_RUN_ID,
        intent: "ship it",
        startedAt: "2026-05-02T14:30:12Z",
        baselineSha: "0123456789abcdef0123456789abcdef01234567",
        chainId: CHAIN_ID,
        iterationIndex: 2,
        currentStage: CODE_IMPROVING_ID,
        cost: { totalTokens: 0, totalUsd: 0 },
        stages: {
          "clarify-assess": { status: "completed", sessionId: "sess" },
          "sketching-design": { status: "completed", sessionId: "sess" },
          "driving-tdd": { status: "completed", sessionId: "sess" },
          [CODE_REVIEWING_ID]: { status: "completed", sessionId: "sess" },
          [CODE_IMPROVING_ID]: {
            status: "failed",
            // sessionId omitted to trigger the up-front session_unresumable
            // guard inside retryWorkflow.
            error: "validator_failed",
          },
          [AUTO_COMMIT_ID]: { status: "pending" },
        },
      };
      writeState(runDir, state);

      const { retryWorkflow } = await import("../../src/workflow/runner.js");
      const result = await retryWorkflow(
        FAILED_RUN_ID,
        { cwd, noPause: true },
        pinnedDeps({
          createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
        }),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.chainId).toBe(CHAIN_ID);
      expect(result.iterationIndex).toBe(2);
    });
  });
});

/**
 * S-007 — `runWorkflow` emits `reporter.chainStart?.(chainId, k, n, runId)`
 * once per iteration when `ctx.chain !== undefined`. Lives on `runWorkflow`'s
 * entry path (NOT inside `executeStages`) so advance/retry resume tails do
 * not re-emit the banner on every continuation.
 */
describe("runWorkflow chainStart emit (S-007 AC-S7-1/AC-S7-2)", () => {
  it("AC-S7-1: iter 1 with ctx.chain set → reporter.chainStart fires once with iter=1", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const reporter = new RecordingReporter();
      const result = await runWorkflow(
        {
          intent: "ship the chain",
          cwd,
          allowDirty: true,
          config: oneStagePauseConfig,
          chain: {
            chainId: CHAIN_ID,
            iterationIndex: 1,
            iterationsTotal: 3,
            flags: { allowDirty: true, noPause: false },
          },
        },
        pinnedDeps({
          createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
          reporter,
        }),
      );
      if (!result.ok) throw new Error(result.reason);
      const banners = reporter.calls.filter((c) => c.kind === "chainStart");
      expect(banners).toHaveLength(1);
      expect(banners[0]).toMatchObject({
        kind: "chainStart",
        chainId: CHAIN_ID,
        iterationIndex: 1,
        iterationsTotal: 3,
        runId: ITER1_RUN_ID,
      });
    });
  });

  it("AC-S7-2: iter 2 with ctx.chain set → reporter.chainStart fires with iter=2", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Seed iter-1 entry so iter 2 can append.
      const seeded = buildInitialChainLedger({
        chainId: CHAIN_ID,
        intent: "ship the chain",
        iterationsTotal: 3,
        flags: { allowDirty: true, noPause: false },
        createdAt: "2026-05-02T14:25:00Z",
      });
      writeChainLedger(cwd, {
        ...seeded,
        iterations: [
          {
            index: 1,
            runId: "2026-05-02-1425-aaaa",
            status: "completed",
            commitSha: "feedface".repeat(5),
          },
        ],
        iterationsCompleted: 1,
      });

      const reporter = new RecordingReporter();
      const result = await runWorkflow(
        {
          intent: "ship the chain",
          cwd,
          allowDirty: true,
          config: oneStagePauseConfig,
          chain: {
            chainId: CHAIN_ID,
            iterationIndex: 2,
            iterationsTotal: 3,
            flags: { allowDirty: true, noPause: false },
          },
        },
        pinnedDeps({
          createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
          reporter,
        }),
      );
      if (!result.ok) throw new Error(result.reason);
      const banners = reporter.calls.filter((c) => c.kind === "chainStart");
      expect(banners).toHaveLength(1);
      expect(banners[0]).toMatchObject({
        kind: "chainStart",
        chainId: CHAIN_ID,
        iterationIndex: 2,
        iterationsTotal: 3,
      });
    });
  });

  it("standalone runs (no ctx.chain) → reporter.chainStart never fires", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const reporter = new RecordingReporter();
      const result = await runWorkflow(
        {
          intent: "standalone",
          cwd,
          allowDirty: true,
          config: oneStagePauseConfig,
        },
        pinnedDeps({
          createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
          reporter,
        }),
      );
      if (!result.ok) throw new Error(result.reason);
      expect(reporter.countOf("chainStart")).toBe(0);
    });
  });

  it("chainStart fires BEFORE the first stageStart (banner precedes stage 1 dispatch)", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const reporter = new RecordingReporter();
      const result = await runWorkflow(
        {
          intent: "ship it",
          cwd,
          allowDirty: true,
          config: oneStagePauseConfig,
          chain: {
            chainId: CHAIN_ID,
            iterationIndex: 1,
            iterationsTotal: 1,
            flags: { allowDirty: true, noPause: false },
          },
        },
        pinnedDeps({
          createQueryFn: scriptedQuery([{ messages: noopMessages() }]),
          reporter,
        }),
      );
      if (!result.ok) throw new Error(result.reason);
      const bannerIdx = reporter.calls.findIndex(
        (c) => c.kind === "chainStart",
      );
      const firstStageStart = reporter.calls.findIndex(
        (c) => c.kind === "stageStart",
      );
      expect(bannerIdx).toBeGreaterThanOrEqual(0);
      expect(firstStageStart).toBeGreaterThan(bannerIdx);
    });
  });
});
