import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Deps } from "./stage.js";
import { formatRunId } from "./run-id.js";
import { writeIntent } from "./artifacts.js";
import { buildInitialState, writeInitialState } from "./state.js";
import { runPreflight, appendPraxisToGitignore } from "./preflight.js";

export type RunWorkflowContext = {
  intent: string;
  cwd: string;
  allowDirty?: boolean;
};

export type RunWorkflowSuccess = {
  ok: true;
  runId: string;
  runDir: string;
};

export type RunWorkflowFailure = {
  ok: false;
  reason: string;
  remediation?: string;
};

export type RunWorkflowResult = RunWorkflowSuccess | RunWorkflowFailure;

const DEFAULT_STAGE_IDS = ["clarify-assess", "implement", "auto-commit"];

/**
 * Bootstrap a new run: pre-flight, then create `<cwd>/.praxis/runs/<id>/` and
 * write the intent + initial `state.json`. Stage execution arrives in a later
 * cycle; this function currently stops once the run dir is materialized.
 *
 * Pre-flight failures are returned (`ok: false`) — they leave no orphan
 * `.praxis/` on disk (AC-12).
 */
export async function runWorkflow(
  ctx: RunWorkflowContext,
  deps: Deps,
): Promise<RunWorkflowResult> {
  const preflight = runPreflight(ctx.cwd, {
    allowDirty: ctx.allowDirty ?? false,
  });
  if (!preflight.ok) {
    return {
      ok: false,
      reason: preflight.reason,
      remediation: preflight.remediation,
    };
  }

  appendPraxisToGitignore(ctx.cwd);

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

  return { ok: true, runId, runDir };
}

/** ISO-8601 UTC string truncated to whole seconds, e.g. `2026-04-25T14:30:12Z`. */
function toIsoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
