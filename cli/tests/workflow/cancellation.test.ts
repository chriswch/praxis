import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PraxisConfig, StageConfig } from "../../src/config/schema.js";
import { LineReporter } from "../../src/ui/line-reporter.js";
import { runWorkflow } from "../../src/workflow/runner.js";
import type { StageContext } from "../../src/workflow/stage.js";
import { runStage } from "../../src/workflow/stage.js";
import { hangingQuery } from "../support/scripted-query.js";
import { withTempRepo } from "../support/tmp-repo.js";

function withTmpDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "praxis-cancel-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const noValidateConfig: StageConfig = {
  id: "hang",
  systemPrompt: { file: "clarify-assess.md" },
  userPromptTemplate: "{{intent}}",
  outputArtifact: "hang.md",
  // 50 ms — short enough to exercise the timer in unit-test budget.
  timeoutMs: 50,
};

function makeCtx(runDir: string, signal: AbortSignal): StageContext {
  return {
    intent: "x",
    runDir,
    runId: "test-run",
    reporter: new LineReporter(),
    signal,
    artifactPaths: {},
  };
}

describe("runStage timeoutMs", () => {
  it("aborts with cancelReason 'timeout' when the stage exceeds timeoutMs", async () => {
    await withTmpDir(async (runDir) => {
      const ctl = new AbortController(); // never aborted by us
      const result = await runStage(
        noValidateConfig,
        makeCtx(runDir, ctl.signal),
        {
          createQueryFn: hangingQuery("sess_timeout"),
          reporter: new LineReporter(),
        },
      );
      expect(result.cancelReason).toBe("timeout");
      expect(result.sessionId).toBe("sess_timeout");
    });
  });
});

describe("runStage SIGINT propagation", () => {
  it("parent abort signal yields cancelReason 'sigint'", async () => {
    await withTmpDir(async (runDir) => {
      const ctl = new AbortController();
      // Schedule the abort just after runStage starts spinning.
      setTimeout(() => ctl.abort(), 20);
      const stage: StageConfig = {
        ...noValidateConfig,
        timeoutMs: undefined, // no timeout — only SIGINT can stop us
      };
      const result = await runStage(stage, makeCtx(runDir, ctl.signal), {
        createQueryFn: hangingQuery("sess_sigint"),
        reporter: new LineReporter(),
      });
      expect(result.cancelReason).toBe("sigint");
    });
  });
});

describe("runWorkflow SIGINT (cancelled status)", () => {
  it("an external abort during a stage marks it cancelled and returns ok:false", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const cfg: PraxisConfig = {
        version: 1,
        workflow: [
          {
            id: "hang",
            systemPrompt: { file: "clarify-assess.md" },
            userPromptTemplate: "{{intent}}",
            outputArtifact: "hang.md",
            // No timeout — only the injected signal can end the stage.
          },
        ],
      };
      const ctl = new AbortController();
      setTimeout(() => ctl.abort(), 20);
      const result = await runWorkflow(
        {
          intent: "x",
          cwd,
          allowDirty: true,
          config: cfg,
          signal: ctl.signal,
        },
        {
          clock: () => new Date("2026-04-25T14:30:12Z"),
          rng: (n) => new Uint8Array([0x7a, 0xf2]).slice(0, n),
          createQueryFn: hangingQuery("sess_sigint_runner"),
          reporter: new LineReporter(),
        },
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.status).toBe("cancelled");
      expect(result.failedStageId).toBe("hang");

      const state = JSON.parse(
        readFileSync(join(result.runDir!, "state.json"), "utf8"),
      );
      expect(state.stages.hang.status).toBe("cancelled");
    });
  });
});
