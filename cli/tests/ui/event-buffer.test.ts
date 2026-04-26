import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBuffer } from "../../src/ui/event-buffer.js";

describe("EventBuffer (AC-6) — 100ms delta coalescing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not flush before the 100ms window elapses", () => {
    const flushed: string[] = [];
    const buf = new EventBuffer({
      windowMs: 100,
      onFlush: (text) => flushed.push(text),
    });

    buf.push("hello ");
    vi.advanceTimersByTime(50);
    expect(flushed).toEqual([]);

    buf.push("world");
    vi.advanceTimersByTime(49);
    expect(flushed).toEqual([]);
  });

  it("flushes the coalesced text exactly once after the window elapses", () => {
    const flushed: string[] = [];
    const buf = new EventBuffer({
      windowMs: 100,
      onFlush: (text) => flushed.push(text),
    });

    buf.push("hello ");
    buf.push("world");
    vi.advanceTimersByTime(100);
    expect(flushed).toEqual(["hello world"]);

    // No double-flush: another tick yields nothing further.
    vi.advanceTimersByTime(100);
    expect(flushed).toEqual(["hello world"]);
  });

  it("subsequent push after a flush starts a new window", () => {
    const flushed: string[] = [];
    const buf = new EventBuffer({
      windowMs: 100,
      onFlush: (text) => flushed.push(text),
    });

    buf.push("a");
    vi.advanceTimersByTime(100);
    expect(flushed).toEqual(["a"]);

    buf.push("b");
    vi.advanceTimersByTime(100);
    expect(flushed).toEqual(["a", "b"]);
  });

  it("flush() forces an immediate emit and cancels the pending timer", () => {
    const flushed: string[] = [];
    const buf = new EventBuffer({
      windowMs: 100,
      onFlush: (text) => flushed.push(text),
    });

    buf.push("partial");
    buf.flush();
    expect(flushed).toEqual(["partial"]);

    // Timer must be a no-op now.
    vi.advanceTimersByTime(100);
    expect(flushed).toEqual(["partial"]);
  });

  it("flush() with no pending text emits nothing", () => {
    const flushed: string[] = [];
    const buf = new EventBuffer({
      windowMs: 100,
      onFlush: (text) => flushed.push(text),
    });
    buf.flush();
    expect(flushed).toEqual([]);
  });

  it("dispose() cancels pending timers and prevents further flushes", () => {
    const flushed: string[] = [];
    const buf = new EventBuffer({
      windowMs: 100,
      onFlush: (text) => flushed.push(text),
    });
    buf.push("hello");
    buf.dispose();
    vi.advanceTimersByTime(100);
    expect(flushed).toEqual([]);
  });

  it("uses the injected scheduler when provided (test isolation hook)", () => {
    const flushed: string[] = [];
    let storedCb: (() => void) | null = null;
    let storedDelay: number | null = null;
    const buf = new EventBuffer({
      windowMs: 100,
      onFlush: (text) => flushed.push(text),
      scheduler: {
        setTimeout: (cb, delay) => {
          storedCb = cb;
          storedDelay = delay;
          return 1 as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimeout: () => {},
      },
    });
    buf.push("hi");
    expect(storedDelay).toBe(100);
    expect(typeof storedCb).toBe("function");
    storedCb?.();
    expect(flushed).toEqual(["hi"]);
  });
});
