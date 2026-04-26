import { describe, expect, it } from "vitest";
import { briefFor } from "../../src/ui/brief.js";

describe("briefFor (AC-16) — tool-name → short, single-line summary", () => {
  it("Read uses file_path", () => {
    expect(briefFor("Read", { file_path: "src/foo.ts" })).toBe("src/foo.ts");
  });

  it("Edit uses file_path", () => {
    expect(
      briefFor("Edit", {
        file_path: "src/foo.ts",
        old_string: "x",
        new_string: "y",
      }),
    ).toBe("src/foo.ts");
  });

  it("Write uses file_path", () => {
    expect(briefFor("Write", { file_path: "src/foo.ts", content: "..." })).toBe(
      "src/foo.ts",
    );
  });

  it("Glob uses pattern", () => {
    expect(briefFor("Glob", { pattern: "src/**/*.ts" })).toBe("src/**/*.ts");
  });

  it("Grep uses pattern (path optional)", () => {
    expect(briefFor("Grep", { pattern: "TODO" })).toBe("TODO");
    expect(briefFor("Grep", { pattern: "TODO", path: "src" })).toBe(
      "TODO in src",
    );
  });

  it("Bash uses command, truncated to 60 chars", () => {
    expect(briefFor("Bash", { command: "git log -5" })).toBe("git log -5");
    const long = "a".repeat(80);
    const out = briefFor("Bash", { command: long });
    expect(out.length).toBeLessThanOrEqual(61); // 60 + ellipsis
    expect(out.endsWith("…")).toBe(true);
  });

  it("Task uses description (truncated to 60 chars)", () => {
    expect(briefFor("Task", { description: "do the thing" })).toBe(
      "do the thing",
    );
    const long = "x".repeat(80);
    const out = briefFor("Task", { description: long });
    expect(out.length).toBeLessThanOrEqual(61);
    expect(out.endsWith("…")).toBe(true);
  });

  it("falls back to empty string for unknown tools or missing input shape", () => {
    expect(briefFor("Unknown", { whatever: 1 })).toBe("");
    expect(briefFor("Read", null)).toBe("");
    expect(briefFor("Read", undefined)).toBe("");
    expect(briefFor("Bash", { command: 42 })).toBe("");
  });
});
