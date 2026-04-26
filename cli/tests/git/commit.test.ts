import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { commit } from "../../src/git/commit.js";
import { withTempRepo } from "../support/tmp-repo.js";

/**
 * S-006 — direct unit tests for the commit() seam (product.md §5.4).
 *
 * Real git, real fs (per cross-cutting policy), inside a withTempRepo. The
 * runner-level integration is exercised separately in implement.test.ts and
 * the e2e suites.
 */

describe("commit() happy path (AC-1)", () => {
  it("runs git add -A and git commit -m and returns {ok:true, sha} matching git rev-parse HEAD", async () => {
    await withTempRepo(async ({ dir }) => {
      // Stage a workdir change so the commit has something to record.
      writeFileSync(join(dir, "hello.txt"), "hi\n", "utf8");

      const result = commit(dir, "feat: hello");

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect("skipped" in result).toBe(false);
      if (!("sha" in result)) throw new Error("expected sha on result");
      expect(result.sha).toMatch(/^[0-9a-f]{40}$/);

      const head = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd: dir,
        encoding: "utf8",
      });
      expect(head.status).toBe(0);
      expect(head.stdout.trim()).toBe(result.sha);

      const subject = spawnSync("git", ["log", "-1", "--pretty=%s"], {
        cwd: dir,
        encoding: "utf8",
      });
      expect(subject.status).toBe(0);
      expect(subject.stdout.trim()).toBe("feat: hello");
    });
  });
});
