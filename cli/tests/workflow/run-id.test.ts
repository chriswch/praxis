import { describe, expect, it } from "vitest";
import { formatRunId } from "../../src/workflow/run-id.js";

describe("formatRunId", () => {
  it("produces the canonical id from the spec example", () => {
    const date = new Date("2026-04-25T14:30:12Z");
    const bytes = new Uint8Array([0x7a, 0xf2]);
    expect(formatRunId(date, bytes)).toBe("2026-04-25-1430-7af2");
  });

  it("zero-pads single-digit hex bytes", () => {
    const date = new Date("2026-01-02T03:04:05Z");
    const bytes = new Uint8Array([0x00, 0x0f]);
    expect(formatRunId(date, bytes)).toBe("2026-01-02-0304-000f");
  });

  it("formats UTC components regardless of local timezone", () => {
    // 23:59 UTC the day before in many North American zones
    const date = new Date("2026-12-31T23:59:00Z");
    const bytes = new Uint8Array([0xab, 0xcd]);
    expect(formatRunId(date, bytes)).toBe("2026-12-31-2359-abcd");
  });

  it("uses lowercase hex", () => {
    const date = new Date("2026-04-25T14:30:12Z");
    const bytes = new Uint8Array([0xff, 0xa0]);
    expect(formatRunId(date, bytes)).toBe("2026-04-25-1430-ffa0");
  });

  it("rejects fewer than 2 random bytes", () => {
    expect(() =>
      formatRunId(new Date("2026-04-25T14:30:12Z"), new Uint8Array([0x01])),
    ).toThrow(/2 random bytes/);
  });

  it("ignores random bytes beyond the first two", () => {
    const date = new Date("2026-04-25T14:30:12Z");
    const bytes = new Uint8Array([0x7a, 0xf2, 0xde, 0xad]);
    expect(formatRunId(date, bytes)).toBe("2026-04-25-1430-7af2");
  });
});
