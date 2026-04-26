import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withTempRepo } from "../support/tmp-repo.js";

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
      throw new Error(
        `npm run build failed: ${build.stderr || build.stdout}`,
      );
    }
    if (!existsSync(distEntry)) {
      throw new Error(`expected build output at ${distEntry}`);
    }
  }, 60_000);

  it("emits a run-id and writes intent + state when invoked from dist", async () => {
    await withTempRepo(async ({ dir }) => {
      const result = spawnSync("node", [distEntry, "run", "smoke"], {
        cwd: dir,
        encoding: "utf8",
      });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);

      const runId = result.stdout.trim();
      expect(runId).toMatch(
        /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}-[0-9a-f]{4}$/,
      );

      const runDir = join(dir, ".praxis", "runs", runId);
      expect(readFileSync(join(runDir, "00-intent.txt"), "utf8")).toBe(
        "smoke",
      );
      const state = JSON.parse(
        readFileSync(join(runDir, "state.json"), "utf8"),
      );
      expect(state.runId).toBe(runId);
      expect(state.intent).toBe("smoke");
    });
  });
});
