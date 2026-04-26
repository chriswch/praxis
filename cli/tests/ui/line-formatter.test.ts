import { describe, it, expect } from "vitest";
import type { StageConfig } from "../../src/config/schema.js";
import {
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
    expect(formatToolUse({ type: "tool_use", name: "Read", brief: "src/foo.ts" })).toEqual([
      "  › Read(src/foo.ts)",
    ]);
  });

  it("renders `  › ToolName()` when brief is empty", () => {
    expect(formatToolUse({ type: "tool_use", name: "Mystery", brief: "" })).toEqual([
      "  › Mystery()",
    ]);
  });
});

describe("formatToolResult (AC-8)", () => {
  it("is silent on success", () => {
    expect(formatToolResult({ type: "tool_result", name: "Read", ok: true })).toEqual([]);
  });

  it("renders `  ✗ ToolName failed` on failure", () => {
    expect(formatToolResult({ type: "tool_result", name: "Bash", ok: false })).toEqual([
      "  ✗ Bash failed",
    ]);
  });
});

describe("formatError (AC-9)", () => {
  it("emits each line of a multi-line message", () => {
    expect(
      formatError({ type: "error", message: "boom\ntraceback line" }),
    ).toEqual(["error: boom", "error: traceback line"]);
  });

  it("emits a single-line message as one line", () => {
    expect(formatError({ type: "error", message: "boom" })).toEqual(["error: boom"]);
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

describe("formatPaused (AC-11)", () => {
  it("renders the canonical advance hint", () => {
    expect(
      formatPaused("2026-04-25-1430-7af2", "clarify-assess", "/abs/path/01-clarify-assess.md"),
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
