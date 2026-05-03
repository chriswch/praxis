import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PraxisConfig } from "../../src/config/schema.js";
import { LineReporter } from "../../src/ui/line-reporter.js";
import { readChainLedger } from "../../src/workflow/chain.js";
import { runWorkflow } from "../../src/workflow/runner.js";
import type {
  CreateQueryFn,
  Deps,
  SdkMessage,
} from "../../src/workflow/stage.js";
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
}): Deps {
  return {
    clock: () => opts.date ?? new Date("2026-05-02T14:30:12Z"),
    rng: (n) => (opts.bytes ?? new Uint8Array([0x7a, 0xf2])).slice(0, n),
    createQueryFn: opts.createQueryFn,
    reporter: new LineReporter(),
    commit: opts.commit ?? (() => ({ ok: true, skipped: true })),
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

