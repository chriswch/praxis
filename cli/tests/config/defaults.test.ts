import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defaultWorkflow } from "../../src/config/defaults.js";
import { praxisConfigSchema } from "../../src/config/schema.js";
import { buildUserPrompt, loadSystemPrompt } from "../../src/workflow/stage.js";
import { validateCodeReviewArtifact } from "../../src/workflow/validator.js";

describe("defaultWorkflow", () => {
  it("conforms to praxisConfigSchema", () => {
    const result = praxisConfigSchema.safeParse(defaultWorkflow);
    expect(result.success).toBe(true);
  });

  // S-002 AC-1: 5-stage shape with code-reviewing and code-improving inserted
  // between implement and auto-commit.
  it("has the five required stage ids in order", () => {
    expect(defaultWorkflow.workflow.map((s) => s.id)).toEqual([
      "clarify-assess",
      "implement",
      "code-reviewing",
      "code-improving",
      "auto-commit",
    ]);
  });

  // M-2 regression: runner.ts dispatches the commit hand-off with a
  // magic-string check on `stage.id === "auto-commit"`. A silent rename of
  // the default stage id would skip the commit hand-off without any other
  // test failing. Lock the id here.
  it("contains a stage with id 'auto-commit' (runner dispatch lock)", () => {
    expect(
      defaultWorkflow.workflow.find((s) => s.id === "auto-commit"),
    ).toBeDefined();
  });

  it("pins the per-stage models", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    expect(byId["clarify-assess"].model).toBe("claude-opus-4-7");
    expect(byId.implement.model).toBe("claude-opus-4-7");
    expect(byId["code-reviewing"].model).toBe("claude-opus-4-7");
    expect(byId["code-improving"].model).toBe("claude-opus-4-7");
    expect(byId["auto-commit"].model).toBe("claude-haiku-4-5-20251001");
  });

  it("pins per-stage outputArtifact filenames", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    expect(byId["clarify-assess"].outputArtifact).toBe("01-clarify-assess.md");
    expect(byId.implement.outputArtifact).toBe("02-implement-log.md");
    expect(byId["code-reviewing"].outputArtifact).toBe("03-code-review.md");
    expect(byId["code-improving"].outputArtifact).toBe("04-code-improve.md");
    // S-002 AC-4: auto-commit artifact renumbered 03 → 05.
    expect(byId["auto-commit"].outputArtifact).toBe("05-commit.txt");
  });

  it("only pauses after clarify-assess by default", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    expect(byId["clarify-assess"].pauseAfter).toBe(true);
    expect(byId.implement.pauseAfter ?? false).toBe(false);
    expect(byId["code-reviewing"].pauseAfter ?? false).toBe(false);
    expect(byId["code-improving"].pauseAfter ?? false).toBe(false);
    expect(byId["auto-commit"].pauseAfter ?? false).toBe(false);
  });

  it("attaches validate hooks to clarify-assess and code-reviewing only", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    expect(typeof byId["clarify-assess"].validate).toBe("function");
    expect(byId.implement.validate).toBeUndefined();
    // S-002 AC-2: code-reviewing wires the Decision-H2 validator.
    expect(byId["code-reviewing"].validate).toBe(validateCodeReviewArtifact);
    expect(byId["code-improving"].validate).toBeUndefined();
    expect(byId["auto-commit"].validate).toBeUndefined();
  });

  it("clarify-assess uses default permission with the read-only allowlist", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    const ca = byId["clarify-assess"];
    expect(ca.permissionMode ?? "default").toBe("default");
    expect([...(ca.allowedTools ?? [])].sort()).toEqual(
      ["Bash", "Glob", "Grep", "Read"].sort(),
    );
  });

  it("implement uses bypassPermissions and no allowedTools restriction", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    expect(byId.implement.permissionMode).toBe("bypassPermissions");
    expect(byId.implement.allowedTools).toBeUndefined();
  });

  it("auto-commit uses default permission with Bash-only allowlist", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    const ac = byId["auto-commit"];
    expect(ac.permissionMode ?? "default").toBe("default");
    expect(ac.allowedTools).toEqual(["Bash"]);
  });

  // S-002 AC-2: code-reviewing stage shape.
  it("code-reviewing uses default permission with the review-tool allowlist", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    const cr = byId["code-reviewing"];
    expect(cr.permissionMode ?? "default").toBe("default");
    expect([...(cr.allowedTools ?? [])].sort()).toEqual(
      ["Bash", "Glob", "Grep", "Read", "Skill"].sort(),
    );
    expect(cr.timeoutMs).toBe(900_000);
    expect(cr.systemPrompt).toEqual({ file: "code-reviewing.md" });
  });

  // S-002 AC-3: code-improving stage shape.
  it("code-improving uses bypassPermissions and no allowedTools restriction", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    const ci = byId["code-improving"];
    expect(ci.permissionMode).toBe("bypassPermissions");
    expect(ci.allowedTools).toBeUndefined();
    expect(ci.timeoutMs).toBe(1_800_000);
    expect(ci.systemPrompt).toEqual({ file: "code-improving.md" });
  });

  // S-002 AC-5: AUTO_COMMIT_ID literal must remain "auto-commit" so the runner
  // dispatch in runner.ts (`stage.id === AUTO_COMMIT_ID`) keeps firing.
  it("AUTO_COMMIT_ID stays 'auto-commit' (runner dispatch lock)", async () => {
    const { AUTO_COMMIT_ID } = await import("../../src/config/defaults.js");
    expect(AUTO_COMMIT_ID).toBe("auto-commit");
  });

  // S-003: same pattern as AUTO_COMMIT_ID. The runner dispatches the
  // clean-tree skip-propagation and the decision-driven skip via
  // `stage.id === CODE_REVIEWING_ID` / `stage.id === CODE_IMPROVING_ID`, so a
  // silent rename of either default stage id would skip the dispatch without
  // any other test failing. Lock the literals here.
  it("CODE_REVIEWING_ID stays 'code-reviewing' (runner dispatch lock)", async () => {
    const { CODE_REVIEWING_ID } = await import(
      "../../src/config/defaults.js"
    );
    expect(CODE_REVIEWING_ID).toBe("code-reviewing");
  });

  it("CODE_IMPROVING_ID stays 'code-improving' (runner dispatch lock)", async () => {
    const { CODE_IMPROVING_ID } = await import(
      "../../src/config/defaults.js"
    );
    expect(CODE_IMPROVING_ID).toBe("code-improving");
  });

  it("rejects a config with zero stages", () => {
    const result = praxisConfigSchema.safeParse({ version: 1, workflow: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a config with version != 1", () => {
    const result = praxisConfigSchema.safeParse({
      version: 2,
      workflow: defaultWorkflow.workflow,
    });
    expect(result.success).toBe(false);
  });
});

