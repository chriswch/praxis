import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commit as productionCommit } from "../../src/git/commit.js";
import { LineReporter } from "../../src/ui/line-reporter.js";
import { advanceWorkflow, runWorkflow } from "../../src/workflow/runner.js";
import type {
  CreateQueryFn,
  Deps,
  SdkMessage,
} from "../../src/workflow/stage.js";
import type { State } from "../../src/workflow/state.js";
import { writeState } from "../../src/workflow/state.js";
import { recordingScriptedQuery } from "../support/scripted-query.js";
import { withTempRepo } from "../support/tmp-repo.js";

/**
 * S-006 AC-8 / AC-9 — end-to-end commit landing.
 *
 * Drives the workflow through `runWorkflow` (AC-8) and `advanceWorkflow`
 * (AC-9) with the production `commit` from `src/git/commit.ts` wired into
 * `Deps.commit`. The SDK is the only seam we stub — git, fs, and the auto-
 * commit hand-off are all real, so the assertions ride on `git rev-parse
 * HEAD` actually advancing.
 */

const VALID_CLARIFY = `## Intent\n\nadd a logout button.\n\n## Assumptions\n\n- auth ctx is present\n\n## Gaps\n\n- none\n\n## Plan\n\n1. wire — surfaces logout\n\n## Acceptance\n\n- posts /logout and redirects home\n`;

// S-002: stock review-stage finalText satisfying the `## Decision` validator.
const REVIEW_PROCEED = `# Review\n\nNo blocking issues.\n\n## Decision\n\nproceed\n`;
const IMPROVE_LOG = `## Improvement summary\n\n- no fixes needed\n`;

function stageMessages(sessionId: string, finalText: string): SdkMessage[] {
  return [
    {
      type: "system",
      subtype: "init",
      session_id: sessionId,
      model: "claude-test",
    },
    {
      type: "assistant",
      session_id: sessionId,
      message: { content: [{ type: "text", text: finalText }] },
    },
    {
      type: "result",
      subtype: "success",
      stop_reason: "end_turn",
      total_cost_usd: 0.001,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      num_turns: 1,
      session_id: sessionId,
    },
  ];
}

/**
 * Implement-stage script that ALSO writes a real file inside the repo via the
 * test's filesystem before yielding the assistant text. This simulates the
 * SDK's tool side-effects so the working tree is actually dirty by the time
 * auto-commit runs — the production commit() then has something to capture.
 */
function implementWithSideEffect(
  cwd: string,
  filename: string,
  contents: string,
  sessionId = "sess_impl",
): CreateQueryFn {
  let invoked = false;
  return (_input) => {
    return {
      pushUserMessage() {},
      stream: (async function* () {
        if (!invoked) {
          invoked = true;
          // Write the side-effect file before yielding the result so the
          // dirty state is observable when auto-commit pre-checks.
          writeFileSync(join(cwd, filename), contents, "utf8");
        }
        for (const m of stageMessages(
          sessionId,
          "## Files changed\n\n- src/Foo.tsx\n",
        )) {
          yield m;
        }
      })(),
    };
  };
}

function buildDeps(createQueryFn: CreateQueryFn): Deps {
  return {
    clock: () => new Date("2026-04-25T14:35:00Z"),
    rng: (n) => new Uint8Array([0x7a, 0xf2]).slice(0, n),
    createQueryFn,
    reporter: new LineReporter(),
    commit: productionCommit,
  };
}

describe("praxis run --no-pause lands one real commit (AC-8)", () => {
  it("workflow drives clarify-assess → implement (with file side-effect) → auto-commit; HEAD advances by exactly one commit and the SHA matches state.commitSha", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Pre-commit a baseline so HEAD exists; lets us assert HEAD ADVANCES by
      // one (rather than gets created from nothing).
      writeFileSync(join(cwd, "README.md"), "baseline\n", "utf8");
      spawnSync("git", ["add", "README.md"], { cwd });
      spawnSync("git", ["commit", "-m", "baseline"], { cwd });
      const baselineSha = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd,
        encoding: "utf8",
      }).stdout.trim();

      // Compose: clarify-assess (scripted), implement (side-effect + scripted),
      // auto-commit (scripted message). Three SDK calls total.
      let call = 0;
      const clarifyRecorder = recordingScriptedQuery([
        [{ messages: stageMessages("sess_clarify", VALID_CLARIFY) }],
      ]);
      const implementRecorder = implementWithSideEffect(
        cwd,
        "src/Foo.tsx",
        "export function Logout() { return null; }\n",
      );
      const reviewRecorder = recordingScriptedQuery([
        [{ messages: stageMessages("sess_review", REVIEW_PROCEED) }],
      ]);
      const improveRecorder = recordingScriptedQuery([
        [{ messages: stageMessages("sess_improve", IMPROVE_LOG) }],
      ]);
      const commitRecorder = recordingScriptedQuery([
        [{ messages: stageMessages("sess_commit", "feat: add logout button") }],
      ]);
      // S-002 5-stage shape: clarify-assess → implement → code-reviewing →
      // code-improving → auto-commit.
      const composedCreateQueryFn: CreateQueryFn = (input) => {
        call++;
        if (call === 1) return clarifyRecorder(input);
        if (call === 2) {
          // The implement stage will write src/Foo.tsx — need its parent dir.
          mkdirSync(join(cwd, "src"), { recursive: true });
          return implementRecorder(input);
        }
        if (call === 3) return reviewRecorder(input);
        if (call === 4) return improveRecorder(input);
        if (call === 5) return commitRecorder(input);
        throw new Error("unexpected SDK call beyond 5");
      };

      const result = await runWorkflow(
        { intent: "add a logout button", cwd, noPause: true },
        buildDeps(composedCreateQueryFn),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      // HEAD advanced by exactly one commit.
      const newHead = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd,
        encoding: "utf8",
      }).stdout.trim();
      expect(newHead).not.toBe(baselineSha);
      const parent = spawnSync("git", ["rev-parse", "HEAD~1"], {
        cwd,
        encoding: "utf8",
      }).stdout.trim();
      expect(parent).toBe(baselineSha);

      // Commit subject matches the agent's auto-commit finalText.
      const subject = spawnSync("git", ["log", "-1", "--pretty=%s"], {
        cwd,
        encoding: "utf8",
      }).stdout.trim();
      expect(subject).toBe("feat: add logout button");

      // state.json's commitSha matches the new HEAD.
      const persisted = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages["auto-commit"].commitSha).toBe(newHead);

      // 05-commit.txt is the SHA-prefixed form.
      const commitArtifact = readFileSync(
        join(result.runDir, "05-commit.txt"),
        "utf8",
      );
      expect(commitArtifact).toBe(`${newHead}\n\nfeat: add logout button\n`);
    });
  });
});

