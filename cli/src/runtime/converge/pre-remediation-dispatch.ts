import type {
  CampaignRecord,
  ConvergeStageName,
  ConvergeStageResultRecord,
  DispatchRecord,
  RunRecord,
  StageResultRecord,
} from "../../contracts/model.js";
import { nowIsoUtc } from "../common/time.js";
import { compileDispatch } from "../control/dispatch-compiler.js";

// Build a non-persisted RunRecord that carries the minimum fields compileDispatch
// reads to produce a DispatchRecord for a converge pre-remediation stage.
// The run is synthetic because converge pre-remediation stages have no durable
// long-lived run — they are one-shot, short-lived dispatches that belong to the
// campaign, not to a craft run.
export function buildConvergePreRemediationDispatch(
  campaign: CampaignRecord,
  stage: ConvergeStageName,
  repoRoot: string,
): DispatchRecord {
  const runId = syntheticRunIdFor(campaign);
  const now = nowIsoUtc();
  const syntheticRun: RunRecord = {
    version: 1,
    run_id: runId,
    workflow: "converge-pre-remediation",
    status: "running",
    mode: "single_story",
    entry_task: `Converge ${campaign.campaign_id}`,
    runtime: {
      adapter: campaign.adapter,
      entrypoint: "praxis:converge",
    },
    execution: {
      mode: "autopilot",
      fresh_context_per_story: true,
    },
    current: {
      scope: "root",
      slice_id: null,
      artifact_dir: ".praxis",
      stage,
    },
    routing: {
      next_action: "run_stage",
      next_stage: stage,
      next_slice_id: null,
      reason: `Converge pre-remediation dispatch for ${stage}.`,
      stop_reason_code: null,
      boundary_handoff_path: null,
      entered_from_stage: null,
      entered_from_outcome_code: null,
    },
    active: {
      dispatch_id: null,
      worker_id: null,
      session_id: null,
      resumable: false,
    },
    workflow_constraints: {
      workflow: "converge-pre-remediation",
      clarifying_required_artifacts: [".praxis/objective.md"],
    },
    timestamps: { created_at: now, updated_at: now },
  };

  return compileDispatch({
    run: syntheticRun,
    boundaryHandoff: null,
    repoRoot,
  });
}

export function syntheticRunIdFor(campaign: CampaignRecord): string {
  return `converge_${campaign.campaign_id}`;
}

// Convert the campaign-scoped ConvergeStageResultRecord into the full
// StageResultRecord shape so it can be appended to the shared
// .praxis/stage-history.jsonl audit trail.
export function toStageHistoryRecord(
  convergeResult: ConvergeStageResultRecord,
  dispatch: DispatchRecord,
  artifactsWritten: string[],
  campaign: CampaignRecord,
): StageResultRecord {
  return {
    version: 2,
    run_id: syntheticRunIdFor(campaign),
    dispatch_id: dispatch.dispatch_id,
    session_id: null,
    stage: convergeResult.stage,
    artifact_dir: dispatch.artifact_dir,
    status: convergeResult.status,
    summary_path: dispatch.contract.primary_output,
    artifacts_written: [...artifactsWritten],
    route: {
      kind: convergeResult.route.kind,
      next_stage: null,
      next_slice_id: null,
    },
    data: convergeResult.data,
    worker: {
      worker_id: null,
      adapter: dispatch.worker.adapter,
      session_id: null,
      worker_class: dispatch.worker.worker_class,
    },
    execution: {
      permission_profile: dispatch.tool_policy.profile,
      worktree_mode: "shared",
      fresh_context: true,
      resumed: false,
    },
    input_artifacts: [...dispatch.inputs.required_artifacts],
    output_artifacts: [...artifactsWritten],
    needs_user_input: convergeResult.route.kind === "ask_user",
    needs_confirmation: false,
  };
}
