import type { StageConfig } from "../config/schema.js";
import type { AgentEvent } from "../workflow/stage.js";
import type { RunSummary, StageEndResult } from "./reporter.js";

/**
 * Pure formatters for `LineReporter` output. Each function returns the lines
 * to print as `string[]`; the reporter owns I/O, color, and terminal width.
 *
 * Splitting the formatting from the I/O makes every formatting rule
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
export function formatToolUse(
  e: Extract<AgentEvent, { type: "tool_use" }>,
): string[] {
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
export function formatError(
  e: Extract<AgentEvent, { type: "error" }>,
): string[] {
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
 * partial output is still written to disk.
 */
export function formatStageEnd(
  stage: StageConfig,
  index: number,
  total: number,
  result: StageEndResult,
): string[] {
  const tag = `[${index}/${total} ${stage.id}]`;
  // S-006: decision-driven skip on code-improving. Distinct one-liner so operators
  // see WHY the stage was skipped — no artifact, no session, just the reason.
  if (result.ok && result.stopReason === "skipped-trivial") {
    return [`${tag} skipped (skip-improve)`];
  }
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
 * Resume / recover / retry headline.
 *
 * Three kinds:
 *   - `"approved"`   → paused → resume path (user reviewed the artifact);
 *     emitted by `praxis advance` (S-004 AC-13).
 *   - `"recovering"` → failed/cancelled → recover path (validator re-runs
 *     against the hand-edited artifact); emitted by `praxis advance` (S-004
 *     AC-13).
 *   - `"retrying"`   → failed/cancelled `code-improving` → retry path
 *     (resume the prior SDK session with the literal prompt `continue`);
 *     emitted by `praxis retry` (S-006). The `sessionId` argument is the
 *     prior session being resumed and is required for this kind only.
 *
 * `runId` is included so multi-run terminals can disambiguate; `stageId` is
 * the stage we're resuming after (approved), recovering (recovering), or
 * retrying (retrying).
 */
export function formatResuming(
  kind: "approved" | "recovering" | "retrying",
  runId: string,
  stageId: string,
  sessionId?: string,
): string[] {
  if (kind === "approved") {
    return [`praxis: resuming approved plan after ${stageId} (run ${runId})`];
  }
  if (kind === "recovering") {
    return [
      `praxis: recovering ${stageId} from on-disk artifact; re-validating (run ${runId})`,
    ];
  }
  // retrying
  return [
    `praxis: retrying ${stageId} (resume ${sessionId ?? ""}) — sending "continue" (run ${runId})`,
  ];
}

/**
 * AC-12: end-of-run summary printed on every terminal path (completed,
 * paused, failed, cancelled). The headline verb branches on `summary.status`
 * so a failed/cancelled run does not misleadingly print "done" (H-1). Cost
 * totals are reported regardless of outcome — tokens are spent either way.
 *
 * Per-stage rows are emitted in object insertion order — the runner always
 * populates `perStage` in workflow order.
 */
const STATUS_WORD: Record<NonNullable<RunSummary["status"]>, string> = {
  completed: "done",
  paused: "paused",
  failed: "failed",
  cancelled: "cancelled",
};

export function formatRunDone(runId: string, summary: RunSummary): string[] {
  const word = STATUS_WORD[summary.status ?? "completed"];
  const tail = `${summary.cost.totalTokens} tokens, ${formatUsd(summary.cost.totalUsd)}`;
  const head = summary.commitSha
    ? `[run ${runId}] ${word} — commit ${summary.commitSha}, ${tail}`
    : `[run ${runId}] ${word} — ${tail}`;
  const lines = [head];
  for (const [id, row] of Object.entries(summary.perStage)) {
    lines.push(
      `  ${id}: ${row.tokens} tokens, ${formatUsd(row.usd)} (${row.sessionId})`,
    );
  }
  return lines;
}

function formatUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

/**
 * AC-4 + AC-5: render assistant text as ` › <text>` wrapped to `cols` with
 * 3-space-aligned continuation lines (no marker on continuation). When the
 * input is over 200 chars (AC-5), summarize to the first sentence
 * (`/[.!?](\s|$)/`); fall back to the first 200 chars + `…` when no boundary
 * matches.
 *
 * The first-line content budget is `cols - 3` (the leading ` › `); continuation
 * budgets are also `cols - 3` (the 3-space indent).
 */
const PREFIX = " › ";
const CONT = "   ";
const SUMMARIZE_THRESHOLD = 200;
const SENTENCE_BOUNDARY = /[.!?](\s|$)/;

export function formatAssistantText(text: string, cols: number): string[] {
  const display = text.length > SUMMARIZE_THRESHOLD ? summarize(text) : text;
  return wrap(display, cols);
}

function summarize(text: string): string {
  const m = SENTENCE_BOUNDARY.exec(text);
  if (m) {
    const end = m.index + 1; // include the punctuation char
    return text.slice(0, end);
  }
  return `${text.slice(0, SUMMARIZE_THRESHOLD)}…`;
}

function wrap(text: string, cols: number): string[] {
  const budget = Math.max(1, cols - PREFIX.length);
  if (text.length === 0) return [PREFIX];

  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return [PREFIX];

  const wrappedRows: string[] = [];
  let row = "";
  for (const tok of tokens) {
    if (tok.length > budget) {
      // Flush current row, then break the long token across rows.
      if (row.length > 0) {
        wrappedRows.push(row);
        row = "";
      }
      let i = 0;
      while (i < tok.length) {
        wrappedRows.push(tok.slice(i, i + budget));
        i += budget;
      }
      // The last chunk might still have room for more — restart row with it.
      // biome-ignore lint/style/noNonNullAssertion: just pushed at least one chunk above.
      row = wrappedRows.pop()!;
      continue;
    }
    if (row.length === 0) {
      row = tok;
    } else if (row.length + 1 + tok.length <= budget) {
      row += ` ${tok}`;
    } else {
      wrappedRows.push(row);
      row = tok;
    }
  }
  if (row.length > 0) wrappedRows.push(row);

  return wrappedRows.map((line, i) => (i === 0 ? PREFIX + line : CONT + line));
}
