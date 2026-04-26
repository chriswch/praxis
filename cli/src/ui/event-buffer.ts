/**
 * Coalesce streaming `assistant_text` deltas (AC-6). Pushed text accumulates
 * for `windowMs` (default 100); after the window the buffered text is handed
 * to `onFlush` exactly once. `flush()` and `dispose()` are escape hatches the
 * reporter calls before boundary lines (stage end, stage start, paused) so
 * coalesced text always lands before the next structural line.
 *
 * The scheduler is injectable so tests can drive the timer with vi.fakeTimers
 * or capture the callback directly.
 */
export interface Scheduler {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

export interface EventBufferOptions {
  windowMs: number;
  onFlush: (text: string) => void;
  scheduler?: Scheduler;
}

const DEFAULT_SCHEDULER: Scheduler = {
  setTimeout: (cb, delay) => setTimeout(cb, delay),
  clearTimeout: (h) => clearTimeout(h),
};

export class EventBuffer {
  private buffer = "";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly windowMs: number;
  private readonly onFlush: (text: string) => void;
  private readonly scheduler: Scheduler;

  constructor(opts: EventBufferOptions) {
    this.windowMs = opts.windowMs;
    this.onFlush = opts.onFlush;
    this.scheduler = opts.scheduler ?? DEFAULT_SCHEDULER;
  }

  push(delta: string): void {
    if (this.disposed) return;
    this.buffer += delta;
    if (this.timer === null) {
      this.timer = this.scheduler.setTimeout(() => this.flush(), this.windowMs);
    }
  }

  flush(): void {
    if (this.disposed) return;
    if (this.timer !== null) {
      this.scheduler.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer.length === 0) return;
    const text = this.buffer;
    this.buffer = "";
    this.onFlush(text);
  }

  dispose(): void {
    if (this.timer !== null) {
      this.scheduler.clearTimeout(this.timer);
      this.timer = null;
    }
    this.buffer = "";
    this.disposed = true;
  }
}
