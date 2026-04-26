import type { StageConfig } from "../config/schema.js";
import type { AgentEvent } from "../workflow/stage.js";
import type { Reporter, RunSummary, StageEndResult } from "./reporter.js";

/**
 * Stdout reporter. S-001 ships no-op methods so the type contract holds; full
 * formatting (product.md §8) lands when stage execution is wired.
 */
export class LineReporter implements Reporter {
  stageStart(_stage: StageConfig, _idx: number, _total: number): void {
    /* no-op in S-001 */
  }
  stageEvent(_e: AgentEvent): void {
    /* no-op in S-001 */
  }
  stageEnd(_stage: StageConfig, _result: StageEndResult): void {
    /* no-op in S-001 */
  }
  paused(_runId: string, _stageId: string, _artifactPath: string): void {
    /* no-op in S-001 */
  }
  runDone(_runId: string, _summary: RunSummary): void {
    /* no-op in S-001 */
  }
}
