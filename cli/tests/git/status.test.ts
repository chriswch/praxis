import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { currentHead } from "../../src/git/status.js";
import { withTempRepo } from "../support/tmp-repo.js";

/**
 * S-1 — direct unit tests for the `currentHead(cwd)` helper. Same shape as
 * `isWorkingTreeClean`'s pattern: real git, real fs, inside a `withTempRepo`.
 */

describe("currentHead happy path", () => {
  it("returns {ok:true, sha} matching git rev-parse HEAD when the repo has a commit", async () => {
    await withTempRepo(async ({ dir }) => {
      writeFileSync(join(dir, "seed.txt"), "seed\n", "utf8");
      spawnSync("git", ["add", "seed.txt"], { cwd: dir });
      spawnSync("git", ["commit", "-m", "seed"], { cwd: dir });

      const head = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd: dir,
        encoding: "utf8",
      });
      expect(head.status).toBe(0);
      const expected = head.stdout.trim();

      const result = currentHead(dir);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect(result.sha).toBe(expected);
      expect(result.sha).toMatch(/^[0-9a-f]{40}$/);
    });
  });
});

describe("currentHead empty repo", () => {
  it("returns {ok:false, reason} naming 'no commits' when the repo has no commits yet", async () => {
    // S-1: opt out of the default baseline-commit seed so the test still
    // exercises the empty-repo branch.
    await withTempRepo(
      async ({ dir }) => {
        // Sanity: fresh withTempRepo has no HEAD.
        const before = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
          cwd: dir,
        });
        expect(before.status).not.toBe(0);

        const result = currentHead(dir);
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("unreachable");
        expect(result.reason.toLowerCase()).toContain("no commits");
      },
      { seedBaseline: false },
    );
  });
});
