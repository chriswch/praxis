import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

describe("commit() emits no stderr notice on the happy path (AC-12)", () => {
  it("does not write the S-005 'not yet wired' notice to stderr after the real implementation lands", async () => {
    await withTempRepo(async ({ dir }) => {
      writeFileSync(join(dir, "x.txt"), "x\n", "utf8");

      const original = process.stderr.write.bind(process.stderr);
      const captured: string[] = [];
      process.stderr.write = ((chunk: string | Uint8Array) => {
        captured.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
        return true;
      }) as typeof process.stderr.write;
      try {
        commit(dir, "feat: x");
      } finally {
        process.stderr.write = original;
      }
      // The S-005 stub printed exactly one line containing "not yet wired" —
      // the post-S-006 implementation must be silent on stderr in the happy
      // path. (Real git invocations capture their own stderr via spawnSync;
      // they do not bleed onto the parent fd.)
      const joined = captured.join("");
      expect(joined).not.toContain("not yet wired");
      expect(joined).not.toContain("auto-commit message ready");
    });
  });
});

describe("commit() failure (AC-3)", () => {
  it("returns {ok:false, reason} carrying git's stderr when invoked outside a work tree", () => {
    const dir = mkdtempSync(join(tmpdir(), "praxis-commit-fail-"));
    try {
      const result = commit(dir, "feat: nope");
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.reason.length).toBeGreaterThan(0);
      // git emits "not a git repository" (or similar phrasing) — assert the
      // signal, not exact wording, since git versions vary.
      expect(result.reason.toLowerCase()).toContain("not a git repository");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("commit() empty tree (AC-2)", () => {
  it("returns {ok:true, skipped:true} and creates no commit when nothing is staged or modified", async () => {
    await withTempRepo(async ({ dir }) => {
      // Sanity: fresh withTempRepo has no HEAD yet.
      const before = spawnSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: dir });
      expect(before.status).not.toBe(0);

      const result = commit(dir, "feat: nothing");

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect("skipped" in result && result.skipped === true).toBe(true);
      expect("sha" in result).toBe(false);

      // No HEAD created — commit was skipped.
      const after = spawnSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: dir });
      expect(after.status).not.toBe(0);
    });
  });
});

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
