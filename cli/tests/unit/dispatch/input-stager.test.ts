import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  dispatchInputRelativePath,
  stageDispatchInput,
} from "../../../src/runtime/dispatch/input-stager.js";

void test("dispatchInputRelativePath uses the .praxis/dispatch/<stage>/input.json convention", () => {
  assert.equal(
    dispatchInputRelativePath("clarifying-intent"),
    join(".praxis", "dispatch", "clarifying-intent", "input.json"),
  );
});

void test("stageDispatchInput writes the envelope as pretty JSON and returns a relative path", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "praxis-dispatch-"));
  try {
    const envelope = { campaign_id: "c-1", profile: "fast" };
    const relPath = await stageDispatchInput(repoRoot, "clarifying-intent", envelope);
    assert.equal(
      relPath,
      join(".praxis", "dispatch", "clarifying-intent", "input.json"),
    );
    const written = await readFile(join(repoRoot, relPath), "utf8");
    const parsed = JSON.parse(written) as unknown;
    assert.deepEqual(parsed, envelope);
    // writeJsonFile adds a trailing newline.
    assert.ok(written.endsWith("\n"));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

void test("stageDispatchInput creates the stage directory if absent", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "praxis-dispatch-"));
  try {
    await stageDispatchInput(repoRoot, "assessing-gaps", { scope: ".praxis/" });
    const text = await readFile(
      join(repoRoot, ".praxis", "dispatch", "assessing-gaps", "input.json"),
      "utf8",
    );
    assert.ok(text.includes('"scope"'));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
