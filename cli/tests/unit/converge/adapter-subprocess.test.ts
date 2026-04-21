import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { runAdapterSubprocess } from "../../../src/runtime/converge/executors/adapter-subprocess.js";

const captureCodexCliPath = resolve(process.cwd(), "tests", "fixtures", "capture-codex-cli.mjs");

async function withEnv<T>(
  vars: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

void test("runAdapterSubprocess codex invocation uses non-interactive safe defaults", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "praxis-codex-subprocess-"));
  const argvPath = join(repoRoot, "argv.json");

  const result = await withEnv(
    {
      PRAXIS_CODEX_BIN: captureCodexCliPath,
      PRAXIS_TEST_ARGV_PATH: argvPath,
      PRAXIS_CODEX_SANDBOX: undefined,
    },
    async () =>
      runAdapterSubprocess({
        adapter: "codex",
        prompt: "/how architecture",
        repoRoot,
      }),
  );

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /captured/);

  const argv = JSON.parse(await readFile(argvPath, "utf8")) as string[];
  assert.deepEqual(argv, [
    "-a",
    "never",
    "-m",
    "gpt-5.3-codex",
    "-c",
    'model_reasoning_effort="high"',
    "exec",
    "-C",
    repoRoot,
    "-s",
    "workspace-write",
    "/how architecture",
  ]);
});

void test("runAdapterSubprocess codex invocation honors PRAXIS_CODEX_SANDBOX override", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "praxis-codex-subprocess-"));
  const argvPath = join(repoRoot, "argv.json");

  await withEnv(
    {
      PRAXIS_CODEX_BIN: captureCodexCliPath,
      PRAXIS_TEST_ARGV_PATH: argvPath,
      PRAXIS_CODEX_SANDBOX: "danger-full-access",
    },
    async () =>
      runAdapterSubprocess({
        adapter: "codex",
        prompt: "Assess the gap",
        repoRoot,
      }),
  );

  const argv = JSON.parse(await readFile(argvPath, "utf8")) as string[];
  const sandboxFlagIndex = argv.indexOf("-s");
  assert.equal(sandboxFlagIndex >= 0, true);
  assert.equal(argv[sandboxFlagIndex + 1], "danger-full-access");
});

void test("runAdapterSubprocess codex invocation honors model and reasoning overrides", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "praxis-codex-subprocess-"));
  const argvPath = join(repoRoot, "argv.json");

  await withEnv(
    {
      PRAXIS_CODEX_BIN: captureCodexCliPath,
      PRAXIS_TEST_ARGV_PATH: argvPath,
      PRAXIS_CODEX_MODEL: "gpt-5.4",
      PRAXIS_CODEX_REASONING_EFFORT: "medium",
    },
    async () =>
      runAdapterSubprocess({
        adapter: "codex",
        prompt: "Assess the gap",
        repoRoot,
      }),
  );

  const argv = JSON.parse(await readFile(argvPath, "utf8")) as string[];
  assert.equal(argv[argv.indexOf("-m") + 1], "gpt-5.4");
  assert.equal(argv[argv.indexOf("-c") + 1], 'model_reasoning_effort="medium"');
});
