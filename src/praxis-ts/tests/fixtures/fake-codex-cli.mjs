#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const resumeCommand = args[0] === "resume";
const resumeSessionId = resumeCommand ? args[1] : null;
const outputPath = readFlagValue(args, "-o");
const sessionId = resumeSessionId ?? `fake_codex_session_${Date.now()}`;

process.stdout.write(`${JSON.stringify({
  event: "session.started",
  session_id: sessionId
})}\n`);

if (process.env.PRAXIS_FAKE_CODEX_WRITE_OUTPUT === "1" && outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, "{\n  \"ok\": true\n}\n", "utf8");
}

const delayMs = parseIntOrDefault(process.env.PRAXIS_FAKE_CODEX_DELAY_MS, 5);
await sleep(delayMs);
process.exit(0);

function readFlagValue(source, flag) {
  const index = source.indexOf(flag);
  if (index === -1 || index + 1 >= source.length) {
    return null;
  }
  return source[index + 1];
}

function parseIntOrDefault(raw, fallback) {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
