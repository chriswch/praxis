import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const distEntry = join(repoRoot, "dist", "cli.js");

describe("praxis (built)", () => {
  beforeAll(() => {
    const build = spawnSync("npm", ["run", "build", "--silent"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (build.status !== 0) {
      throw new Error(`npm run build failed: ${build.stderr || build.stdout}`);
    }
    if (!existsSync(distEntry)) {
      throw new Error(`expected build output at ${distEntry}`);
    }
  }, 60_000);

  it("blocks pre-flight outside a git repo (no SDK call needed)", () => {
    const cwd = mkdtempSync(join(tmpdir(), "praxis-build-smoke-"));
    try {
      const result = spawnSync("node", [distEntry, "run", "smoke"], {
        cwd,
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr.toLowerCase()).toMatch(/git/);
      expect(existsSync(join(cwd, ".praxis"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("ships every stage's system prompt next to the compiled loader", () => {
    // src/workflow/stage.ts resolves PROMPTS_DIR relative to the .js file;
    // tsc emits no .md, so the build script must copy them or runStage
    // crashes with ENOENT on the very first stage. Locks against regression.
    const promptsDir = join(repoRoot, "dist", "config", "prompts");
    expect(existsSync(join(promptsDir, "clarify-assess.md"))).toBe(true);
    expect(existsSync(join(promptsDir, "driving-tdd.md"))).toBe(true);
    expect(existsSync(join(promptsDir, "auto-commit.md"))).toBe(true);
    // S-3 AC-2: implement.md is gone — driving-tdd.md replaces it.
    expect(existsSync(join(promptsDir, "implement.md"))).toBe(false);
  });
});
