import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Deps } from "./stage.js";
import { formatRunId } from "./run-id.js";
import { writeIntent } from "./artifacts.js";
import { buildInitialState, writeInitialState } from "./state.js";

export type RunWorkflowContext = {
  intent: string;
  cwd: string;
};

export type RunWorkflowResult = {
  runId: string;
  runDir: string;
};

const DEFAULT_STAGE_IDS = ["clarify-assess", "implement", "auto-commit"];

/**
 * Bootstrap a new run: compute the run-id, create `<cwd>/.praxis/runs/<id>/`,
 * and write the intent + initial `state.json`. No agent execution in S-001.
 */
export function runWorkflow(
  ctx: RunWorkflowContext,
  deps: Deps,
): RunWorkflowResult {
  const startedAt = deps.clock();
  const runId = formatRunId(startedAt, deps.rng(2));
  const runDir = join(ctx.cwd, ".praxis", "runs", runId);
  mkdirSync(runDir, { recursive: true });

  writeIntent(runDir, ctx.intent);
  writeInitialState(
    runDir,
    buildInitialState({
      runId,
      intent: ctx.intent,
      startedAt: toIsoSeconds(startedAt),
      stageIds: DEFAULT_STAGE_IDS,
      currentStage: DEFAULT_STAGE_IDS[0],
    }),
  );

  return { runId, runDir };
}

/** ISO-8601 UTC string truncated to whole seconds, e.g. `2026-04-25T14:30:12Z`. */
function toIsoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
