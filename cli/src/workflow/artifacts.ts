import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Write the raw user intent to `<runDir>/00-intent.txt`. Verbatim — no trailing
 * newline appended. Returns the absolute path written.
 */
export function writeIntent(runDir: string, intent: string): string {
  const path = join(runDir, "00-intent.txt");
  writeFileSync(path, intent, "utf8");
  return path;
}

/**
 * Write a stage's `finalText` artifact verbatim to disk. Returns the absolute
 * path written. The harness writes whatever the agent emitted — including
 * partial output on validator failure.
 */
export function writeArtifact(
  runDir: string,
  filename: string,
  finalText: string,
): string {
  const path = join(runDir, filename);
  writeFileSync(path, finalText, "utf8");
  return path;
}
