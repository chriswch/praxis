import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildInitialChainLedger,
  type ChainLedger,
  readChainLedger,
  writeChainLedger,
} from "../../src/workflow/chain.js";

function withTmpDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "praxis-chain-read-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const CHAIN_ID = "2026-05-02-1430-9f3c";

function writeRawLedger(cwd: string, body: string): void {
  const dir = join(cwd, ".praxis", "chains");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${CHAIN_ID}.json`), body, "utf8");
}

function validLedger(): ChainLedger {
  return {
    chainId: CHAIN_ID,
    intent: "ship the chain ledger",
    iterationsTotal: 3,
    iterationsCompleted: 1,
    flags: { allowDirty: false, noPause: true },
    status: "in_progress",
    createdAt: "2026-05-02T14:30:00Z",
    updatedAt: "2026-05-02T14:42:13Z",
    iterations: [
      {
        index: 1,
        runId: "2026-05-02-1430-a1b2",
        status: "completed",
        commitSha: "a".repeat(40),
      },
      {
        index: 2,
        runId: "2026-05-02-1442-c3d4",
        status: "running",
      },
    ],
  };
}

describe("readChainLedger structural validation", () => {
  it("AC-10: returns ok:false with a reason when the ledger file is missing", () => {
    withTmpDir((cwd) => {
      const result = readChainLedger(cwd, CHAIN_ID);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason).toMatch(/chain/i);
      expect(result.reason).toContain(CHAIN_ID);
    });
  });

  it("AC-11: returns ok:false when the ledger file is not valid JSON", () => {
    withTmpDir((cwd) => {
      writeRawLedger(cwd, "{ not json");
      const result = readChainLedger(cwd, CHAIN_ID);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason.toLowerCase()).toMatch(/json|parse/);
    });
  });

  it("AC-12: returns ok:false when a required top-level string field is missing", () => {
    withTmpDir((cwd) => {
      const bad = { ...validLedger(), chainId: undefined };
      writeRawLedger(cwd, JSON.stringify(bad));
      const result = readChainLedger(cwd, CHAIN_ID);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason.toLowerCase()).toMatch(/chainid|missing|invalid/);
    });
  });

  it("AC-12: returns ok:false when iterationsTotal is not a number", () => {
    withTmpDir((cwd) => {
      const bad = { ...validLedger(), iterationsTotal: "five" };
      writeRawLedger(cwd, JSON.stringify(bad));
      const result = readChainLedger(cwd, CHAIN_ID);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason).toContain("iterationsTotal");
    });
  });

  it("AC-12: returns ok:false when status is not a known ChainStatus", () => {
    withTmpDir((cwd) => {
      const bad = { ...validLedger(), status: "weird" };
      writeRawLedger(cwd, JSON.stringify(bad));
      const result = readChainLedger(cwd, CHAIN_ID);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason).toContain("status");
    });
  });

  it("AC-13: returns ok:false when flags is not an object with two booleans", () => {
    withTmpDir((cwd) => {
      const bad = { ...validLedger(), flags: { allowDirty: false } };
      writeRawLedger(cwd, JSON.stringify(bad));
      const result = readChainLedger(cwd, CHAIN_ID);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason).toContain("flags");
    });
  });

  it("AC-13: returns ok:false when a flag value is not a boolean", () => {
    withTmpDir((cwd) => {
      const bad = {
        ...validLedger(),
        flags: { allowDirty: "no", noPause: true },
      };
      writeRawLedger(cwd, JSON.stringify(bad));
      const result = readChainLedger(cwd, CHAIN_ID);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason).toContain("flags");
    });
  });

  it("AC-14: returns ok:false when iterations is not an array", () => {
    withTmpDir((cwd) => {
      const bad = { ...validLedger(), iterations: "not an array" };
      writeRawLedger(cwd, JSON.stringify(bad));
      const result = readChainLedger(cwd, CHAIN_ID);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason).toContain("iterations");
    });
  });

  it("AC-14: returns ok:false when an iteration entry is missing required fields", () => {
    withTmpDir((cwd) => {
      const bad = {
        ...validLedger(),
        iterations: [{ index: 1, runId: "x" }], // missing status
      };
      writeRawLedger(cwd, JSON.stringify(bad));
      const result = readChainLedger(cwd, CHAIN_ID);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason.toLowerCase()).toMatch(/iteration|status/);
    });
  });

  it("AC-14: returns ok:false when an iteration entry has an unknown status", () => {
    withTmpDir((cwd) => {
      const bad = {
        ...validLedger(),
        iterations: [
          { index: 1, runId: "2026-05-02-1430-a1b2", status: "weird" },
        ],
      };
      writeRawLedger(cwd, JSON.stringify(bad));
      const result = readChainLedger(cwd, CHAIN_ID);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason).toContain("status");
    });
  });

  it("AC-14: returns ok:false when commitSha (when present) is not a string", () => {
    withTmpDir((cwd) => {
      const bad = {
        ...validLedger(),
        iterations: [
          {
            index: 1,
            runId: "2026-05-02-1430-a1b2",
            status: "completed",
            commitSha: 12345,
          },
        ],
      };
      writeRawLedger(cwd, JSON.stringify(bad));
      const result = readChainLedger(cwd, CHAIN_ID);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason).toContain("commitSha");
    });
  });

  it("AC-15: returns ok:true and round-trips a well-formed ledger via writeChainLedger", () => {
    withTmpDir((cwd) => {
      const ledger = buildInitialChainLedger({
        chainId: CHAIN_ID,
        intent: "ship the chain ledger",
        iterationsTotal: 2,
        flags: { allowDirty: true, noPause: false },
        createdAt: "2026-05-02T14:30:00Z",
      });
      writeChainLedger(cwd, ledger);
      const result = readChainLedger(cwd, CHAIN_ID);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.reason);
      expect(result.ledger).toEqual(ledger);
    });
  });

  it("AC-15: round-trips a ledger with iteration entries (including optional commitSha)", () => {
    withTmpDir((cwd) => {
      const ledger = validLedger();
      writeChainLedger(cwd, ledger);
      const result = readChainLedger(cwd, CHAIN_ID);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.reason);
      expect(result.ledger).toEqual(ledger);
    });
  });
});
