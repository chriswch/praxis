import type { StageConfig } from "../config/schema.js";
import type { AgentEvent } from "../workflow/stage.js";
import type { RunSummary, StageEndResult } from "./reporter.js";

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

/** AC-7: `  › ToolName(brief)`. Brief is whatever `briefFor` produced. */
export function formatToolUse(e: Extract<AgentEvent, { type: "tool_use" }>): string[] {
  return [`  › ${e.name}(${e.brief})`];
}

/**
 * AC-8: silent on success; `  ✗ ToolName failed` on failure. Successful tool
 * results add no signal beyond the preceding `  › ToolName(brief)` line.
 */
export function formatToolResult(
  e: Extract<AgentEvent, { type: "tool_result" }>,
): string[] {
  return e.ok ? [] : [`  ✗ ${e.name} failed`];
}

/**
 * AC-9: each input line becomes one `error: <line>` line. Color is applied by
 * the reporter when stderr is a TTY; the formatter stays plain so tests can
 * assert on text without ANSI noise.
 */
export function formatError(e: Extract<AgentEvent, { type: "error" }>): string[] {
  return e.message.split("\n").map((line) => `error: ${line}`);
}

/**
 * AC-3: synthesised line for the agentless intent-capture stage. Pinned label
 * `intent` (Stage 0 has no StageConfig).
 */
export function formatStage0(total: number, intentFilename: string): string[] {
  return [`[0/${total} intent] captured → ${intentFilename}`];
}

/**
 * AC-10: artifact path → session line (skipped when sessionId is empty) →
 * `done` / `failed: <reason>`. Artifact line is emitted on failure too because
 * partial output is still written to disk (product.md §5.2).
 */
export function formatStageEnd(
  stage: StageConfig,
  index: number,
  total: number,
  result: StageEndResult,
): string[] {
  const tag = `[${index}/${total} ${stage.id}]`;
  const lines: string[] = [];
  if (result.artifactPath) {
    lines.push(`${tag} artifact: ${result.artifactPath}`);
  }
  if (result.sessionId) {
    lines.push(
      `${tag} session: ${result.sessionId} (claude --resume ${result.sessionId} to inspect)`,
    );
  }
  if (result.ok) {
    lines.push(`${tag} done`);
  } else {
    lines.push(`${tag} failed: ${result.error ?? "stage failed"}`);
  }
  return lines;
}

/** AC-11: replaces the old direct `process.stdout.write` in runner.ts. */
export function formatPaused(
  runId: string,
  stageId: string,
  artifactPath: string,
): string[] {
  return [
    `praxis: paused after ${stageId}. Review ${artifactPath} then run: praxis advance ${runId}`,
  ];
}

/**
 * AC-12: end-of-run summary printed on every terminal path (success, paused,
 * failed). Per-stage rows are emitted in object insertion order — the runner
 * always populates `perStage` in workflow order.
 */
export function formatRunDone(runId: string, summary: RunSummary): string[] {
  const head = summary.commitSha
    ? `[run ${runId}] done — commit ${summary.commitSha}, ${summary.cost.totalTokens} tokens, ${formatUsd(summary.cost.totalUsd)}`
    : `[run ${runId}] done — ${summary.cost.totalTokens} tokens, ${formatUsd(summary.cost.totalUsd)}`;
  const lines = [head];
  for (const [id, row] of Object.entries(summary.perStage)) {
    lines.push(`  ${id}: ${row.tokens} tokens, ${formatUsd(row.usd)} (${row.sessionId})`);
  }
  return lines;
}

function formatUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}
