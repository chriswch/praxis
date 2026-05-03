import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendIteration,
  buildInitialChainLedger,
  type ChainIterationEntry,
  type ChainLedger,
  type ChainStatus,
  generateChainId,
  setChainStatus,
  updateIteration,
  writeChainLedger,
} from "../../src/workflow/chain.js";
import { RUN_ID_REGEX } from "../../src/workflow/run-id.js";

function withTmpDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "praxis-chain-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const SAMPLE_CREATED_AT = "2026-05-02T14:30:00Z";

function sampleInput() {
  return {
    chainId: "2026-05-02-1430-9f3c",
    intent: "ship the chain ledger",
    iterationsTotal: 5,
    flags: { allowDirty: false, noPause: false },
    createdAt: SAMPLE_CREATED_AT,
  };
}

describe("buildInitialChainLedger", () => {
  it("AC-1: starts in_progress with iterationsCompleted=0, empty iterations[], updatedAt==createdAt", () => {
    const ledger = buildInitialChainLedger(sampleInput());
    expect(ledger.status).toBe<ChainStatus>("in_progress");
    expect(ledger.iterationsCompleted).toBe(0);
    expect(ledger.iterations).toEqual([]);
    expect(ledger.updatedAt).toBe(SAMPLE_CREATED_AT);
  });

  it("AC-2: carries chainId, intent, iterationsTotal, flags, createdAt verbatim", () => {
    const input = sampleInput();
    const ledger = buildInitialChainLedger(input);
    expect(ledger.chainId).toBe(input.chainId);
    expect(ledger.intent).toBe(input.intent);
    expect(ledger.iterationsTotal).toBe(input.iterationsTotal);
    expect(ledger.flags).toEqual(input.flags);
    expect(ledger.createdAt).toBe(input.createdAt);
  });
});

describe("writeChainLedger (AC-3)", () => {
  it("creates .praxis/chains/ if missing and writes pretty-printed JSON + trailing newline", () => {
    withTmpDir((cwd) => {
      const ledger = buildInitialChainLedger(sampleInput());
      expect(existsSync(join(cwd, ".praxis", "chains"))).toBe(false);
      writeChainLedger(cwd, ledger);
      const path = join(cwd, ".praxis", "chains", `${ledger.chainId}.json`);
      expect(existsSync(path)).toBe(true);
      const raw = readFileSync(path, "utf8");
      // Pretty-printed (2-space indent) + trailing newline.
      expect(raw.endsWith("\n")).toBe(true);
      expect(raw).toContain('"chainId": "2026-05-02-1430-9f3c"');
      expect(raw).toBe(`${JSON.stringify(ledger, null, 2)}\n`);
    });
  });

  it("AC-3: overwrites an existing ledger file at the same chainId path", () => {
    withTmpDir((cwd) => {
      const initial = buildInitialChainLedger(sampleInput());
      writeChainLedger(cwd, initial);
      const updated = setChainStatus(
        initial,
        "completed",
        "2026-05-02T15:00:00Z",
      );
      writeChainLedger(cwd, updated);
      const raw = readFileSync(
        join(cwd, ".praxis", "chains", `${initial.chainId}.json`),
        "utf8",
      );
      expect(raw).toContain('"status": "completed"');
    });
  });
});

describe("appendIteration", () => {
  const baseEntry: ChainIterationEntry = {
    index: 1,
    runId: "2026-05-02-1430-a1b2",
    status: "running",
  };

  it("AC-4: appends the entry, advances updatedAt, leaves iterationsCompleted untouched", () => {
    const ledger = buildInitialChainLedger(sampleInput());
    const next = appendIteration(ledger, baseEntry, "2026-05-02T14:31:00Z");
    expect(next.iterations).toEqual([baseEntry]);
    expect(next.updatedAt).toBe("2026-05-02T14:31:00Z");
    expect(next.iterationsCompleted).toBe(0);
  });

  it("AC-5: is pure — input ledger object is not mutated", () => {
    const ledger = buildInitialChainLedger(sampleInput());
    const snapshot: ChainLedger = JSON.parse(JSON.stringify(ledger));
    appendIteration(ledger, baseEntry, "2026-05-02T14:31:00Z");
    expect(ledger).toEqual(snapshot);
  });

  it("AC-19: advances updatedAt to the supplied `now` value verbatim", () => {
    const ledger = buildInitialChainLedger(sampleInput());
    const stamp = "2099-12-31T23:59:59Z";
    const next = appendIteration(ledger, baseEntry, stamp);
    expect(next.updatedAt).toBe(stamp);
  });
});

