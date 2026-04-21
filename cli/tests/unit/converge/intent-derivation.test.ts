import test from "node:test";
import assert from "node:assert/strict";

import { extractEmbeddedSlashCommands } from "../../../src/runtime/converge/intent-derivation.js";

void test("extractEmbeddedSlashCommands supports punctuation in backtick slash commands", () => {
  const intent =
    "Analyze using `/how the current CLI system works. Also critique the system design, and fix the gaps and recommendations`.";
  assert.deepEqual(extractEmbeddedSlashCommands(intent), [
    "/how the current CLI system works. Also critique the system design, and fix the gaps and recommendations",
  ]);
});

void test("extractEmbeddedSlashCommands treats a leading slash command as shorthand", () => {
  const intent =
    "/how the current CLI system works. Also critique the system design, and fix the gaps and recommendations";
  assert.deepEqual(extractEmbeddedSlashCommands(intent), [
    "/how the current CLI system works. Also critique the system design, and fix the gaps and recommendations",
  ]);
});

void test("extractEmbeddedSlashCommands ignores non-command absolute paths", () => {
  const intent = "/Users/chris.wong/Documents/git-repository-personal/praxis/cli";
  assert.deepEqual(extractEmbeddedSlashCommands(intent), []);
});
