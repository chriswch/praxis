import { describe, expect, it, vi } from "vitest";
import { parseRunArgs } from "../../src/cli.js";

/**
 * S-002 — `parseRunArgs` covers the `--iterations <N>` surface alongside the
 * existing `--allow-dirty` / `--no-pause` toggles. Every validation failure
 * goes through the existing `fail(...)` helper which writes to stderr and
 * calls `process.exit(1)` — tests stub both so the assertions can match
 * against the captured message without crashing the worker.
 */

function withFailedExit<T>(fn: () => T): {
  message: string;
  exitCalled: boolean;
} {
  const written: string[] = [];
  const writeSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk) => {
      written.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      return true;
    });
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("__exit__");
  }) as never);
  let exitCalled = false;
  try {
    fn();
  } catch (err) {
    if (err instanceof Error && err.message === "__exit__") {
      exitCalled = true;
    } else {
      throw err;
    }
  } finally {
    writeSpy.mockRestore();
    exitSpy.mockRestore();
  }
  return { message: written.join(""), exitCalled };
}

describe("parseRunArgs --iterations surface", () => {
  it("AC-S2-1: returns iterations: undefined when --iterations is absent", () => {
    const parsed = parseRunArgs(["ship it"]);
    expect(parsed.iterations).toBeUndefined();
    expect(parsed.intent).toBe("ship it");
  });

  it("AC-S2-2: returns iterations: <N> for a valid positive integer", () => {
    const parsed = parseRunArgs(["--iterations", "3", "ship it"]);
    expect(parsed.iterations).toBe(3);
    expect(parsed.intent).toBe("ship it");
  });

  it("AC-S2-2: accepts --iterations 1 (uniformity with N>1)", () => {
    const parsed = parseRunArgs(["--iterations", "1", "ship it"]);
    expect(parsed.iterations).toBe(1);
  });

  it("AC-S2-3: rejects --iterations 0 with positive-integer message", () => {
    const { message, exitCalled } = withFailedExit(() =>
      parseRunArgs(["--iterations", "0", "ship it"]),
    );
    expect(exitCalled).toBe(true);
    expect(message).toMatch(/iterations must be a positive integer/);
  });

  it("AC-S2-4: rejects negative integer", () => {
    const { message, exitCalled } = withFailedExit(() =>
      parseRunArgs(["--iterations", "-2", "ship it"]),
    );
    expect(exitCalled).toBe(true);
    expect(message).toMatch(/iterations must be a positive integer/);
  });

  it("AC-S2-5: rejects non-integer string", () => {
    const { message, exitCalled } = withFailedExit(() =>
      parseRunArgs(["--iterations", "abc", "ship it"]),
    );
    expect(exitCalled).toBe(true);
    expect(message).toMatch(/iterations must be a positive integer/);
  });

  it("AC-S2-5: rejects fractional values like 1.5", () => {
    const { message, exitCalled } = withFailedExit(() =>
      parseRunArgs(["--iterations", "1.5", "ship it"]),
    );
    expect(exitCalled).toBe(true);
    expect(message).toMatch(/iterations must be a positive integer/);
  });

  it("AC-S2-6: rejects missing value (--iterations at end)", () => {
    const { message, exitCalled } = withFailedExit(() =>
      parseRunArgs(["ship it", "--iterations"]),
    );
    expect(exitCalled).toBe(true);
    expect(message).toMatch(/iterations must be a positive integer/);
  });

  it("AC-S2-6: rejects --iterations followed by another flag (no value provided)", () => {
    const { message, exitCalled } = withFailedExit(() =>
      parseRunArgs(["--iterations", "--no-pause", "ship it"]),
    );
    expect(exitCalled).toBe(true);
    expect(message).toMatch(/iterations must be a positive integer/);
  });

  it("AC-S2-7: still rejects missing intent when --iterations 1 is provided", () => {
    const { message, exitCalled } = withFailedExit(() =>
      parseRunArgs(["--iterations", "1"]),
    );
    expect(exitCalled).toBe(true);
    expect(message).toMatch(/missing intent/);
  });

  it("AC-S2-8: composes with --allow-dirty and --no-pause", () => {
    const parsed = parseRunArgs([
      "--allow-dirty",
      "--no-pause",
      "--iterations",
      "5",
      "ship it",
    ]);
    expect(parsed).toEqual({
      intent: "ship it",
      allowDirty: true,
      noPause: true,
      iterations: 5,
    });
  });

  it("AC-S2-8: --iterations <N> can appear anywhere in the arg list", () => {
    const parsed = parseRunArgs([
      "ship it",
      "--iterations",
      "2",
      "--allow-dirty",
    ]);
    expect(parsed.iterations).toBe(2);
    expect(parsed.allowDirty).toBe(true);
    expect(parsed.intent).toBe("ship it");
  });
});
