import { describe, it, expect } from "vitest";
import { defaultWorkflow } from "../../src/config/defaults.js";
import { praxisConfigSchema } from "../../src/config/schema.js";

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
