import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";

import { ClaudeAdapter } from "../../../src/runtime/adapters/claude-adapter.js";
import { getAdapter, getAllAdapters } from "../../../src/runtime/adapters/index.js";

const fakeClaudePath = resolve(process.cwd(), "tests", "fixtures", "fake-claude-cli.mjs");

async function withClaudeBin<T>(
  value: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = process.env.PRAXIS_CLAUDE_BIN;
  if (value === null) {
    delete process.env.PRAXIS_CLAUDE_BIN;
  } else {
    process.env.PRAXIS_CLAUDE_BIN = value;
  }
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.PRAXIS_CLAUDE_BIN;
    } else {
      process.env.PRAXIS_CLAUDE_BIN = previous;
    }
  }
}

void test("ClaudeAdapter.health reports healthy when the CLI is available", async () => {
  await withClaudeBin(fakeClaudePath, async () => {
    const adapter = new ClaudeAdapter();
    const health = await adapter.health();
    assert.equal(health.adapter, "claude");
    assert.equal(health.healthy, true);
    assert.equal(health.supports_resume, true);
    assert.ok(health.binary);
    assert.ok(health.version);
  });
});

void test("ClaudeAdapter.health reports unhealthy when the CLI binary is missing", async () => {
  await withClaudeBin("/nonexistent/path/to/claude-binary-xyz", async () => {
    const adapter = new ClaudeAdapter();
    const health = await adapter.health();
    assert.equal(health.adapter, "claude");
    assert.equal(health.healthy, false);
    assert.equal(health.supports_resume, true);
    assert.equal(health.binary, null);
    assert.equal(health.version, null);
  });
});

void test("ClaudeAdapter.cancel reports cancelled:false when no locator is supplied", async () => {
  const adapter = new ClaudeAdapter();
  const result = await adapter.cancel({ session_id: "some-session", locator: null });
  assert.equal(result.cancelled, false);
  assert.match(result.reason, /locator/i);
});

void test("ClaudeAdapter.cancel reports cancelled:true for an opaque (non-pid) locator", async () => {
  const adapter = new ClaudeAdapter();
  const result = await adapter.cancel({
    session_id: "some-session",
    locator: "claude-session://abc123",
  });
  assert.equal(result.cancelled, true);
});

void test("ClaudeAdapter.cancel reports cancelled:true when the pid is already dead", async () => {
  const adapter = new ClaudeAdapter();
  // 0x7fffffff is a very high pid that is guaranteed not to exist on the test host.
  const result = await adapter.cancel({
    session_id: "some-session",
    locator: "worker-host://pid/2147483646",
  });
  assert.equal(result.cancelled, false);
  assert.match(result.reason, /failed|no such|esrch/i);
});

void test("getAdapter('claude') returns the ClaudeAdapter instance", () => {
  const adapter = getAdapter("claude");
  assert.equal(adapter.name, "claude");
  assert.ok(adapter instanceof ClaudeAdapter);
});

void test("getAdapter('codex') still returns the Codex adapter", () => {
  const codex = getAdapter("codex");
  assert.equal(codex.name, "codex");
});

void test("getAllAdapters exposes both adapters", () => {
  const adapters = getAllAdapters();
  const names = adapters.map((a) => a.name).sort();
  assert.deepEqual(names, ["claude", "codex"]);
});