/**
 * H-1 regression: implement and auto-commit used to share the same .md file
 * for both the system prompt AND the user prompt template — meaning the
 * agent received its own system prompt (with explanatory code-fenced blocks)
 * verbatim as the user prompt. Pin the rendered user prompt for each stage
 * to the spec's exact instructions and prove no system-prompt content leaks
 * into the user prompt.
 */
describe("defaultWorkflow user prompts (H-1 regression)", () => {
  function ctx(extras?: { artifactPaths?: Record<string, string> }) {
    return {
      intent: "add a logout button",
      runDir: "/run/dir",
      artifactPaths: extras?.artifactPaths ?? {},
    };
  }

  function stageById(id: string) {
    const s = defaultWorkflow.workflow.find((s) => s.id === id);
    if (!s) throw new Error(`stage ${id} not found`);
    return s;
  }

  it("clarify-assess renders intent + runDir", () => {
    const rendered = buildUserPrompt(stageById("clarify-assess"), ctx());
    expect(rendered).toContain("Intent: add a logout button");
    expect(rendered).toContain("Run dir: /run/dir");
    // System prompt content (e.g. the H2 schema fence) must not appear in
    // the user prompt.
    expect(rendered).not.toContain("Required artifact schema");
  });

  it("implement references the clarify-assess artifact path", () => {
    const rendered = buildUserPrompt(
      stageById("implement"),
      ctx({
        artifactPaths: { "clarify-assess": "/run/dir/01-clarify-assess.md" },
      }),
    );
    expect(rendered).toContain("Read /run/dir/01-clarify-assess.md");
    expect(rendered).toContain("implement the plan");
    expect(rendered).toContain("Edit files in the current working directory");
    // System prompt content must NOT leak into the user prompt.
    const sys = loadSystemPrompt(stageById("implement"));
    expect(rendered).not.toBe(sys);
    expect(rendered).not.toContain("User-prompt template");
  });

  it("auto-commit asks for a Conventional-Commits message only", () => {
    const rendered = buildUserPrompt(stageById("auto-commit"), ctx());
    expect(rendered.toLowerCase()).toContain("conventional");
    expect(rendered).toMatch(/git diff/);
    // System prompt content must NOT leak into the user prompt.
    const sys = loadSystemPrompt(stageById("auto-commit"));
    expect(rendered).not.toBe(sys);
    expect(rendered).not.toContain("`permissionMode`");
  });

  // S-002 AC-2: code-reviewing user prompt references {{runDir}} and asks
  // the agent to invoke the praxis:code-reviewing skill via Skill.
  it("code-reviewing renders runDir and names the praxis:code-reviewing skill", () => {
    const rendered = buildUserPrompt(stageById("code-reviewing"), ctx());
    expect(rendered).toContain("/run/dir");
    expect(rendered).toContain("praxis:code-reviewing");
    expect(rendered.toLowerCase()).toContain("skill");
    // System prompt content must NOT leak into the user prompt.
    const sys = loadSystemPrompt(stageById("code-reviewing"));
    expect(rendered).not.toBe(sys);
  });

  // S-002 AC-3: code-improving user prompt references the code-reviewing
  // artifact path token and names the praxis:code-improving skill.
  it("code-improving references the code-reviewing artifact path and names the skill", () => {
    const rendered = buildUserPrompt(
      stageById("code-improving"),
      ctx({
        artifactPaths: { "code-reviewing": "/run/dir/03-code-review.md" },
      }),
    );
    expect(rendered).toContain("/run/dir/03-code-review.md");
    expect(rendered).toContain("praxis:code-improving");
    // System prompt content must NOT leak into the user prompt.
    const sys = loadSystemPrompt(stageById("code-improving"));
    expect(rendered).not.toBe(sys);
  });
});

