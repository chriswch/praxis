import type { StageConfig } from "../config/schema.js";

/**
 * Pure formatters for `LineReporter` output. Each function returns the lines
 * to print as `string[]`; the reporter owns I/O, color, and terminal width.
 *
 * Splitting the formatting from the I/O makes every rule (§8 of product.md)
 * unit-testable without touching stdout or fake timers.
 */

/** AC-2: `[N/total stage-id] starting…`. */
export function formatStageStart(
  stage: StageConfig,
  index: number,
  total: number,
): string[] {
  return [`[${index}/${total} ${stage.id}] starting…`];
}
