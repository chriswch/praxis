import { describe, expect, it, vi } from "vitest";
import { writeChainTerminalStatus } from "../../src/cli.js";
import {
  appendIteration,
  buildInitialChainLedger,
  type ChainLedger,
  readChainLedger,
  writeChainLedger,
} from "../../src/workflow/chain.js";
import type { RunWorkflowResult } from "../../src/workflow/runner.js";
import { withTempRepo } from "../support/tmp-repo.js";

/**
 * S-006 — `writeChainTerminalStatus` helper. Standalone CLI helper that flips
 * the chain ledger to its terminal status when an iteration's runner / resume
 * dispatcher returns a failure. Owned by the CLI (not the runner) because the
 * chain-loop policy is the CLI's concern; the runner only owns one
 * iteration's lifecycle.
 *
 * Behaviour invariants the helper must hold:
 *   - chainId undefined → return silently (back-compat for standalone runs).
 *   - readChainLedger fails → write to stderr and return (don't throw — the
 *     iteration's run is fine on disk; the chain just can't be progressed).
 *   - terminalStatus = result.status === "cancelled" ? "cancelled" : "aborted".
 *   - On success, calls setChainStatus + writeChainLedger so the ledger's
 *     `status` is the terminal value and `updatedAt` reflects the helper's
 *     clock.
 */

const CHAIN_ID = "2026-05-02-1430-9f3c";

function seedRunningLedger(cwd: string): ChainLedger {
  const seeded = buildInitialChainLedger({
    chainId: CHAIN_ID,
    intent: "ship the chain",
    iterationsTotal: 3,
    flags: { allowDirty: false, noPause: false },
    createdAt: "2026-05-02T14:30:12Z",
  });
  const withIter = appendIteration(
    seeded,
    { index: 1, runId: "2026-05-02-1430-aaaa", status: "running" },
    "2026-05-02T14:30:12Z",
  );
  writeChainLedger(cwd, withIter);
  return withIter;
}

const FROZEN_CLOCK = (): Date => new Date("2026-05-02T14:42:13Z");

describe("writeChainTerminalStatus AC-S6-4 (default → aborted)", () => {
  it("AC-S6-4: result.status='failed' → ledger flips to 'aborted'", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      seedRunningLedger(cwd);
      const result: RunWorkflowResult = {
        ok: false,
        reason: "validator_failed",
        runId: "2026-05-02-1430-aaaa",
        runDir: `/tmp/2026-05-02-1430-aaaa`,
        failedStageId: "clarify-assess",
        status: "failed",
        chainId: CHAIN_ID,
        iterationIndex: 1,
      };
      writeChainTerminalStatus({
        cwd,
        chainId: CHAIN_ID,
        result,
        clock: FROZEN_CLOCK,
      });
      const read = readChainLedger(cwd, CHAIN_ID);
      if (!read.ok) throw new Error(read.reason);
      expect(read.ledger.status).toBe("aborted");
      // updatedAt advanced to the helper's clock (truncated to whole seconds).
      expect(read.ledger.updatedAt).toBe("2026-05-02T14:42:13Z");
    });
  });

  it("AC-S6-4: result.status undefined (legacy failure shape) → ledger flips to 'aborted'", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      seedRunningLedger(cwd);
      // Legacy / pre-bootstrap failures (preflight, currentHead) lack `status`.
      const result: RunWorkflowResult = {
        ok: false,
        reason: "preflight failed",
        chainId: CHAIN_ID,
        iterationIndex: 1,
      };
      writeChainTerminalStatus({
        cwd,
        chainId: CHAIN_ID,
        result,
        clock: FROZEN_CLOCK,
      });
      const read = readChainLedger(cwd, CHAIN_ID);
      if (!read.ok) throw new Error(read.reason);
      expect(read.ledger.status).toBe("aborted");
    });
  });

  it("S-006 helper: result.status='cancelled' → ledger flips to 'cancelled'", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      seedRunningLedger(cwd);
      const result: RunWorkflowResult = {
        ok: false,
        reason: "cancelled by user (SIGINT)",
        runId: "2026-05-02-1430-aaaa",
        runDir: `/tmp/2026-05-02-1430-aaaa`,
        failedStageId: "clarify-assess",
        status: "cancelled",
        chainId: CHAIN_ID,
        iterationIndex: 1,
      };
      writeChainTerminalStatus({
        cwd,
        chainId: CHAIN_ID,
        result,
        clock: FROZEN_CLOCK,
      });
      const read = readChainLedger(cwd, CHAIN_ID);
      if (!read.ok) throw new Error(read.reason);
      expect(read.ledger.status).toBe("cancelled");
    });
  });
});

