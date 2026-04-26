import { describe, it, expect } from "vitest";
import { defaultWorkflow } from "../../src/config/defaults.js";
import { praxisConfigSchema } from "../../src/config/schema.js";
import { buildUserPrompt, loadSystemPrompt } from "../../src/workflow/stage.js";

describe("defaultWorkflow", () => {
  it("conforms to praxisConfigSchema", () => {
    const result = praxisConfigSchema.safeParse(defaultWorkflow);
    expect(result.success).toBe(true);
  });

  it("has the three required stage ids in order", () => {
    expect(defaultWorkflow.workflow.map((s) => s.id)).toEqual([
      "clarify-assess",
      "implement",
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

  it("pins the per-stage models from product.md §6", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    expect(byId["clarify-assess"].model).toBe("claude-opus-4-7");
    expect(byId["implement"].model).toBe("claude-opus-4-7");
    expect(byId["auto-commit"].model).toBe("claude-haiku-4-5-20251001");
  });

  it("pins per-stage outputArtifact filenames from §9", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    expect(byId["clarify-assess"].outputArtifact).toBe("01-clarify-assess.md");
    expect(byId["implement"].outputArtifact).toBe("02-implement-log.md");
    expect(byId["auto-commit"].outputArtifact).toBe("03-commit.txt");
  });

  it("only pauses after clarify-assess by default", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    expect(byId["clarify-assess"].pauseAfter).toBe(true);
    expect(byId["implement"].pauseAfter ?? false).toBe(false);
    expect(byId["auto-commit"].pauseAfter ?? false).toBe(false);
  });

  it("attaches a validate hook only to clarify-assess", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    expect(typeof byId["clarify-assess"].validate).toBe("function");
    expect(byId["implement"].validate).toBeUndefined();
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
    expect(byId["implement"].permissionMode).toBe("bypassPermissions");
    expect(byId["implement"].allowedTools).toBeUndefined();
  });

  it("auto-commit uses default permission with Bash-only allowlist", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    const ac = byId["auto-commit"];
    expect(ac.permissionMode ?? "default").toBe("default");
    expect(ac.allowedTools).toEqual(["Bash"]);
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

  it("clarify-assess renders intent + runDir per spec §5.2", () => {
    const rendered = buildUserPrompt(stageById("clarify-assess"), ctx());
    expect(rendered).toContain("Intent: add a logout button");
    expect(rendered).toContain("Run dir: /run/dir");
    // System prompt content (e.g. the H2 schema fence) must not appear in
    // the user prompt.
    expect(rendered).not.toContain("Required artifact schema");
  });

  it("implement references the clarify-assess artifact path per spec §5.3", () => {
    const rendered = buildUserPrompt(
      stageById("implement"),
      ctx({ artifactPaths: { "clarify-assess": "/run/dir/01-clarify-assess.md" } }),
    );
    expect(rendered).toContain("Read /run/dir/01-clarify-assess.md");
    expect(rendered).toContain("implement the plan");
    expect(rendered).toContain("Edit files in the current working directory");
    // System prompt content must NOT leak into the user prompt.
    const sys = loadSystemPrompt(stageById("implement"));
    expect(rendered).not.toBe(sys);
    expect(rendered).not.toContain("User-prompt template");
  });

  it("auto-commit asks for a Conventional-Commits message only per spec §5.4", () => {
    const rendered = buildUserPrompt(stageById("auto-commit"), ctx());
    expect(rendered.toLowerCase()).toContain("conventional");
    expect(rendered).toMatch(/git diff/);
    // System prompt content must NOT leak into the user prompt.
    const sys = loadSystemPrompt(stageById("auto-commit"));
    expect(rendered).not.toBe(sys);
    expect(rendered).not.toContain("`permissionMode`");
  });
});
