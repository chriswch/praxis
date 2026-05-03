import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PraxisConfig } from "../../src/config/schema.js";
import { LineReporter } from "../../src/ui/line-reporter.js";
import {
  appendPraxisToGitignore,
  runPreflight,
} from "../../src/workflow/preflight.js";
import { runWorkflow } from "../../src/workflow/runner.js";
import type {
  CreateQueryFn,
  Deps,
  SdkMessage,
} from "../../src/workflow/stage.js";
import { scriptedQuery } from "../support/scripted-query.js";
import { withTempRepo } from "../support/tmp-repo.js";

const noopMessages: SdkMessage[] = [
  {
    type: "system",
    subtype: "init",
    session_id: "sess_noop",
    model: "claude-opus-4-7",
  },
  {
    type: "assistant",
    session_id: "sess_noop",
    message: { content: [{ type: "text", text: "ok" }] },
  },
  {
    type: "result",
    subtype: "success",
    stop_reason: "end_turn",
    total_cost_usd: 0,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    num_turns: 1,
    session_id: "sess_noop",
  },
];

/**
 * Single-stage workflow used by the bootstrap-shape tests so we can assert on
 * run-id / state.json / 00-intent.txt without dragging in the full default
 * 3-stage validator and pause semantics. The stage pauses immediately so the
 * runner returns after one scripted turn.
 */
const oneStageConfig: PraxisConfig = {
  version: 1,
  workflow: [
    {
      id: "noop",
      systemPrompt: { file: "clarify-assess.md" },
      userPromptTemplate: "{{intent}}",
      outputArtifact: "noop.md",
      pauseAfter: true,
    },
  ],
};

function pinnedDeps(
  date: Date,
  bytes: Uint8Array,
  createQueryFn: CreateQueryFn,
): Deps {
  return {
    clock: () => date,
    rng: (n) => bytes.slice(0, n),
    createQueryFn,
    reporter: new LineReporter(),
    // S-005: bootstrap-shape tests pause on the only stage; commit unused.
    commit: () => ({ ok: true, skipped: true }),
    runPreflight,
    appendPraxisToGitignore,
  };
}

describe("runWorkflow bootstrap shape", () => {
  it("derives the spec's sample run-id and exact startedAt from pinned deps", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const result = await runWorkflow(
        { intent: "ship it", cwd, allowDirty: true, config: oneStageConfig },
        pinnedDeps(
          new Date("2026-04-25T14:30:12Z"),
          new Uint8Array([0x7a, 0xf2]),
          scriptedQuery([{ messages: noopMessages }]),
        ),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
      expect(result.runId).toBe("2026-04-25-1430-7af2");
      expect(result.runDir).toBe(
        join(cwd, ".praxis", "runs", "2026-04-25-1430-7af2"),
      );

      const state = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(state.runId).toBe("2026-04-25-1430-7af2");
      expect(state.intent).toBe("ship it");
      expect(state.startedAt).toBe("2026-04-25T14:30:12Z");
    });
  });

  it("writes 00-intent.txt verbatim with no trailing newline", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const intent = "add a logout button";
      const result = await runWorkflow(
        { intent, cwd, allowDirty: true, config: oneStageConfig },
        pinnedDeps(
          new Date("2026-04-25T14:30:12Z"),
          new Uint8Array([0x01, 0x02]),
          scriptedQuery([{ messages: noopMessages }]),
        ),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);

      const path = join(result.runDir, "00-intent.txt");
      expect(existsSync(path)).toBe(true);
      const raw = readFileSync(path);
      expect(raw.toString("utf8")).toBe(intent);
      expect(raw[raw.length - 1]).not.toBe(0x0a);
    });
  });

  it("truncates sub-second precision in startedAt", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      const result = await runWorkflow(
        {
          intent: "x",
          cwd,
          allowDirty: true,
          config: oneStageConfig,
        },
        pinnedDeps(
          new Date("2026-04-25T14:30:12.789Z"),
          new Uint8Array([0xaa, 0xbb]),
          scriptedQuery([{ messages: noopMessages }]),
        ),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
      const state = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(state.startedAt).toBe("2026-04-25T14:30:12Z");
    });
  });
});

describe("runWorkflow baselineSha capture (AC-3)", () => {
  it("stamps state.baselineSha with git rev-parse HEAD from the cwd", async () => {
    await withTempRepo(async ({ dir: cwd }) => {
      // The default-seeded baseline commit IS the HEAD we expect to capture.
      const head = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd,
        encoding: "utf8",
      });
      expect(head.status).toBe(0);
      const baseline = head.stdout.trim();

      const result = await runWorkflow(
        { intent: "ship it", cwd, allowDirty: true, config: oneStageConfig },
        pinnedDeps(
          new Date("2026-04-25T14:30:12Z"),
          new Uint8Array([0x7a, 0xf2]),
          scriptedQuery([{ messages: noopMessages }]),
        ),
      );
      if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
      const state = JSON.parse(
        readFileSync(join(result.runDir, "state.json"), "utf8"),
      );
      expect(state.baselineSha).toBe(baseline);
      expect(state.baselineSha).toMatch(/^[0-9a-f]{40}$/);
    });
  });
});

describe("runWorkflow empty repo (AC-4)", () => {
  it("returns {ok:false} with reason naming 'no commits' and remediation hinting 'git commit --allow-empty'; no run-dir created", async () => {
    // S-1: opt out of the default baseline-commit seed so we exercise the
    // empty-repo branch.
    await withTempRepo(
      async ({ dir: cwd }) => {
        const result = await runWorkflow(
          { intent: "ship it", cwd, allowDirty: true, config: oneStageConfig },
          pinnedDeps(
            new Date("2026-04-25T14:30:12Z"),
            new Uint8Array([0x7a, 0xf2]),
            scriptedQuery([{ messages: noopMessages }]),
          ),
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("unreachable");
        expect(result.reason.toLowerCase()).toContain("no commits");
        expect((result.remediation ?? "").toLowerCase()).toContain(
          "git commit --allow-empty",
        );
        // No run dir — `.praxis/runs/` should not exist on disk.
        expect(existsSync(join(cwd, ".praxis", "runs"))).toBe(false);
      },
      { seedBaseline: false },
    );
  });
});
