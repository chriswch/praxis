import { describe, expect, it } from "vitest";
import type { StageConfig } from "../../src/config/schema.js";
import {
  formatAssistantText,
  formatError,
  formatPaused,
  formatRunDone,
  formatStage0,
  formatStageEnd,
  formatStageStart,
  formatToolResult,
  formatToolUse,
} from "../../src/ui/line-formatter.js";
import type { RunSummary } from "../../src/ui/reporter.js";

function stage(id: string): StageConfig {
  return {
    id,
    systemPrompt: { file: "clarify-assess.md" },
    userPromptTemplate: "x",
    outputArtifact: `${id}.md`,
  };
}

describe("formatStageStart (AC-2)", () => {
  it("emits a single `[N/total stage-id] starting…` line", () => {
    expect(formatStageStart(stage("clarify-assess"), 1, 3)).toEqual([
      "[1/3 clarify-assess] starting…",
    ]);
  });

  it("uses the index as given (zero-based vs one-based handled by caller)", () => {
    expect(formatStageStart(stage("implement"), 2, 3)).toEqual([
      "[2/3 implement] starting…",
    ]);
  });
});

describe("formatToolUse (AC-7)", () => {
  it("renders `  › ToolName(brief)`", () => {
    expect(
      formatToolUse({ type: "tool_use", name: "Read", brief: "src/foo.ts" }),
    ).toEqual(["  › Read(src/foo.ts)"]);
  });

  it("renders `  › ToolName()` when brief is empty", () => {
    expect(
      formatToolUse({ type: "tool_use", name: "Mystery", brief: "" }),
    ).toEqual(["  › Mystery()"]);
  });
});

describe("formatToolResult (AC-8)", () => {
  it("is silent on success", () => {
    expect(
      formatToolResult({ type: "tool_result", name: "Read", ok: true }),
    ).toEqual([]);
  });

  it("renders `  ✗ ToolName failed` on failure", () => {
    expect(
      formatToolResult({ type: "tool_result", name: "Bash", ok: false }),
    ).toEqual(["  ✗ Bash failed"]);
  });
});

describe("formatError (AC-9)", () => {
  it("emits each line of a multi-line message", () => {
    expect(
      formatError({ type: "error", message: "boom\ntraceback line" }),
    ).toEqual(["error: boom", "error: traceback line"]);
  });

  it("emits a single-line message as one line", () => {
    expect(formatError({ type: "error", message: "boom" })).toEqual([
      "error: boom",
    ]);
  });
});

describe("formatStage0 (AC-3)", () => {
  it("synthesises `[0/total intent] captured → 00-intent.txt`", () => {
    expect(formatStage0(3, "00-intent.txt")).toEqual([
      "[0/3 intent] captured → 00-intent.txt",
    ]);
  });
});

describe("formatStageEnd (AC-10)", () => {
  it("on success: artifact → session → done", () => {
    expect(
      formatStageEnd(stage("clarify-assess"), 1, 3, {
        ok: true,
        artifactPath: ".praxis/runs/r/01-clarify-assess.md",
        sessionId: "sess_01ABC",
      }),
    ).toEqual([
      "[1/3 clarify-assess] artifact: .praxis/runs/r/01-clarify-assess.md",
      "[1/3 clarify-assess] session: sess_01ABC (claude --resume sess_01ABC to inspect)",
      "[1/3 clarify-assess] done",
    ]);
  });

  it("on failure: artifact line still printed, error line appended", () => {
    expect(
      formatStageEnd(stage("clarify-assess"), 1, 3, {
        ok: false,
        artifactPath: ".praxis/runs/r/01-clarify-assess.md",
        sessionId: "sess_X",
        error: "validator failed",
      }),
    ).toEqual([
      "[1/3 clarify-assess] artifact: .praxis/runs/r/01-clarify-assess.md",
      "[1/3 clarify-assess] session: sess_X (claude --resume sess_X to inspect)",
      "[1/3 clarify-assess] failed: validator failed",
    ]);
  });

  it("hides session line when sessionId is empty", () => {
    expect(
      formatStageEnd(stage("clarify-assess"), 1, 3, {
        ok: true,
        artifactPath: ".praxis/runs/r/01-clarify-assess.md",
        sessionId: "",
      }),
    ).toEqual([
      "[1/3 clarify-assess] artifact: .praxis/runs/r/01-clarify-assess.md",
      "[1/3 clarify-assess] done",
    ]);
  });

  it("omits artifact line when artifactPath missing", () => {
    expect(
      formatStageEnd(stage("clarify-assess"), 1, 3, {
        ok: false,
        sessionId: "",
        error: "boom",
      }),
    ).toEqual(["[1/3 clarify-assess] failed: boom"]);
  });
});

