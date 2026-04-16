import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { StageName, StageResultRecord } from "../../src/contracts/model.js";

const fakeCodexPath = resolve(process.cwd(), "tests", "fixtures", "fake-codex-cli.mjs");
process.env.PRAXIS_CODEX_BIN = process.env.PRAXIS_CODEX_BIN ?? fakeCodexPath;

export async function createTempRepo(): Promise<string> {
  return mkdtemp(join(tmpdir(), "praxis-ts-smoke-"));
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function writeStageResult(
  repoRoot: string,
  stage: StageName,
  artifactDir: string,
  outcomeCode: string,
  routeKind: StageResultRecord["route"]["kind"],
  overrides: Partial<StageResultRecord> = {}
): Promise<string> {
  const relativePath = `${artifactDir}/results/${stage}.json`;
  const fullPath = join(repoRoot, relativePath);
  await mkdir(join(repoRoot, artifactDir, "results"), { recursive: true });

  const base: StageResultRecord = {
    version: 3,
    run_id: null,
    dispatch_id: "dispatch_test",
    stage,
    artifact_dir: artifactDir,
    status: "completed",
    summary_path: `${artifactDir}/${stage}.md`,
    artifacts_written: [`${artifactDir}/${stage}.md`, relativePath],
    route: {
      kind: routeKind,
      next_stage: null,
      next_slice_id: null,
      reason: null
    },
    data: {
      outcome_code: outcomeCode
    },
    worker: {
      worker_id: "wrk_test",
      adapter: "codex",
      session_id: null,
      worker_class: "session_worker"
    },
    execution: {
      permission_profile: "implementation",
      worktree_mode: "shared",
      fresh_context: true,
      resumed: false
    },
    input_artifacts: [],
    output_artifacts: [],
    verification: {
      tests_run: false,
      diff_reviewed: true
    },
    handoff: null,
    needs_user_input: false,
    needs_confirmation: false
  };

  const payload: StageResultRecord = {
    ...base,
    ...overrides,
    route: {
      ...base.route,
      ...(overrides.route ?? {})
    },
    data: {
      ...base.data,
      ...(overrides.data ?? {})
    }
  };

  const artifactFiles = new Set<string>([...payload.artifacts_written]);
  if (payload.summary_path) {
    artifactFiles.add(payload.summary_path);
  }
  for (const artifactPath of payload.output_artifacts ?? []) {
    artifactFiles.add(artifactPath);
  }
  for (const artifactPath of expectedStageArtifacts(stage, artifactDir, payload.data.outcome_code)) {
    artifactFiles.add(artifactPath);
  }

  for (const artifactPath of artifactFiles) {
    if (artifactPath.endsWith(".json")) {
      continue;
    }
    const artifactFullPath = join(repoRoot, artifactPath);
    await mkdir(dirname(artifactFullPath), { recursive: true });
    await writeFile(artifactFullPath, `${artifactPath}\n`, "utf8");
  }

  await writeFile(fullPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return relativePath;
}

function expectedStageArtifacts(stage: StageName, artifactDir: string, outcomeCode: string): string[] {
  switch (stage) {
    case "clarifying-intent":
      if (outcomeCode === "feature_brief_ready") {
        return [".praxis/brief.md"];
      }
      if (outcomeCode === "story_spec_ready" || outcomeCode === "bug_fix_ready") {
        return [`${artifactDir}/spec.md`];
      }
      return [];
    case "slicing-stories":
      return [".praxis/slice-map.md", ".praxis/slice-map.json"];
    case "sketching-design":
      return outcomeCode === "sketch_ready" ? [`${artifactDir}/sketch.md`] : [];
    case "rapid-implementing":
    case "driving-tdd":
      return [`${artifactDir}/implementation.md`];
    case "code-reviewing":
      return [`${artifactDir}/review.md`];
    case "code-improving":
      return [`${artifactDir}/improvement.md`];
    case "verifying-and-adapting":
      return [`${artifactDir}/verification.md`];
  }
}
