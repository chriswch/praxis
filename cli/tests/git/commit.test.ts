import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commit } from "../../src/git/commit.js";
import { withTempRepo } from "../support/tmp-repo.js";

/**
 * S-006 — direct unit tests for the commit() seam.
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
        captured.push(
          typeof chunk === "string"
            ? chunk
            : Buffer.from(chunk).toString("utf8"),
        );
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

describe("commit() bundles pre-existing dirty files when called on a dirty tree (AC-10)", () => {
  it("git add -A captures untracked + modified files alongside the run's own changes — both files appear in the resulting commit", async () => {
    await withTempRepo(async ({ dir }) => {
      // Baseline so HEAD exists; tracked.txt becomes the modified file.
      writeFileSync(join(dir, "tracked.txt"), "v1\n", "utf8");
      spawnSync("git", ["add", "tracked.txt"], { cwd: dir });
      spawnSync("git", ["commit", "-m", "baseline"], { cwd: dir });

      // The "pre-existing dirty" the user opted into bundling.
      writeFileSync(
        join(dir, "tracked.txt"),
        "v2 — pre-existing dirty\n",
        "utf8",
      );
      writeFileSync(join(dir, "untracked.txt"), "stranded\n", "utf8");
      // The "run's own change" (simulating an implement-stage edit).
      writeFileSync(join(dir, "from-run.txt"), "produced by the run\n", "utf8");

      const result = commit(dir, "feat: bundled commit");
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      if (!("sha" in result)) throw new Error("expected sha");

      // git show --name-only on the new commit lists every file the commit
      // touched (whether modified or added).
      const show = spawnSync(
        "git",
        ["show", "--name-only", "--pretty=format:", "HEAD"],
        { cwd: dir, encoding: "utf8" },
      );
      expect(show.status).toBe(0);
      const files = show.stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      expect(files.sort()).toEqual(
        ["from-run.txt", "tracked.txt", "untracked.txt"].sort(),
      );

      // Tree is clean after the bundled commit.
      const status = spawnSync("git", ["status", "--porcelain"], {
        cwd: dir,
        encoding: "utf8",
      });
      expect(status.stdout.trim()).toBe("");
    });
  });
});

describe("commit() empty tree (AC-2)", () => {
  it("returns {ok:true, skipped:true} and creates no commit when nothing is staged or modified", async () => {
    await withTempRepo(async ({ dir }) => {
      // Sanity: fresh withTempRepo has no HEAD yet.
      const before = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
        cwd: dir,
      });
      expect(before.status).not.toBe(0);

      const result = commit(dir, "feat: nothing");

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect("skipped" in result && result.skipped === true).toBe(true);
      expect("sha" in result).toBe(false);

      // No HEAD created — commit was skipped.
      const after = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
        cwd: dir,
      });
      expect(after.status).not.toBe(0);
    });
  });
});

describe("commit() preserves multi-line Conventional-Commits bodies (L-1)", () => {
  it("subject + blank line + multi-paragraph body round-trip verbatim through git log -1 --pretty=%B", async () => {
    await withTempRepo(async ({ dir }) => {
      writeFileSync(join(dir, "feature.txt"), "feature\n", "utf8");

      const message = [
        "feat: add multi-paragraph body",
        "",
        "First paragraph explains why this change is needed and what",
        "problem it solves for the caller.",
        "",
        "Second paragraph notes a follow-up the reviewer should know",
        "about before approving.",
      ].join("\n");

      const result = commit(dir, message);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      if (!("sha" in result)) throw new Error("expected sha on result");

      // %B is the raw commit message body (subject + body, no trailers
      // mangling). git appends trailing newlines after the body; strip them
      // for the verbatim comparison so the load-bearing assertion is on the
      // multi-paragraph content, not git's terminator policy.
      const body = spawnSync("git", ["log", "-1", "--pretty=%B"], {
        cwd: dir,
        encoding: "utf8",
      });
      expect(body.status).toBe(0);
      expect(body.stdout.replace(/\n+$/, "")).toBe(message);
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