/**
 * S-002 AC-6, AC-7, AC-8: prompt files exist on disk and contain the marker
 * phrases the runtime relies on. Belt-and-braces against accidental deletion
 * or stale-template regressions.
 */
describe("S-002 prompt-file smoke tests", () => {
  // Resolve src/config/prompts/ relative to this test file so the assertions
  // don't depend on cwd.
  const promptsDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "src",
    "config",
    "prompts",
  );

  it("code-reviewing.md exists and references the praxis:code-reviewing skill + Decision contract", () => {
    const path = join(promptsDir, "code-reviewing.md");
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toContain("praxis:code-reviewing");
    expect(text).toContain("## Decision");
    expect(text).toContain("proceed");
    expect(text).toContain("skip-improve");
  });

  it("code-improving.md exists and references the praxis:code-improving skill + review-artifact token", () => {
    const path = join(promptsDir, "code-improving.md");
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toContain("praxis:code-improving");
    expect(text).toContain("{{artifacts.code-reviewing.path}}");
    expect(text).toContain("bypassPermissions");
  });

  it("auto-commit.md uses 05-commit.txt, not 03-commit.txt", () => {
    const path = join(promptsDir, "auto-commit.md");
    const text = readFileSync(path, "utf8");
    expect(text).toContain("05-commit.txt");
    expect(text).not.toContain("03-commit.txt");
  });
});
