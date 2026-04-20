import { join, relative } from "node:path";
import type { StageName } from "../../contracts/model.js";
import { ensureDir, writeJsonFile } from "../state/store.js";

// Returns the repo-relative path where stage input envelopes are staged.
// Mirrors the convention used by output-parser.ts so the two halves align.
export function dispatchInputRelativePath(stage: StageName): string {
  return join(".praxis", "dispatch", stage, "input.json");
}

function dispatchInputAbsolutePath(repoRoot: string, stage: StageName): string {
  return join(repoRoot, dispatchInputRelativePath(stage));
}

// Write the stage's input envelope to `.praxis/dispatch/<stage>/input.json`.
// Returns the repo-relative path so the caller can inline it into the prompt.
export async function stageDispatchInput(
  repoRoot: string,
  stage: StageName,
  envelope: Record<string, unknown>,
): Promise<string> {
  const absolute = dispatchInputAbsolutePath(repoRoot, stage);
  const directory = join(repoRoot, ".praxis", "dispatch", stage);
  await ensureDir(directory);
  await writeJsonFile(absolute, envelope);
  return relative(repoRoot, absolute);
}