describe("formatResuming (S-004 AC-13)", () => {
  it("renders the §11 'resuming approved plan' headline for the paused path", async () => {
    const { formatResuming } = await import("../../src/ui/line-formatter.js");
    expect(
      formatResuming("approved", "2026-04-25-1430-7af2", "clarify-assess"),
    ).toEqual([
      "praxis: resuming approved plan after clarify-assess (run 2026-04-25-1430-7af2)",
    ]);
  });

  it("renders the §11 'recovering ... re-validating' headline for the recovery path", async () => {
    const { formatResuming } = await import("../../src/ui/line-formatter.js");
    expect(
      formatResuming("recovering", "2026-04-25-1430-7af2", "clarify-assess"),
    ).toEqual([
      "praxis: recovering clarify-assess from on-disk artifact; re-validating (run 2026-04-25-1430-7af2)",
    ]);
  });
});

describe("formatPaused (AC-11)", () => {
  it("renders the canonical advance hint", () => {
    expect(
      formatPaused(
        "2026-04-25-1430-7af2",
        "clarify-assess",
        "/abs/path/01-clarify-assess.md",
      ),
    ).toEqual([
      "praxis: paused after clarify-assess. Review /abs/path/01-clarify-assess.md then run: praxis advance 2026-04-25-1430-7af2",
    ]);
  });
});

describe("formatRunDone (AC-12)", () => {
  it("prints totals and per-stage breakdown including sessionId", () => {
    const summary: RunSummary = {
      cost: { totalTokens: 350, totalUsd: 0.024 },
      perStage: {
        "clarify-assess": { tokens: 150, usd: 0.012, sessionId: "sess_a" },
        implement: { tokens: 200, usd: 0.012, sessionId: "sess_b" },
      },
    };
    expect(formatRunDone("2026-04-25-1430-7af2", summary)).toEqual([
      "[run 2026-04-25-1430-7af2] done — 350 tokens, $0.0240",
      "  clarify-assess: 150 tokens, $0.0120 (sess_a)",
      "  implement: 200 tokens, $0.0120 (sess_b)",
    ]);
  });

  it("includes commitSha when provided", () => {
    const summary: RunSummary = {
      commitSha: "abcdef1",
      cost: { totalTokens: 0, totalUsd: 0 },
      perStage: {},
    };
    const lines = formatRunDone("r", summary);
    expect(lines[0]).toMatch(/commit abcdef1/);
  });
});

describe("formatRunDone (H-1) — headline verb branches on status", () => {
  function summary(status?: RunSummary["status"]): RunSummary {
    return {
      cost: { totalTokens: 100, totalUsd: 0.005 },
      perStage: { foo: { tokens: 100, usd: 0.005, sessionId: "sess_a" } },
      status,
    };
  }

  it("status='completed' renders as `done` (also the back-compat default)", () => {
    expect(formatRunDone("r-1", summary("completed"))[0]).toBe(
      "[run r-1] done — 100 tokens, $0.0050",
    );
    // Omitted status falls back to "completed" so existing callers keep working.
    expect(formatRunDone("r-1", summary(undefined))[0]).toBe(
      "[run r-1] done — 100 tokens, $0.0050",
    );
  });

  it("status='paused' renders as `paused`", () => {
    expect(formatRunDone("r-1", summary("paused"))[0]).toBe(
      "[run r-1] paused — 100 tokens, $0.0050",
    );
  });

  it("status='failed' renders as `failed`; cost line is still accurate", () => {
    const lines = formatRunDone("r-1", summary("failed"));
    expect(lines[0]).toBe("[run r-1] failed — 100 tokens, $0.0050");
    // Per-stage breakdown is preserved on the failed path.
    expect(lines[1]).toBe("  foo: 100 tokens, $0.0050 (sess_a)");
  });

  it("status='cancelled' renders as `cancelled`", () => {
    expect(formatRunDone("r-1", summary("cancelled"))[0]).toBe(
      "[run r-1] cancelled — 100 tokens, $0.0050",
    );
  });
});

