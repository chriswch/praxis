import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  dispatchOutputRelativePath,
  parseDispatchOutput,
} from "../../../src/runtime/dispatch/output-parser.js";

interface Findings {
  findings: string[];
}

function assertFindings(value: unknown): asserts value is Findings {
  if (!value || typeof value !== "object") throw new Error("not an object");
  const candidate = value as { findings?: unknown };
  if (!Array.isArray(candidate.findings)) throw new Error("findings must be an array");
}

void test("dispatchOutputRelativePath uses the .praxis/dispatch/<stage>/output.json convention", () => {
  assert.equal(
    dispatchOutputRelativePath("assessing-gaps"),
    join(".praxis", "dispatch", "assessing-gaps", "output.json"),
  );
});

void test("parseDispatchOutput returns typed data on happy path", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "praxis-dispatch-out-"));
  try {
    const stageDir = join(repoRoot, ".praxis", "dispatch", "assessing-gaps");
    await mkdir(stageDir, { recursive: true });
    await writeFile(
      join(stageDir, "output.json"),
      JSON.stringify({ findings: ["g-10", "g-11"] }),
      "utf8",
    );
    const result = await parseDispatchOutput(repoRoot, "assessing-gaps", assertFindings);
    if (!result.ok) {
      assert.fail(`expected ok result, got error: ${result.reason}`);
    }
    assert.deepEqual(result.data.findings, ["g-10", "g-11"]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

void test("parseDispatchOutput returns a parse error for a missing file", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "praxis-dispatch-out-"));
  try {
    const result = await parseDispatchOutput(repoRoot, "assessing-gaps", assertFindings);
    if (result.ok) {
      assert.fail("expected a parse error for a missing file");
    }
    assert.ok(result.reason.includes("Failed to read"));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

void test("parseDispatchOutput returns a validation error when the validator throws", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "praxis-dispatch-out-"));
  try {
    const stageDir = join(repoRoot, ".praxis", "dispatch", "assessing-gaps");
    await mkdir(stageDir, { recursive: true });
    await writeFile(join(stageDir, "output.json"), JSON.stringify({ nothing: true }), "utf8");
    const result = await parseDispatchOutput(repoRoot, "assessing-gaps", assertFindings);
    if (result.ok) {
      assert.fail("expected a validation error");
    }
    assert.ok(result.reason.includes("failed validation"));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
