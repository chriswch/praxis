import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Writable } from "node:stream";
import type { StageConfig } from "../../src/config/schema.js";
import { LineReporter } from "../../src/ui/line-reporter.js";

function stage(id: string): StageConfig {
  return {
    id,
    systemPrompt: { file: "clarify-assess.md" },
    userPromptTemplate: "x",
    outputArtifact: `${id}.md`,
  };
}

class CapturedStream extends Writable {
  chunks: string[] = [];
  _write(chunk: Buffer | string, _enc: string, cb: () => void): void {
    this.chunks.push(chunk.toString());
    cb();
  }
  text(): string {
    return this.chunks.join("");
  }
}

function makeReporter(opts?: { cols?: number; color?: boolean }): {
  reporter: LineReporter;
  out: CapturedStream;
  err: CapturedStream;
} {
  const out = new CapturedStream();
  const err = new CapturedStream();
  const reporter = new LineReporter({
    stdout: out,
    stderr: err,
    cols: opts?.cols ?? 80,
    color: opts?.color ?? false,
  });
  return { reporter, out, err };
}

describe("LineReporter (AC-2/7/8/10/11/12)", () => {
  it("stageStart writes the formatted line + newline to stdout", () => {
    const { reporter, out } = makeReporter();
    reporter.stageStart(stage("clarify-assess"), 1, 3);
    expect(out.text()).toBe("[1/3 clarify-assess] starting…\n");
  });

  it("tool_use → `  › ToolName(brief)`", () => {
    const { reporter, out } = makeReporter();
    reporter.stageStart(stage("clarify-assess"), 1, 3);
    reporter.stageEvent({ type: "tool_use", name: "Read", brief: "src/foo.ts" });
    expect(out.text()).toContain("  › Read(src/foo.ts)\n");
  });

  it("tool_result silent on success, prints failure marker on failure", () => {
    const { reporter, out } = makeReporter();
    reporter.stageEvent({ type: "tool_result", name: "Read", ok: true });
    reporter.stageEvent({ type: "tool_result", name: "Bash", ok: false });
    expect(out.text()).toBe("  ✗ Bash failed\n");
  });

  it("error writes to stderr with no color when color=false", () => {
    const { reporter, err, out } = makeReporter({ color: false });
    reporter.stageEvent({ type: "error", message: "boom" });
    expect(out.text()).toBe("");
    expect(err.text()).toBe("error: boom\n");
  });

  it("error wraps lines in red ANSI when color=true", () => {
    const { reporter, err } = makeReporter({ color: true });
    reporter.stageEvent({ type: "error", message: "boom" });
    expect(err.text()).toContain("\x1b[31m");
    expect(err.text()).toContain("\x1b[0m");
    expect(err.text()).toContain("error: boom");
  });

  it("stageEnd prints artifact + session + done lines", () => {
    const { reporter, out } = makeReporter();
    reporter.stageEnd(stage("clarify-assess"), {
      ok: true,
      artifactPath: "/tmp/run/01-clarify-assess.md",
      sessionId: "sess_X",
    });
    const text = out.text();
    expect(text).toContain("artifact: /tmp/run/01-clarify-assess.md");
    expect(text).toContain("session: sess_X (claude --resume sess_X to inspect)");
    expect(text).toContain("done");
  });

  it("paused prints the canonical advance hint to stdout", () => {
    const { reporter, out } = makeReporter();
    reporter.paused("2026-04-25-1430-7af2", "clarify-assess", "/abs/01-clarify-assess.md");
    expect(out.text()).toBe(
      "praxis: paused after clarify-assess. Review /abs/01-clarify-assess.md then run: praxis advance 2026-04-25-1430-7af2\n",
    );
  });

  it("runDone prints totals + per-stage breakdown", () => {
    const { reporter, out } = makeReporter();
    reporter.runDone("r-1", {
      cost: { totalTokens: 100, totalUsd: 0.005 },
      perStage: { foo: { tokens: 100, usd: 0.005, sessionId: "sess_a" } },
    });
    const text = out.text();
    expect(text).toContain("[run r-1] done");
    expect(text).toContain("foo: 100 tokens, $0.0050 (sess_a)");
  });

  it("stage 0 helper prints the synthesized intent line", () => {
    const { reporter, out } = makeReporter();
    reporter.stage0(3, "00-intent.txt");
    expect(out.text()).toBe("[0/3 intent] captured → 00-intent.txt\n");
  });

  it("resuming(approved) prints the §11 headline (S-004 AC-13)", () => {
    const { reporter, out } = makeReporter();
    reporter.resuming("approved", "2026-04-25-1430-7af2", "clarify-assess");
    expect(out.text()).toBe(
      "praxis: resuming approved plan after clarify-assess (run 2026-04-25-1430-7af2)\n",
    );
  });

  it("resuming(recovering) prints the §11 recovery headline", () => {
    const { reporter, out } = makeReporter();
    reporter.resuming("recovering", "2026-04-25-1430-7af2", "clarify-assess");
    expect(out.text()).toBe(
      "praxis: recovering clarify-assess from on-disk artifact; re-validating (run 2026-04-25-1430-7af2)\n",
    );
  });
});

describe("LineReporter assistant_text coalescing (AC-6)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("buffers deltas for 100ms then emits one wrapped line", () => {
    const { reporter, out } = makeReporter({ cols: 80 });
    reporter.stageEvent({ type: "assistant_text", text: "hello " });
    reporter.stageEvent({ type: "assistant_text", text: "world" });
    expect(out.text()).toBe("");
    vi.advanceTimersByTime(100);
    expect(out.text()).toBe(" › hello world\n");
  });

  it("flushes the buffered text before the next stageStart line", () => {
    const { reporter, out } = makeReporter({ cols: 80 });
    reporter.stageEvent({ type: "assistant_text", text: "partial" });
    reporter.stageStart(stage("implement"), 2, 3);
    // The partial text must land before the boundary line.
    const text = out.text();
    const partialIdx = text.indexOf(" › partial");
    const startIdx = text.indexOf("[2/3 implement] starting…");
    expect(partialIdx).toBeGreaterThanOrEqual(0);
    expect(startIdx).toBeGreaterThan(partialIdx);
  });

  it("flushes before tool_use too", () => {
    const { reporter, out } = makeReporter({ cols: 80 });
    reporter.stageEvent({ type: "assistant_text", text: "thinking…" });
    reporter.stageEvent({ type: "tool_use", name: "Read", brief: "x" });
    const text = out.text();
    expect(text.indexOf(" › thinking…")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("  › Read(x)")).toBeGreaterThan(text.indexOf(" › thinking…"));
  });

  it("flushes before stageEnd and disposes the buffer", () => {
    const { reporter, out } = makeReporter({ cols: 80 });
    reporter.stageEvent({ type: "assistant_text", text: "trailing" });
    reporter.stageEnd(stage("implement"), {
      ok: true,
      artifactPath: "/x/02.md",
      sessionId: "s",
    });
    const text = out.text();
    expect(text.indexOf(" › trailing")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("artifact: /x/02.md")).toBeGreaterThan(
      text.indexOf(" › trailing"),
    );
  });

  it("flushes before paused", () => {
    const { reporter, out } = makeReporter({ cols: 80 });
    reporter.stageEvent({ type: "assistant_text", text: "wrap-up" });
    reporter.paused("r", "s", "/p");
    const text = out.text();
    expect(text.indexOf(" › wrap-up")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("praxis: paused")).toBeGreaterThan(
      text.indexOf(" › wrap-up"),
    );
  });
});