describe("updateIteration", () => {
  function ledgerWithRunningEntry(): ChainLedger {
    const ledger = buildInitialChainLedger(sampleInput());
    return appendIteration(
      ledger,
      { index: 1, runId: "2026-05-02-1430-a1b2", status: "running" },
      "2026-05-02T14:31:00Z",
    );
  }

  it("AC-6: patches the entry at the given index and advances updatedAt", () => {
    const ledger = ledgerWithRunningEntry();
    const next = updateIteration(
      ledger,
      1,
      { status: "paused" },
      "2026-05-02T14:32:00Z",
    );
    expect(next.iterations[0]).toEqual({
      index: 1,
      runId: "2026-05-02-1430-a1b2",
      status: "paused",
    });
    expect(next.updatedAt).toBe("2026-05-02T14:32:00Z");
    // Status unchanged for non-completed transition; iterationsCompleted untouched.
    expect(next.iterationsCompleted).toBe(0);
  });

  it("AC-7: increments iterationsCompleted on first transition into 'completed'", () => {
    const ledger = ledgerWithRunningEntry();
    const next = updateIteration(
      ledger,
      1,
      { status: "completed", commitSha: "a".repeat(40) },
      "2026-05-02T14:33:00Z",
    );
    expect(next.iterationsCompleted).toBe(1);
    expect(next.iterations[0].commitSha).toBe("a".repeat(40));
    expect(next.iterations[0].status).toBe("completed");
  });

  it("AC-8: idempotent — re-applying a 'completed' patch does NOT double-increment", () => {
    const ledger = ledgerWithRunningEntry();
    const once = updateIteration(
      ledger,
      1,
      { status: "completed", commitSha: "a".repeat(40) },
      "2026-05-02T14:33:00Z",
    );
    const twice = updateIteration(
      once,
      1,
      { status: "completed", commitSha: "b".repeat(40) },
      "2026-05-02T14:34:00Z",
    );
    expect(twice.iterationsCompleted).toBe(1);
    expect(twice.iterations[0].commitSha).toBe("b".repeat(40));
  });

  it("AC-9: throws when the index is not present in iterations", () => {
    const ledger = ledgerWithRunningEntry();
    expect(() =>
      updateIteration(ledger, 99, { status: "failed" }, "2026-05-02T14:33:00Z"),
    ).toThrow();
  });
});

describe("setChainStatus", () => {
  it("AC-16: updates status, advances updatedAt, preserves every other field, and is pure", () => {
    const original = buildInitialChainLedger(sampleInput());
    const snapshot: ChainLedger = JSON.parse(JSON.stringify(original));
    const next = setChainStatus(original, "completed", "2026-05-02T15:00:00Z");
    expect(next.status).toBe<ChainStatus>("completed");
    expect(next.updatedAt).toBe("2026-05-02T15:00:00Z");
    expect(next.chainId).toBe(original.chainId);
    expect(next.intent).toBe(original.intent);
    expect(next.iterationsTotal).toBe(original.iterationsTotal);
    expect(next.iterationsCompleted).toBe(original.iterationsCompleted);
    expect(next.flags).toEqual(original.flags);
    expect(next.createdAt).toBe(original.createdAt);
    expect(next.iterations).toEqual(original.iterations);
    // Pure
    expect(original).toEqual(snapshot);
  });

  it("AC-17: accepts each ChainStatus enum value", () => {
    const ledger = buildInitialChainLedger(sampleInput());
    const statuses: ChainStatus[] = [
      "in_progress",
      "completed",
      "completed-early",
      "aborted",
      "cancelled",
    ];
    for (const status of statuses) {
      const next = setChainStatus(ledger, status, "2026-05-02T15:00:00Z");
      expect(next.status).toBe(status);
    }
  });
});

describe("generateChainId (AC-18)", () => {
  it("delegates to formatRunId — produces a RUN_ID_REGEX-matching id", () => {
    const date = new Date("2026-05-02T14:30:12Z");
    const bytes = new Uint8Array([0x9f, 0x3c]);
    const id = generateChainId(date, bytes);
    expect(id).toBe("2026-05-02-1430-9f3c");
    expect(RUN_ID_REGEX.test(id)).toBe(true);
  });
});