describe("praxis advance lands one real commit (AC-9)", () => {
  it("from a paused-after-clarify run dir, advance drives implement (with side-effect) → auto-commit and HEAD advances by exactly one commit", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // Baseline commit so HEAD exists pre-advance.
      writeFileSync(join(cwd, "README.md"), "baseline\n", "utf8");
      spawnSync("git", ["add", "README.md"], { cwd });
      spawnSync("git", ["commit", "-m", "baseline"], { cwd });
      const baselineSha = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd,
        encoding: "utf8",
      }).stdout.trim();

      // Seed a paused-after-clarify-assess run.
      const RUN_ID = "2026-04-25-1430-7af2";
      const runDir = join(cwd, ".praxis", "runs", RUN_ID);
      mkdirSync(runDir, { recursive: true });
      const seeded: State = {
        runId: RUN_ID,
        intent: "add a logout button",
        startedAt: "2026-04-25T14:30:12Z",
        baselineSha: "0123456789abcdef0123456789abcdef01234567",
        currentStage: "implement",
        cost: { totalTokens: 150, totalUsd: 0.012 },
        stages: {
          "clarify-assess": {
            status: "completed",
            sessionId: "sess_clarify",
            stopReason: "end_turn",
            endedAt: "2026-04-25T14:31:00Z",
            tokens: { input: 100, output: 50, cacheRead: 0, cacheCreate: 0 },
            usd: 0.012,
          },
          implement: { status: "pending" },
          "auto-commit": { status: "pending" },
        },
      };
      writeState(runDir, seeded);
      writeFileSync(
        join(runDir, "01-clarify-assess.md"),
        VALID_CLARIFY,
        "utf8",
      );

      // S-002 5-stage shape: advance from paused-after-clarify scripts
      // implement → code-reviewing → code-improving → auto-commit.
      let call = 0;
      const implementRecorder = implementWithSideEffect(
        cwd,
        "src/Bar.tsx",
        "export function Logout2() { return null; }\n",
      );
      const reviewRecorder = recordingScriptedQuery([
        [{ messages: stageMessages("sess_review", REVIEW_PROCEED) }],
      ]);
      const improveRecorder = recordingScriptedQuery([
        [{ messages: stageMessages("sess_improve", IMPROVE_LOG) }],
      ]);
      const commitRecorder = recordingScriptedQuery([
        [{ messages: stageMessages("sess_commit", "feat: bar") }],
      ]);
      const composedCreateQueryFn: CreateQueryFn = (input) => {
        call++;
        if (call === 1) {
          mkdirSync(join(cwd, "src"), { recursive: true });
          return implementRecorder(input);
        }
        if (call === 2) return reviewRecorder(input);
        if (call === 3) return improveRecorder(input);
        if (call === 4) return commitRecorder(input);
        throw new Error("unexpected SDK call beyond 4");
      };

      const result = await advanceWorkflow(
        RUN_ID,
        { cwd },
        buildDeps(composedCreateQueryFn),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      const newHead = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd,
        encoding: "utf8",
      }).stdout.trim();
      expect(newHead).not.toBe(baselineSha);
      const parent = spawnSync("git", ["rev-parse", "HEAD~1"], {
        cwd,
        encoding: "utf8",
      }).stdout.trim();
      expect(parent).toBe(baselineSha);

      const subject = spawnSync("git", ["log", "-1", "--pretty=%s"], {
        cwd,
        encoding: "utf8",
      }).stdout.trim();
      expect(subject).toBe("feat: bar");

      const persisted = JSON.parse(
        readFileSync(join(runDir, "state.json"), "utf8"),
      );
      expect(persisted.stages["auto-commit"].commitSha).toBe(newHead);
    });
  });
});
