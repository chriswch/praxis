import type { Writable } from "node:stream";
import type { StageConfig } from "../config/schema.js";
import type { AgentEvent } from "../workflow/stage.js";
import { EventBuffer, type Scheduler } from "./event-buffer.js";
import {
  formatAssistantText,
  formatError,
  formatPaused,
  formatResuming,
  formatRunDone,
  formatStage0,
  formatStageEnd,
  formatStageStart,
  formatToolResult,
  formatToolUse,
} from "./line-formatter.js";
import type { Reporter, RunSummary, StageEndResult } from "./reporter.js";

const DEFAULT_COLS = 80;
const COALESCE_MS = 100;

export interface LineReporterOptions {
  /** Defaults to `process.stdout`. */
  stdout?: Writable;
  /** Defaults to `process.stderr`. */
  stderr?: Writable;
  /** Terminal width override. Defaults to 80; the CLI passes `process.stdout.columns` when present. */
  cols?: number;
  /**
   * Whether to apply color (currently only red on `error`). Defaults to false
   * — `cli.ts` enables it when stderr is a TTY and `NO_COLOR` is unset.
   */
  color?: boolean;
  /** Injectable scheduler so tests can drive the 100ms coalesce window. */
  scheduler?: Scheduler;
}

/**
 * Stdout/stderr Reporter implementing product.md §8 formatting.
 *
 * Composes the pure formatters (`./line-formatter.ts`) with an `EventBuffer`
 * that coalesces streaming `assistant_text` deltas for 100ms (AC-6). The
 * buffer is force-flushed before every structural boundary line — stageStart,
 * stageEnd, paused, runDone, and tool_use/tool_result — so coalesced text
 * never lands after a structural line.
 *
 * Per-stage state (index/total) is captured on stageStart so the matching
 * stageEnd line gets the same `[i/total id]` tag.
 */
export class LineReporter implements Reporter {
  private readonly stdout: Writable;
  private readonly stderr: Writable;
  private readonly cols: number;
  private readonly color: boolean;
  private readonly buffer: EventBuffer;
  private currentIndex = 0;
  private currentTotal = 0;

  constructor(opts: LineReporterOptions = {}) {
    this.stdout = opts.stdout ?? process.stdout;
    this.stderr = opts.stderr ?? process.stderr;
    this.cols = opts.cols ?? DEFAULT_COLS;
    this.color = opts.color ?? false;
    this.buffer = new EventBuffer({
      windowMs: COALESCE_MS,
      onFlush: (text) =>
        this.writeAll(this.stdout, formatAssistantText(text, this.cols)),
      scheduler: opts.scheduler,
    });
  }

  stageStart(stage: StageConfig, idx: number, total: number): void {
    this.currentIndex = idx;
    this.currentTotal = total;
    this.buffer.flush();
    this.writeAll(this.stdout, formatStageStart(stage, idx, total));
  }

  stageEvent(e: AgentEvent): void {
    if (e.type === "assistant_text") {
      this.buffer.push(e.text);
      return;
    }
    // Anything that is not assistant_text is a structural line; flush first.
    this.buffer.flush();
    if (e.type === "tool_use") {
      this.writeAll(this.stdout, formatToolUse(e));
      return;
    }
    if (e.type === "tool_result") {
      this.writeAll(this.stdout, formatToolResult(e));
      return;
    }
    if (e.type === "error") {
      const lines = formatError(e);
      this.writeAll(this.stderr, this.color ? lines.map(red) : lines);
      return;
    }
  }

  stageEnd(stage: StageConfig, result: StageEndResult): void {
    this.buffer.flush();
    this.writeAll(
      this.stdout,
      formatStageEnd(stage, this.currentIndex, this.currentTotal, result),
    );
  }

  paused(runId: string, stageId: string, artifactPath: string): void {
    this.buffer.flush();
    this.writeAll(this.stdout, formatPaused(runId, stageId, artifactPath));
  }

  runDone(runId: string, summary: RunSummary): void {
    this.buffer.flush();
    this.writeAll(this.stdout, formatRunDone(runId, summary));
  }

  /**
   * Synthesize the §5.1 stage-0 line. Optional method on the Reporter
   * interface (Stage 0 has no StageConfig); the runner invokes it via
   * `reporter.stage0?.(...)` so Reporters that don't care simply skip it.
   */
  stage0(total: number, intentFilename: string): void {
    this.writeAll(this.stdout, formatStage0(total, intentFilename));
  }

  /**
   * S-004 AC-13: §11 resume / recover headline emitted by `praxis advance`.
   * Optional on the Reporter interface; runner calls it via
   * `reporter.resuming?.(...)` and skips when absent.
   */
  resuming(
    kind: "approved" | "recovering",
    runId: string,
    stageId: string,
  ): void {
    this.buffer.flush();
    this.writeAll(this.stdout, formatResuming(kind, runId, stageId));
  }

  private writeAll(stream: Writable, lines: string[]): void {
    for (const line of lines) {
      stream.write(`${line}\n`);
    }
  }
}

const RED = "\x1b[31m";
const RESET = "\x1b[0m";
function red(s: string): string {
  return `${RED}${s}${RESET}`;
}
