import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  runContinueCommand,
  runRunCommand,
  runSubmitStageResultCommand
} from "../../src/cli/commands/index.js";
import type { RunRecord, StoryLedgerRecord } from "../../src/contracts/model.js";
import { createTempRepo, readJson, writeStageResult } from "./helpers.js";

test("smoke: multi-slice forge checkpoints boundary and carries handoff", async () => {
  const repoRoot = await createTempRepo();

  assert.equal(
    await runRunCommand(repoRoot, true, {
      workflow: "forge",
      adapter: "codex",
      executionMode: "autopilot",
      entryTask: "Multi-slice progression"
    }),
    0
  );

  const rootClarifyPath = await writeStageResult(
    repoRoot,
    "clarifying-intent",
    ".praxis",
    "feature_brief_ready",
    "proceed",
    { needs_confirmation: true }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, rootClarifyPath), 0);
  assert.equal(await runContinueCommand(repoRoot, true), 0);

  await writeFile(
    join(repoRoot, ".praxis", "slice-map.json"),
    JSON.stringify(
      {
        slices: [
          { id: "S-001", title: "First" },
          { id: "S-002", title: "Second" }
        ]
      },
      null,
      2
    )
  );

  const slicingPath = await writeStageResult(
    repoRoot,
    "slicing-stories",
    ".praxis",
    "slice_map_ready",
    "proceed"
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, slicingPath), 0);

  const sliceClarifyPath = await writeStageResult(
    repoRoot,
    "clarifying-intent",
    ".praxis/slices/S-001",
    "story_spec_ready",
    "proceed",
    { needs_confirmation: true }
  );
  assert.equal(await runSubmitStageResultCommand(repoRoot, true, sliceClarifyPath), 0);
  assert.equal(await runContinueCommand(repoRoot, true), 0);

  assert.equal(
    await runSubmitStageResultCommand(
      repoRoot,
      true,
      await writeStageResult(
        repoRoot,
        "sketching-design",
        ".praxis/slices/S-001",
        "sketch_skipped",
        "proceed"
      )
    ),
    0
  );

  assert.equal(
    await runSubmitStageResultCommand(
      repoRoot,
      true,
      await writeStageResult(
        repoRoot,
        "rapid-implementing",
        ".praxis/slices/S-001",
        "implementation_complete",
        "proceed"
      )
    ),
    0
  );

  assert.equal(
    await runSubmitStageResultCommand(
      repoRoot,
      true,
      await writeStageResult(repoRoot, "code-reviewing", ".praxis/slices/S-001", "review_ready", "proceed")
    ),
    0
  );

  assert.equal(
    await runSubmitStageResultCommand(
      repoRoot,
      true,
      await writeStageResult(
        repoRoot,
        "code-improving",
        ".praxis/slices/S-001",
        "improvement_ready",
        "proceed"
      )
    ),
    0
  );

  const run = await readJson<RunRecord>(join(repoRoot, ".praxis", "run.json"));
  const ledger = await readJson<StoryLedgerRecord>(join(repoRoot, ".praxis", "story-ledger.json"));

  assert.equal(run.mode, "multi_slice");
  assert.equal(run.current.slice_id, "S-002");
  assert.equal(run.current.stage, "clarifying-intent");
  assert.equal(run.routing.next_action, "run_stage");
  assert.equal(ledger.stories.last_completed, "S-001");
  assert.equal(ledger.stories.active, "S-002");

  const handoffPath = join(repoRoot, ".praxis", "slices", "S-001", "handoff.json");
  assert.equal(existsSync(handoffPath), true);
});
