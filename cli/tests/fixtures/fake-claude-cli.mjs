#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write("fake-claude 0.0.1\n");
  process.exit(0);
}

const resumeSessionId = readFlagValue(args, "--resume");
const sessionId = readFlagValue(args, "--session-id");

if (resumeSessionId && process.env.PRAXIS_FAKE_CLAUDE_RESUME_FAIL === "1") {
  process.stderr.write(
    `fake-claude: no session found for ${resumeSessionId}\n`,
  );
  process.exit(2);
}

const prompt = args[args.length - 1] ?? "";
const stageResultMatch = /Stage result: (\S+)/.exec(prompt);
const stageResultPath = stageResultMatch ? stageResultMatch[1] : null;

if (
  process.env.PRAXIS_FAKE_CLAUDE_WRITE_OUTPUT === "1" &&
  stageResultPath
) {
  await mkdir(dirname(stageResultPath), { recursive: true });
  const payload = {
    ok: true,
    session_id: resumeSessionId ?? sessionId ?? null,
  };
  await writeFile(stageResultPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

const delayMs = parseIntOrDefault(process.env.PRAXIS_FAKE_CLAUDE_DELAY_MS, 5);
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
