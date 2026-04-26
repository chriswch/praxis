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
 * Write a stage's `finalText` artifact verbatim to disk.
 *
 * Implementation deferred to a later slice; the signature anchors the contract.
 */
export function writeArtifact(
  _runDir: string,
  _filename: string,
  _finalText: string,
): string {
  throw new Error("writeArtifact: not implemented in S-001");
}
