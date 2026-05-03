import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runRun } from "../../src/cli.js";
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
import { runCli } from "../support/run-cli.js";
import { withTempRepo } from "../support/tmp-repo.js";

/**
 * S-002 e2e — `praxis run --iterations <N>` end-to-end. Two layers:
 *
 * - Validation matrix via subprocess (AC-S2-23 — mirrors AC-S2-3..AC-S2-6
 *   at the CLI surface).
 * - Direct invocation of `runRun` with stubbed `Deps` (AC-S2-22): the only
 *   way to assert the success-path terminal-status-write without standing
 *   up live SDK credentials. The production CLI hard-wires
 *   `sdkCreateQueryFn`; `runRun` is the seam where parsed-args + deps meet,
 *   so testing it directly is the closest thing to a CLI integration test
 *   short of mocking the SDK at the network layer.
 */

const SUBJECT_INTENT = "ship the chain ledger";

function noopMessages(sessionId: string): SdkMessage[] {
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
 * Build a `Deps` for `runRun` whose `createQueryFn` echoes a noop assistant
 * turn for every stage and whose `commit()` is a no-op skipped result. The
 * default 7-stage workflow's clean-tree skip predicate then makes the four
 * trailing stages cascade-skip — yielding a clean run-completion path
 * suitable for asserting chain-status flip.
 */
function buildStubDeps(): Deps {
  let call = 0;
  const createQueryFn: CreateQueryFn = (_input) => {
    call++;
    return {
      pushUserMessage() {},
      stream: (async function* () {
        for (const m of noopMessages(`sess_${call}`)) yield m;
      })(),
    };
  };
  return {
    clock: () => new Date("2026-05-02T14:30:12Z"),
    rng: (n) => new Uint8Array([0x7a, 0xf2]).slice(0, n),
    createQueryFn,
    reporter: new LineReporter(),
    commit: () => ({ ok: true, skipped: true }),
    runPreflight,
    appendPraxisToGitignore,
  };
}

describe("praxis run --iterations <N> CLI surface (AC-S2-23)", () => {
  it("rejects --iterations 0 with the canonical message", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = runCli(["run", "--iterations", "0", "intent"], dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/iterations must be a positive integer/);
      expect(existsSync(join(dir, ".praxis"))).toBe(false);
    });
  });

  it("rejects negative integer", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = runCli(["run", "--iterations", "-3", "intent"], dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/iterations must be a positive integer/);
      expect(existsSync(join(dir, ".praxis"))).toBe(false);
    });
  });

  it("rejects non-integer values like abc", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = runCli(["run", "--iterations", "abc", "intent"], dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/iterations must be a positive integer/);
      expect(existsSync(join(dir, ".praxis"))).toBe(false);
    });
  });

  it("rejects --iterations with no value provided", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = runCli(["run", "intent", "--iterations"], dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/iterations must be a positive integer/);
      expect(existsSync(join(dir, ".praxis"))).toBe(false);
    });
  });
});

describe("praxis run --iterations 1 end-to-end (AC-S2-22)", () => {
  it("writes a chain ledger with iterationsTotal: 1 and ends status: 'completed-early' on cascade-skip", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = await runRun(
        {
          intent: SUBJECT_INTENT,
          allowDirty: true,
          noPause: true,
          iterations: 1,
        },
        dir,
        new AbortController().signal,
        buildStubDeps(),
      );
      expect(result.ok).toBe(true);

      const chainsDir = join(dir, ".praxis", "chains");
      expect(existsSync(chainsDir)).toBe(true);
      const chainFiles = readdirSync(chainsDir).filter((f) =>
        f.endsWith(".json"),
      );
      expect(chainFiles).toHaveLength(1);
      const chainId = chainFiles[0].replace(/\.json$/, "");
      const read = readChainLedger(dir, chainId);
      expect(read.ok).toBe(true);
      if (!read.ok) throw new Error(read.reason);

      expect(read.ledger.iterationsTotal).toBe(1);
      expect(read.ledger.intent).toBe(SUBJECT_INTENT);
      expect(read.ledger.iterations).toHaveLength(1);
      expect(read.ledger.iterations[0].index).toBe(1);
      expect(read.ledger.iterations[0].status).toBe("completed");
      // AC-S2-22 + S-003 AC-S3-11: with the noop stub commit (no real SHA),
      // every stage cascade-skips and the auto-commit entry has no commitSha.
      // S-003's runRun loop detects that and flips the chain to
      // "completed-early" rather than the all-iters-succeeded "completed".
      // The "completed" path is covered by the multi-iteration real-commit
      // e2e (run-iterations-multi.test.ts).
      expect(read.ledger.status).toBe("completed-early");
      expect(read.ledger.iterationsCompleted).toBe(1);
      // updatedAt advanced past createdAt at least conceptually — both are
      // ISO-second precision so they may match when the stub clock is fixed.
      // Assert the field is present and ISO-shaped.
      expect(read.ledger.updatedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
      );
    });
  });
});
