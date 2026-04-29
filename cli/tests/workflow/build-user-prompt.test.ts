import { describe, expect, it } from "vitest";
import type { StageConfig } from "../../src/config/schema.js";
import { buildUserPrompt } from "../../src/workflow/stage.js";

/**
 * S-1 AC-6/AC-7 — `buildUserPrompt` learns the `{{baselineSha}}` token.
 *
 * Tests use inline `userPromptTemplate` strings so they don't depend on the
 * on-disk prompt files (which live under `src/config/prompts/`).
 */

const SHA = "0123456789abcdef0123456789abcdef01234567";

function stage(template: string): StageConfig {
  return {
    id: "test",
    systemPrompt: { file: "clarify-assess.md" },
    userPromptTemplate: template,
    outputArtifact: "out.md",
  };
}

function ctx(extras?: Partial<{ baselineSha: string }>) {
  return {
    intent: "x",
    runDir: "/run/dir",
    baselineSha: extras?.baselineSha ?? SHA,
    artifactPaths: {},
  };
}

describe("buildUserPrompt baselineSha token (AC-6)", () => {
  it("expands {{baselineSha}}", () => {
    const rendered = buildUserPrompt(stage("HEAD was {{baselineSha}}"), ctx());
    expect(rendered).toBe(`HEAD was ${SHA}`);
  });

  it("expands {{ baselineSha }} with surrounding whitespace", () => {
    const rendered = buildUserPrompt(
      stage("HEAD was {{ baselineSha }}"),
      ctx(),
    );
    expect(rendered).toBe(`HEAD was ${SHA}`);
  });

  it("expands the same baselineSha multiple times in a single template", () => {
    const rendered = buildUserPrompt(
      stage("a={{baselineSha}}; b={{ baselineSha }}"),
      ctx(),
    );
    expect(rendered).toBe(`a=${SHA}; b=${SHA}`);
  });
});

describe("buildUserPrompt unknown-token rejection (AC-7)", () => {
  it("throws on {{baseline}} (typo missing 'Sha')", () => {
    expect(() =>
      buildUserPrompt(stage("nope {{baseline}}"), ctx()),
    ).toThrowError(/unknown interpolation token/);
  });

  it("throws on {{baselineSHA}} (wrong casing)", () => {
    expect(() =>
      buildUserPrompt(stage("nope {{baselineSHA}}"), ctx()),
    ).toThrowError(/unknown interpolation token/);
  });
});
