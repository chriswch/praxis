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

  // S-4 AC-1: 7-stage shape; the new `verifying-and-adapting` stage is
  // inserted at index 5 between `code-improving` and `auto-commit`. It runs
  // the `praxis:verifying-and-adapting` skill against the clarify-assess
  // spec + driving-tdd summary (+ optional sketch), is read-only, and has no
  // validator.
  it("has the seven required stage ids in order", () => {
    expect(defaultWorkflow.workflow.map((s) => s.id)).toEqual([
      "clarify-assess",
      "sketching-design",
      "driving-tdd",
      "code-reviewing",
      "code-improving",
      "verifying-and-adapting",
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
    expect(byId["sketching-design"].model).toBe("claude-opus-4-7");
    expect(byId["driving-tdd"].model).toBe("claude-opus-4-7");
    expect(byId["code-reviewing"].model).toBe("claude-opus-4-7");
    expect(byId["code-improving"].model).toBe("claude-opus-4-7");
    // S-4 AC-1: verifying-and-adapting uses Opus 4.7 (same family as the other
    // skill-invoking read-only stages).
    expect(byId["verifying-and-adapting"].model).toBe("claude-opus-4-7");
    expect(byId["auto-commit"].model).toBe("claude-haiku-4-5-20251001");
  });

  it("pins per-stage outputArtifact filenames", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    expect(byId["clarify-assess"].outputArtifact).toBe("01-clarify-assess.md");
    // S-2 AC-1: sketching-design inserted at slot 02.
    expect(byId["sketching-design"].outputArtifact).toBe(
      "02-sketching-design.md",
    );
    // S-2 AC-2 + S-3 AC-1: trailing four artifacts numbered 03→06; slot 03 is
    // now `03-driving-tdd.md` (renamed from `03-implement-log.md`).
    expect(byId["driving-tdd"].outputArtifact).toBe("03-driving-tdd.md");
    expect(byId["code-reviewing"].outputArtifact).toBe("04-code-review.md");
    expect(byId["code-improving"].outputArtifact).toBe("05-code-improve.md");
    // S-4 AC-1: verifying-and-adapting inserted at slot 06; auto-commit
    // bumped to slot 07.
    expect(byId["verifying-and-adapting"].outputArtifact).toBe(
      "06-verifying-and-adapting.md",
    );
    expect(byId["auto-commit"].outputArtifact).toBe("07-commit.txt");
  });

  it("only pauses after clarify-assess by default", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    expect(byId["clarify-assess"].pauseAfter).toBe(true);
    expect(byId["sketching-design"].pauseAfter ?? false).toBe(false);
    expect(byId["driving-tdd"].pauseAfter ?? false).toBe(false);
    expect(byId["code-reviewing"].pauseAfter ?? false).toBe(false);
    expect(byId["code-improving"].pauseAfter ?? false).toBe(false);
    // S-4 AC-1: verifying-and-adapting has no pauseAfter (auto-advances).
    expect(byId["verifying-and-adapting"].pauseAfter ?? false).toBe(false);
    expect(byId["auto-commit"].pauseAfter ?? false).toBe(false);
  });

  it("attaches validate hooks to clarify-assess and code-reviewing only", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    expect(typeof byId["clarify-assess"].validate).toBe("function");
    // S-2 AC-1: sketching-design has no validator (the skill's three valid
    // output shapes — sketch / skipped / spec-issue — all pass through).
    expect(byId["sketching-design"].validate).toBeUndefined();
    // S-3 AC-1: driving-tdd has no validator (skill owns final-message shape).
    expect(byId["driving-tdd"].validate).toBeUndefined();
    // S-002 AC-2: code-reviewing wires the Decision-H2 validator.
    expect(byId["code-reviewing"].validate).toBe(validateCodeReviewArtifact);
    expect(byId["code-improving"].validate).toBeUndefined();
    // S-4 AC-1: verifying-and-adapting has no validator (skill owns the
    // multiple valid output shapes; same shape as sketching-design).
    expect(byId["verifying-and-adapting"].validate).toBeUndefined();
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

  it("driving-tdd uses bypassPermissions and no allowedTools restriction", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    expect(byId["driving-tdd"].permissionMode).toBe("bypassPermissions");
    expect(byId["driving-tdd"].allowedTools).toBeUndefined();
    expect(byId["driving-tdd"].timeoutMs).toBe(1_800_000);
    expect(byId["driving-tdd"].systemPrompt).toEqual({
      file: "driving-tdd.md",
    });
  });

  it("auto-commit uses default permission with Bash-only allowlist", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    const ac = byId["auto-commit"];
    expect(ac.permissionMode ?? "default").toBe("default");
    expect(ac.allowedTools).toEqual(["Bash"]);
  });

  // S-2 AC-1: sketching-design stage shape — clones the read-only Skill-
  // invoking pattern from code-reviewing but without a validator.
  it("sketching-design uses default permission with the read-only Skill-invoking allowlist", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    const sd = byId["sketching-design"];
    expect(sd.permissionMode ?? "default").toBe("default");
    expect([...(sd.allowedTools ?? [])].sort()).toEqual(
      ["Bash", "Glob", "Grep", "Read", "Skill"].sort(),
    );
    expect(sd.timeoutMs).toBe(900_000);
    expect(sd.systemPrompt).toEqual({ file: "sketching-design.md" });
    expect(sd.outputArtifact).toBe("02-sketching-design.md");
    expect(sd.validate).toBeUndefined();
    expect(sd.pauseAfter ?? false).toBe(false);
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

  // S-4 AC-1: verifying-and-adapting stage shape — read-only Skill-invoking
  // (mirrors sketching-design + code-reviewing), no validator, no pauseAfter,
  // 15-minute timeout.
  it("verifying-and-adapting uses default permission with the read-only Skill-invoking allowlist", () => {
    const byId = Object.fromEntries(
      defaultWorkflow.workflow.map((s) => [s.id, s] as const),
    );
    const va = byId["verifying-and-adapting"];
    expect(va.permissionMode ?? "default").toBe("default");
    expect([...(va.allowedTools ?? [])].sort()).toEqual(
      ["Bash", "Glob", "Grep", "Read", "Skill"].sort(),
    );
    expect(va.timeoutMs).toBe(900_000);
    expect(va.systemPrompt).toEqual({ file: "verifying-and-adapting.md" });
    expect(va.outputArtifact).toBe("06-verifying-and-adapting.md");
    expect(va.validate).toBeUndefined();
    expect(va.pauseAfter ?? false).toBe(false);
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
    const { CODE_REVIEWING_ID } = await import("../../src/config/defaults.js");
    expect(CODE_REVIEWING_ID).toBe("code-reviewing");
  });

  it("CODE_IMPROVING_ID stays 'code-improving' (runner dispatch lock)", async () => {
    const { CODE_IMPROVING_ID } = await import("../../src/config/defaults.js");
    expect(CODE_IMPROVING_ID).toBe("code-improving");
  });

  // S-4 AC-4: VERIFYING_AND_ADAPTING_ID literal must remain
  // "verifying-and-adapting" so the runner's cascade-skip eligibility check
  // (`stage.id !== VERIFYING_AND_ADAPTING_ID`) continues to fire. Same
  // dispatch-lock rationale as AUTO_COMMIT_ID.
  it("VERIFYING_AND_ADAPTING_ID stays 'verifying-and-adapting' (runner dispatch lock)", async () => {
    const { VERIFYING_AND_ADAPTING_ID } = await import(
      "../../src/config/defaults.js"
    );
    expect(VERIFYING_AND_ADAPTING_ID).toBe("verifying-and-adapting");
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
  function ctx(extras?: {
    artifactPaths?: Record<string, string>;
    baselineSha?: string;
  }) {
    return {
      intent: "add a logout button",
      runDir: "/run/dir",
      // S-3 AC-3/4: code-reviewing + code-improving prompts reference
      // {{baselineSha}}, so the interpolation needs a value. Default to a
      // recognisable placeholder so assertions can match it.
      baselineSha: extras?.baselineSha ?? "BASELINE_SHA",
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

  it("driving-tdd references the clarify-assess + sketching-design artifact paths and names the praxis:driving-tdd skill", () => {
    const rendered = buildUserPrompt(
      stageById("driving-tdd"),
      ctx({
        artifactPaths: {
          "clarify-assess": "/run/dir/01-clarify-assess.md",
          "sketching-design": "/run/dir/02-sketching-design.md",
        },
      }),
    );
    expect(rendered).toContain("/run/dir/01-clarify-assess.md");
    expect(rendered).toContain("/run/dir/02-sketching-design.md");
    expect(rendered).toContain("praxis:driving-tdd");
    expect(rendered).toContain("/run/dir");
    expect(rendered).toContain("03-driving-tdd.md");
    // System prompt content must NOT leak into the user prompt.
    const sys = loadSystemPrompt(stageById("driving-tdd"));
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

  // S-002 AC-2 + S-3 AC-3: code-reviewing user prompt references {{runDir}},
  // names the praxis:code-reviewing skill, and points at the per-AC commit
  // range via {{baselineSha}}..HEAD instead of the old "uncommitted" wording.
  it("code-reviewing renders runDir, names the praxis:code-reviewing skill, and points at the baselineSha..HEAD range", () => {
    const rendered = buildUserPrompt(stageById("code-reviewing"), ctx());
    expect(rendered).toContain("/run/dir");
    expect(rendered).toContain("praxis:code-reviewing");
    expect(rendered.toLowerCase()).toContain("skill");
    // {{baselineSha}} is interpolated to the BASELINE_SHA placeholder by ctx().
    expect(rendered).toContain("git diff BASELINE_SHA..HEAD");
    expect(rendered).toContain("git log BASELINE_SHA..HEAD");
    expect(rendered.toLowerCase()).not.toContain("uncommitted");
    expect(rendered).not.toContain("do NOT use `git log`");
    // System prompt content must NOT leak into the user prompt.
    const sys = loadSystemPrompt(stageById("code-reviewing"));
    expect(rendered).not.toBe(sys);
  });

  // S-002 AC-3 + S-3 AC-4: code-improving user prompt references the
  // code-reviewing artifact path, names the praxis:code-improving skill, and
  // points at the per-AC commit range via {{baselineSha}}..HEAD.
  it("code-improving references the code-reviewing artifact path, names the skill, and points at the baselineSha..HEAD range", () => {
    const rendered = buildUserPrompt(
      stageById("code-improving"),
      ctx({
        // S-2 AC-2: review artifact renumbered 03 → 04.
        artifactPaths: { "code-reviewing": "/run/dir/04-code-review.md" },
      }),
    );
    expect(rendered).toContain("/run/dir/04-code-review.md");
    expect(rendered).toContain("praxis:code-improving");
    expect(rendered).toContain("git diff BASELINE_SHA..HEAD");
    expect(rendered).toContain("git log BASELINE_SHA..HEAD");
    // System prompt content must NOT leak into the user prompt.
    const sys = loadSystemPrompt(stageById("code-improving"));
    expect(rendered).not.toBe(sys);
  });

  // S-2 AC-1/AC-3: sketching-design user prompt references the clarify-assess
  // artifact path, names the praxis:sketching-design skill, and renders runDir.
  it("sketching-design renders runDir, names the praxis:sketching-design skill, and references the clarify-assess artifact path", () => {
    const rendered = buildUserPrompt(
      stageById("sketching-design"),
      ctx({
        artifactPaths: { "clarify-assess": "/run/dir/01-clarify-assess.md" },
      }),
    );
    expect(rendered).toContain("/run/dir");
    expect(rendered).toContain("/run/dir/01-clarify-assess.md");
    expect(rendered).toContain("praxis:sketching-design");
    expect(rendered.toLowerCase()).toContain("skill");
    // System prompt content must NOT leak into the user prompt.
    const sys = loadSystemPrompt(stageById("sketching-design"));
    expect(rendered).not.toBe(sys);
  });

  // S-4 AC-1/AC-3: verifying-and-adapting user prompt references the
  // clarify-assess spec, the driving-tdd summary, and the optional
  // sketching-design sketch by absolute path; names the
  // praxis:verifying-and-adapting skill; renders runDir + baselineSha.
  it("verifying-and-adapting names the praxis:verifying-and-adapting skill and references all five interpolation tokens", () => {
    const rendered = buildUserPrompt(
      stageById("verifying-and-adapting"),
      ctx({
        artifactPaths: {
          "clarify-assess": "/run/dir/01-clarify-assess.md",
          "sketching-design": "/run/dir/02-sketching-design.md",
          "driving-tdd": "/run/dir/03-driving-tdd.md",
        },
      }),
    );
    expect(rendered).toContain("/run/dir/01-clarify-assess.md");
    expect(rendered).toContain("/run/dir/03-driving-tdd.md");
    expect(rendered).toContain("/run/dir/02-sketching-design.md");
    expect(rendered).toContain("/run/dir");
    expect(rendered).toContain("BASELINE_SHA");
    expect(rendered).toContain("praxis:verifying-and-adapting");
    expect(rendered.toLowerCase()).toContain("skill");
    // System prompt content must NOT leak into the user prompt.
    const sys = loadSystemPrompt(stageById("verifying-and-adapting"));
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

  it("code-reviewing.md exists and references the praxis:code-reviewing skill + Decision contract + baselineSha range", () => {
    const path = join(promptsDir, "code-reviewing.md");
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toContain("praxis:code-reviewing");
    expect(text).toContain("## Decision");
    expect(text).toContain("proceed");
    expect(text).toContain("skip-improve");
    // S-3 AC-3: walk the per-AC commits via the baselineSha range. The
    // "uncommitted" / "do NOT use git log" wording must be gone.
    expect(text).toContain("git diff {{baselineSha}}..HEAD");
    expect(text).toContain("git log {{baselineSha}}..HEAD");
    expect(text.toLowerCase()).not.toContain("uncommitted");
    expect(text).not.toContain("do NOT use `git log`");
  });

  it("code-improving.md exists and references the praxis:code-improving skill + review-artifact token + baselineSha range", () => {
    const path = join(promptsDir, "code-improving.md");
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toContain("praxis:code-improving");
    expect(text).toContain("{{artifacts.code-reviewing.path}}");
    expect(text).toContain("bypassPermissions");
    // S-3 AC-4: walk the per-AC commits via the baselineSha range.
    expect(text).toContain("git diff {{baselineSha}}..HEAD");
    expect(text).toContain("git log {{baselineSha}}..HEAD");
  });

  // S-3 AC-2: driving-tdd.md exists, names the praxis:driving-tdd skill,
  // references both the clarify-assess spec AND the sketching-design sketch
  // tokens, acknowledges per-AC commits, and writes its final message to
  // 03-driving-tdd.md.
  it("driving-tdd.md exists and references the praxis:driving-tdd skill + both spec/sketch tokens + per-AC commits + 03-driving-tdd.md", () => {
    const path = join(promptsDir, "driving-tdd.md");
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toContain("praxis:driving-tdd");
    expect(text).toContain("{{artifacts.clarify-assess.path}}");
    expect(text).toContain("{{artifacts.sketching-design.path}}");
    expect(text).toContain("bypassPermissions");
    expect(text).toContain("03-driving-tdd.md");
    // Per-AC commits acknowledgement (skill owns commits, agent doesn't
    // commit manually).
    expect(text.toLowerCase()).toContain("per-ac commits");
  });

  // S-3 AC-2: implement.md must be gone — the rename to driving-tdd.md is
  // atomic.
  it("implement.md is no longer on disk", () => {
    expect(existsSync(join(promptsDir, "implement.md"))).toBe(false);
  });

  // S-4 AC-2: auto-commit's commit artifact bumped 06 → 07 by the new
  // verifying-and-adapting stage taking slot 06.
  it("auto-commit.md uses 07-commit.txt, not the old numbering", () => {
    const path = join(promptsDir, "auto-commit.md");
    const text = readFileSync(path, "utf8");
    expect(text).toContain("07-commit.txt");
    expect(text).not.toContain("03-commit.txt");
    expect(text).not.toContain("05-commit.txt");
    expect(text).not.toContain("06-commit.txt");
  });

  // S-4 AC-3: verifying-and-adapting.md exists, instructs invoking the
  // praxis:verifying-and-adapting skill against the spec + TDD summary +
  // optional sketch, and acknowledges the read-only / no-validator semantics.
  it("verifying-and-adapting.md exists and references the praxis:verifying-and-adapting skill + spec/TDD/sketch tokens + read-only constraint", () => {
    const path = join(promptsDir, "verifying-and-adapting.md");
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toContain("praxis:verifying-and-adapting");
    expect(text).toContain("{{artifacts.clarify-assess.path}}");
    expect(text).toContain("{{artifacts.driving-tdd.path}}");
    expect(text).toContain("{{artifacts.sketching-design.path}}");
    expect(text).toContain("06-verifying-and-adapting.md");
    // Read-only constraint mirrors sketching-design's "Do not modify any
    // files yourself" line.
    expect(text.toLowerCase()).toContain("read-only");
    // No-validator semantics — the skill's multiple valid output shapes pass
    // through verbatim.
    expect(text.toLowerCase()).toContain("no validator");
  });

  // S-2 AC-3: sketching-design.md exists, instructs invoking the
  // praxis:sketching-design skill against the clarify-assess artifact, and
  // acknowledges the three valid output shapes (sketch / skipped / spec-issue).
  it("sketching-design.md exists and references the praxis:sketching-design skill + the clarify-assess artifact token + the three output shapes", () => {
    const path = join(promptsDir, "sketching-design.md");
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toContain("praxis:sketching-design");
    expect(text).toContain("{{artifacts.clarify-assess.path}}");
    // The three valid output shapes the skill emits.
    expect(text.toLowerCase()).toContain("design sketch");
    expect(text.toLowerCase()).toContain("skipped");
    expect(text).toContain("Spec Issue");
  });
});