describe("writeChainTerminalStatus AC-S6-11 (chainId undefined → no-op)", () => {
  it("AC-S6-11: chainId undefined → returns silently; never reads or writes the ledger", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // No ledger on disk — if the helper attempted to read, it would surface
      // a stderr line. The assertion below also confirms zero writes.
      const result: RunWorkflowResult = {
        ok: false,
        reason: "standalone run failed",
        runId: "2026-05-02-1430-aaaa",
        status: "failed",
        // chainId omitted — back-compat path for standalone (non-chain) runs.
      };
      const stderrChunks: string[] = [];
      const writeSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation((chunk) => {
          stderrChunks.push(
            typeof chunk === "string" ? chunk : chunk.toString("utf8"),
          );
          return true;
        });
      try {
        writeChainTerminalStatus({
          cwd,
          chainId: undefined,
          result,
          clock: FROZEN_CLOCK,
        });
      } finally {
        writeSpy.mockRestore();
      }
      expect(stderrChunks.join("")).toBe("");
    });
  });
});

describe("writeChainTerminalStatus AC-S6-10 (standalone runs do not call helper)", () => {
  it("AC-S6-10: helper invocation with a no-chain failure shape is a no-op (chainId undefined)", async () => {
    // AC-S6-10 contract: the CLI's runRun standalone branch (parsed.iterations
    // === undefined) never calls writeChainTerminalStatus — but if a future
    // refactor accidentally routed through it, the helper must be a no-op.
    // This test locks the helper-side invariant; the CLI-side invariant (that
    // standalone runs never invoke the helper) is asserted indirectly by
    // run-run-loop's existing back-compat test (no ledger on disk for
    // parsed.iterations === undefined).
    await withTempRepo(async ({ dir: cwd }) => {
      const result: RunWorkflowResult = {
        ok: false,
        reason: "standalone run failed",
        runId: "2026-05-02-1430-aaaa",
        status: "failed",
        // No chainId — standalone shape.
      };
      // Should not throw, should not write anything.
      writeChainTerminalStatus({
        cwd,
        chainId: undefined,
        result,
        clock: FROZEN_CLOCK,
      });
    });
  });
});

describe("writeChainTerminalStatus AC-S6-12 (read failure → stderr + return)", () => {
  it("AC-S6-12: ledger missing on disk → stderr line + return; does not throw", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Don't seed a ledger — readChainLedger will return { ok: false }.
      const result: RunWorkflowResult = {
        ok: false,
        reason: "validator_failed",
        runId: "2026-05-02-1430-aaaa",
        status: "failed",
        chainId: CHAIN_ID,
        iterationIndex: 1,
      };
      const stderrChunks: string[] = [];
      const writeSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation((chunk) => {
          stderrChunks.push(
            typeof chunk === "string" ? chunk : chunk.toString("utf8"),
          );
          return true;
        });
      try {
        // Must not throw.
        expect(() =>
          writeChainTerminalStatus({
            cwd,
            chainId: CHAIN_ID,
            result,
            clock: FROZEN_CLOCK,
          }),
        ).not.toThrow();
      } finally {
        writeSpy.mockRestore();
      }
      const stderr = stderrChunks.join("");
      expect(stderr).toMatch(/chain ledger/);
      expect(stderr).toMatch(/2026-05-02-1430-9f3c/);
    });
  });
});
