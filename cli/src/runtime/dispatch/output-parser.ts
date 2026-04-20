import { join } from "node:path";
import type { StageName } from "../../contracts/model.js";
import { readJsonFile } from "../state/store.js";

// Returns the repo-relative path where stage output envelopes are read.
// Mirrors the convention used by input-stager.ts.
export function dispatchOutputRelativePath(stage: StageName): string {
  return join(".praxis", "dispatch", stage, "output.json");
}

function dispatchOutputAbsolutePath(repoRoot: string, stage: StageName): string {
  return join(repoRoot, dispatchOutputRelativePath(stage));
}

export interface DispatchOutputParseOk<T> {
  ok: true;
  data: T;
}

export interface DispatchOutputParseError {
  ok: false;
  reason: string;
}

export type DispatchOutputParseResult<T> =
  | DispatchOutputParseOk<T>
  | DispatchOutputParseError;

// Read `.praxis/dispatch/<stage>/output.json` and run the provided validator.
// The validator is expected to throw on invalid data; on success the parsed
// value is returned typed as T. Missing files surface as a parse error rather
// than a thrown exception so callers can decide how to treat them.
export async function parseDispatchOutput<T>(
  repoRoot: string,
  stage: StageName,
  validator: (value: unknown) => asserts value is T,
): Promise<DispatchOutputParseResult<T>> {
  const absolute = dispatchOutputAbsolutePath(repoRoot, stage);
  let raw: unknown;
  try {
    raw = await readJsonFile<unknown>(absolute);
  } catch (error) {
    return {
      ok: false,
      reason: `Failed to read ${absolute}: ${stringifyError(error)}`,
    };
  }
  try {
    validator(raw);
  } catch (error) {
    return {
      ok: false,
      reason: `Dispatch output at ${absolute} failed validation: ${stringifyError(error)}`,
    };
  }
  return { ok: true, data: raw };
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
