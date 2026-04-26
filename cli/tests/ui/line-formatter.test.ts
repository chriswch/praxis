import { describe, it, expect } from "vitest";
import type { StageConfig } from "../../src/config/schema.js";
import { formatStageStart } from "../../src/ui/line-formatter.js";

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
