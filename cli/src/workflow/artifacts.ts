import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Write the raw user intent to `<runDir>/00-intent.txt`. Verbatim — no trailing
 * newline appended.
 */
export function writeIntent(runDir: string, intent: string): void {
  writeFileSync(join(runDir, "00-intent.txt"), intent, "utf8");
}

/**
 * Write a stage's `finalText` artifact verbatim to disk. Returns the absolute
 * path written. The harness writes whatever the agent emitted — including
 * partial output on validator failure (product.md §5.2).
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
