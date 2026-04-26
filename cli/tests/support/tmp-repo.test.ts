import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { withTempRepo } from "./tmp-repo.js";

/**
 * S-006 AC-11 — withTempRepo must configure local-scope user.email and
 * user.name after `git init`. Without these, the real `git commit -m` invoked
 * by S-006 commit() would fail when the host machine has no global identity
 * (CI, fresh containers).
 */
describe("withTempRepo configures local git identity (AC-11)", () => {
  it("local user.email and user.name are set inside the temp repo", async () => {
    await withTempRepo(async ({ dir }) => {
      const email = spawnSync(
        "git",
        ["config", "--local", "--get", "user.email"],
        { cwd: dir, encoding: "utf8" },
      );
      expect(email.status).toBe(0);
      expect(email.stdout.trim().length).toBeGreaterThan(0);

      const name = spawnSync(
        "git",
        ["config", "--local", "--get", "user.name"],
        { cwd: dir, encoding: "utf8" },
      );
      expect(name.status).toBe(0);
      expect(name.stdout.trim().length).toBeGreaterThan(0);
    });
  });
});
