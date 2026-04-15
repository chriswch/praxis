import type { RunRecord, StoryLedgerRecord } from "../../contracts/model.js";

export type StatusProjection = {
  run_id: string;
  workflow: string;
  status: string;
  execution_mode: string;
  current: {
    scope: string;
    slice_id: string | null;
    stage: string | null;
    artifact_dir: string;
  };
  next_action: string;
  next_stage: string | null;
  reason: string;
  active_worker: {
    worker_id: string | null;
    session_id: string | null;
    resumable: boolean;
  };
  multi_slice: {
    mode: string;
    active_story: string | null;
    last_completed: string | null;
  };
  updated_at: string;
};

export function projectStatus(run: RunRecord, ledger: StoryLedgerRecord | null): StatusProjection {
  return {
    run_id: run.run_id,
    workflow: run.workflow,
    status: run.status,
    execution_mode: run.execution.mode,
    current: {
      scope: run.current.scope,
      slice_id: run.current.slice_id,
      stage: run.current.stage,
      artifact_dir: run.current.artifact_dir
    },
    next_action: run.routing.next_action,
    next_stage: run.routing.next_stage,
    reason: run.routing.reason,
    active_worker: {
      worker_id: run.active.worker_id,
      session_id: run.active.session_id,
      resumable: run.active.resumable
    },
    multi_slice: {
      mode: run.mode,
      active_story: ledger?.stories.active ?? null,
      last_completed: ledger?.stories.last_completed ?? null
    },
    updated_at: run.timestamps.updated_at
  };
}