describe("formatAssistantText (AC-4) — wrap to terminal width", () => {
  it("short text fits on a single ` › <text>` line", () => {
    expect(formatAssistantText("hello", 80)).toEqual([" › hello"]);
  });

  it("wraps at word boundary; continuation lines indent 3 spaces, no marker", () => {
    // cols=20 so " › " (3) + "the quick brown fox" (19) overflows
    // first line content budget = 20-3 = 17 chars
    // continuation budget = 20-3 = 17 chars
    const text = "the quick brown fox jumps over the lazy dog";
    const lines = formatAssistantText(text, 20);
    expect(lines[0]).toBe(" › the quick brown");
    for (const line of lines.slice(1)) {
      expect(line.startsWith("   ")).toBe(true);
      expect(line.startsWith("   ›")).toBe(false); // no marker on continuation
      expect(line.length).toBeLessThanOrEqual(20);
    }
    // Round-trip: stripping prefix/indent and joining with spaces gives the input.
    const reconstructed = lines
      .map((l, i) => (i === 0 ? l.slice(3) : l.slice(3)))
      .join(" ");
    expect(reconstructed).toBe(text);
  });

  it("breaks an over-long word that exceeds the budget on its own line", () => {
    const text = "x".repeat(40);
    const lines = formatAssistantText(text, 20);
    // Each continuation budget = 17. 40 = 17 + 17 + 6.
    expect(lines).toEqual([
      ` › ${"x".repeat(17)}`,
      `   ${"x".repeat(17)}`,
      `   ${"x".repeat(6)}`,
    ]);
  });

  it("collapses an empty input to a single ` › ` line", () => {
    expect(formatAssistantText("", 80)).toEqual([" › "]);
  });
});

describe("formatAssistantText (AC-5) — first-sentence summarization > 200 chars", () => {
  it("returns first sentence when text exceeds 200 chars and a `.! ?` ends a sentence", () => {
    const head = "First sentence. ";
    const tail = "x".repeat(250);
    const text = head + tail;
    const lines = formatAssistantText(text, 200);
    // First sentence kept verbatim.
    expect(lines[0]).toBe(" › First sentence.");
    expect(lines.length).toBe(1);
  });

  it("with no sentence boundary, falls back to first 200 + …", () => {
    const text = "y".repeat(300);
    const lines = formatAssistantText(text, 1000);
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe(` › ${"y".repeat(200)}…`);
  });

  it("matches sentence boundary at end-of-string too (no trailing space required)", () => {
    const text = `Done.${"z".repeat(250)}`;
    const lines = formatAssistantText(text, 1000);
    // The regex matches `.` followed by space OR end. After "Done." comes "z..."
    // — that's no boundary. So fallback to 200 + …
    expect(lines[0]).toBe(` › ${text.slice(0, 200)}…`);
  });

  it("sentence-end at end-of-text triggers boundary match", () => {
    const head = `${"x".repeat(205)}.`;
    expect(head.length).toBe(206);
    const lines = formatAssistantText(head, 1000);
    // Single sentence ending at EOS.
    expect(lines[0]).toBe(` › ${head}`);
  });

  it("does not summarize at exactly 200 chars or below", () => {
    const text = "z".repeat(200);
    const lines = formatAssistantText(text, 1000);
    expect(lines).toEqual([` › ${text}`]);
  });
});
