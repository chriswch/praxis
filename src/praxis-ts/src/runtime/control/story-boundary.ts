import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import { readJsonFile, writeJsonFile } from "../state/index.js";
import type { RunRecord, StageResultRecord, StoryLedgerRecord } from "../../contracts/model.js";
import { nowIsoUtc } from "../common/time.js";
import { BlockedStateError, InvalidInputError } from "../../contracts/errors.js";
import { decideStageEntryCheckpoint, describeStageEntryCheckpoint } from "./checkpoint-policy.js";

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
  executionMode: RunRecord["execution"]["mode"],
): Promise<StoryLedgerRecord> {
  const sliceMapPath = join(repoRoot, ".praxis", "slice-map.json");
  const sliceMap = await readJsonFile<SliceMapDocument>(sliceMapPath);

  if (!sliceMap.slices || sliceMap.slices.length === 0) {
    throw new InvalidInputError("Slice map does not contain any slices.");
  }

  const first = sliceMap.slices[0];
  const firstId = typeof first.id === "string" ? first.id.trim() : "";
  if (!firstId) {
    throw new InvalidInputError("Slice map first story id is empty.");
  }
  const items: StoryLedgerRecord["stories"]["items"] = {};
  const order: string[] = [];
  const seenStoryIds = new Set<string>();

  for (const slice of sliceMap.slices) {
    const storyId = typeof slice.id === "string" ? slice.id.trim() : "";
    if (!storyId) {
      throw new InvalidInputError("Slice map contains a story with an empty id.");
    }
    if (seenStoryIds.has(storyId)) {
      throw new InvalidInputError(`Slice map contains duplicate story id: ${storyId}`);
    }
    seenStoryIds.add(storyId);

    order.push(storyId);
    items[storyId] = {
      id: storyId,
      title: slice.title ?? storyId,
      artifact_dir: `.praxis/slices/${storyId}`,
      status: storyId === firstId ? "active" : "pending",
      carry_forward_from: null,
      handoff_path: null,
    };

    await mkdir(join(repoRoot, items[storyId].artifact_dir, "results"), { recursive: true });
  }

  run.mode = "multi_slice";
  run.current.scope = "slice";
  run.current.slice_id = firstId;
  run.current.artifact_dir = items[firstId].artifact_dir;
  run.current.stage = "clarifying-intent";

  const ledger: StoryLedgerRecord = {
    version: 1,
    run_id: run.run_id,
    workflow: run.workflow,
    execution_mode: executionMode,
    stories: {
      order,
      active: firstId,
      last_completed: null,
      items,
    },
  };

  return ledger;
}

function buildHandoffPayload(
  run: RunRecord,
  ledger: StoryLedgerRecord,
  completedStoryId: string,
  stageResult: StageResultRecord,
): Record<string, unknown> {
  return {
    version: 1,
    run_id: run.run_id,
    completed_story_id: completedStoryId,
    completed_stage: stageResult.stage,
    summary: stageResult.summary_path,
    carry_forward_context: {
      outcome_code: stageResult.data.outcome_code,
      routing_reason: run.routing.reason,
    },
    changed_paths: stageResult.output_artifacts ?? stageResult.artifacts_written,
    commit_meta: {
      checkpointed_at: nowIsoUtc(),
      base_story: completedStoryId,
      workflow: run.workflow,
      execution_mode: ledger.execution_mode,
    },
  };
}

export async function checkpointStoryBoundary(
  repoRoot: string,
  run: RunRecord,
  ledger: StoryLedgerRecord,
  stageResult: StageResultRecord,
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
      handoff_path: handoffPath,
    };
  }

  const nextStory = ledger.stories.items[nextStoryId];
  nextStory.carry_forward_from = activeStoryId;
  const stageCheckpoint = decideStageEntryCheckpoint({
    execution_mode: run.execution.mode,
    stage: "clarifying-intent",
  });
  const requiresConfirmation = stageCheckpoint.next_action === "confirm_then_run";
  nextStory.status = requiresConfirmation ? "active_next" : "active";
  run.status = stageCheckpoint.status;
  run.routing.next_action = stageCheckpoint.next_action;
  run.routing.reason = `${describeStageEntryCheckpoint(
    "clarifying-intent",
    "story_boundary",
    stageCheckpoint,
  )} Next slice: ${nextStoryId}.`;
  run.routing.stop_reason_code = stageCheckpoint.stop_reason_code;

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
    handoff_path: handoffPath,
  };
}

export function clearBoundaryHandoffIfConsumed(run: RunRecord): RunRecord {
  if (run.current.scope === "slice" && run.current.stage !== "clarifying-intent") {
    run.routing.boundary_handoff_path = null;
  }

  return run;
}
