import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import { readJsonFile, writeJsonFile } from "../state/index.js";
import type { RunRecord, StageResultRecord, StoryLedgerRecord } from "../../contracts/model.js";
import { nowIsoUtc } from "../common/time.js";
import { BlockedStateError, InvalidInputError } from "../../contracts/errors.js";

type SliceMapStory = {
  id: string;
  title?: string;
};

type SliceMapDocument = {
  slices: SliceMapStory[];
};

export async function initializeStoryLedgerFromSliceMap(
  repoRoot: string,
  run: RunRecord,
  executionMode: RunRecord["execution"]["mode"]
): Promise<StoryLedgerRecord> {
  const sliceMapPath = join(repoRoot, ".praxis", "slice-map.json");
  const sliceMap = await readJsonFile<SliceMapDocument>(sliceMapPath);

  if (!sliceMap.slices || sliceMap.slices.length === 0) {
    throw new InvalidInputError("Slice map does not contain any slices.");
  }

  const first = sliceMap.slices[0];
  const items: StoryLedgerRecord["stories"]["items"] = {};
  const order: string[] = [];

  for (const slice of sliceMap.slices) {
    order.push(slice.id);
    items[slice.id] = {
      id: slice.id,
      title: slice.title ?? slice.id,
      artifact_dir: `.praxis/slices/${slice.id}`,
      status: slice.id === first.id ? "active" : "pending",
      carry_forward_from: null,
      handoff_path: null
    };

    await mkdir(join(repoRoot, items[slice.id].artifact_dir, "results"), { recursive: true });
  }

  run.mode = "multi_slice";
  run.current.scope = "slice";
  run.current.slice_id = first.id;
  run.current.artifact_dir = items[first.id].artifact_dir;
  run.current.stage = "clarifying-intent";

  const ledger: StoryLedgerRecord = {
    version: 1,
    run_id: run.run_id,
    workflow: run.workflow,
    execution_mode: executionMode,
    stories: {
      order,
      active: first.id,
      last_completed: null,
      items
    }
  };

  return ledger;
}

function buildHandoffPayload(
  run: RunRecord,
  ledger: StoryLedgerRecord,
  completedStoryId: string,
  stageResult: StageResultRecord
): Record<string, unknown> {
  return {
    version: 1,
    run_id: run.run_id,
    completed_story_id: completedStoryId,
    completed_stage: stageResult.stage,
    summary: stageResult.summary_path,
    carry_forward_context: {
      outcome_code: stageResult.data.outcome_code,
      routing_reason: run.routing.reason
    },
    changed_paths: stageResult.output_artifacts ?? stageResult.artifacts_written,
    commit_meta: {
      checkpointed_at: nowIsoUtc(),
      base_story: completedStoryId,
      workflow: run.workflow,
      execution_mode: ledger.execution_mode
    }
  };
}

export async function checkpointStoryBoundary(
  repoRoot: string,
  run: RunRecord,
  ledger: StoryLedgerRecord,
  stageResult: StageResultRecord
): Promise<{
  run: RunRecord;
  ledger: StoryLedgerRecord;
  handoff_path: string | null;
}> {
  const activeStoryId = ledger.stories.active;
  if (!activeStoryId) {
    throw new BlockedStateError("No active story to checkpoint.");
  }

  const activeStory = ledger.stories.items[activeStoryId];
  const handoffPath = `${activeStory.artifact_dir}/handoff.json`;
  const handoffPayload = buildHandoffPayload(run, ledger, activeStoryId, stageResult);

  await mkdir(dirname(join(repoRoot, handoffPath)), { recursive: true });
  await writeJsonFile(join(repoRoot, handoffPath), handoffPayload);

  activeStory.status = "completed";
  activeStory.handoff_path = handoffPath;
  ledger.stories.last_completed = activeStoryId;

  const orderIndex = ledger.stories.order.indexOf(activeStoryId);
  const nextStoryId = ledger.stories.order[orderIndex + 1] ?? null;

  if (!nextStoryId) {
    run.status = "completed";
    run.current.stage = null;
    run.routing.next_action = "finish";
    run.routing.next_stage = null;
    run.routing.next_slice_id = null;
    run.routing.boundary_handoff_path = null;
    run.routing.stop_reason_code = null;
    run.routing.reason = "Final story completed.";
    ledger.stories.active = null;

    return {
      run,
      ledger,
      handoff_path: handoffPath
    };
  }

  const nextStory = ledger.stories.items[nextStoryId];
  nextStory.carry_forward_from = activeStoryId;

  if (run.execution.mode === "autopilot") {
    nextStory.status = "active";
    run.status = "running";
    run.routing.next_action = "run_stage";
    run.routing.reason = `Boundary checkpoint complete. Autopilot advanced to ${nextStoryId}.`;
    run.routing.stop_reason_code = null;
  } else {
    nextStory.status = "active_next";
    run.status = "waiting_for_user";
    run.routing.next_action = "confirm_then_run";
    run.routing.reason = `Boundary checkpoint complete. Confirm to activate ${nextStoryId}.`;
    run.routing.stop_reason_code = "boundary_confirmation";
  }

  run.current.scope = "slice";
  run.current.slice_id = nextStoryId;
  run.current.artifact_dir = nextStory.artifact_dir;
  run.current.stage = "clarifying-intent";
  run.routing.next_stage = "clarifying-intent";
  run.routing.next_slice_id = nextStoryId;
  run.routing.boundary_handoff_path = handoffPath;
  ledger.stories.active = nextStoryId;

  return {
    run,
    ledger,
    handoff_path: handoffPath
  };
}

export function clearBoundaryHandoffIfConsumed(run: RunRecord): RunRecord {
  if (run.current.scope === "slice" && run.current.stage !== "clarifying-intent") {
    run.routing.boundary_handoff_path = null;
  }

  return run;
}
