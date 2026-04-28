import type { StageConfig } from "../../src/config/schema.js";
import type {
  Reporter,
  RunSummary,
  StageEndResult,
} from "../../src/ui/reporter.js";
import type { AgentEvent } from "../../src/workflow/stage.js";

/**
 * Spy reporter for runner / orchestration tests. Captures every method call so
 * tests can assert on call counts, ordering, and arguments without parsing
 * stdout.
 */
export type RecordedCall =
  | { kind: "stageStart"; stageId: string; index: number; total: number }
  | { kind: "stageEvent"; event: AgentEvent }
  | { kind: "stageEnd"; stageId: string; result: StageEndResult }
  | { kind: "paused"; runId: string; stageId: string; artifactPath: string }
  | { kind: "runDone"; runId: string; summary: RunSummary }
  | {
      kind: "resuming";
      resumingKind: "approved" | "recovering" | "retrying";
      runId: string;
      stageId: string;
      sessionId?: string;
    };

export class RecordingReporter implements Reporter {
  calls: RecordedCall[] = [];
  stageStart(stage: StageConfig, index: number, total: number): void {
    this.calls.push({ kind: "stageStart", stageId: stage.id, index, total });
  }
  stageEvent(event: AgentEvent): void {
    this.calls.push({ kind: "stageEvent", event });
  }
  stageEnd(stage: StageConfig, result: StageEndResult): void {
    this.calls.push({ kind: "stageEnd", stageId: stage.id, result });
  }
  paused(runId: string, stageId: string, artifactPath: string): void {
    this.calls.push({ kind: "paused", runId, stageId, artifactPath });
  }
  runDone(runId: string, summary: RunSummary): void {
    this.calls.push({ kind: "runDone", runId, summary });
  }
  resuming(
    kind: "approved" | "recovering" | "retrying",
    runId: string,
    stageId: string,
    sessionId?: string,
  ): void {
    this.calls.push({
      kind: "resuming",
      resumingKind: kind,
      runId,
      stageId,
      sessionId,
    });
  }
  countOf(kind: RecordedCall["kind"]): number {
    return this.calls.filter((c) => c.kind === kind).length;
  }
}
