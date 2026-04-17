import {
  checkpointStoryBoundary,
  clearBoundaryHandoffIfConsumed,
  initializeStoryLedgerFromSliceMap,
} from "./story-boundary.js";
import { ToolTelemetry } from "../tools/index.js";
import { validateStageResult } from "../../contracts/validators.js";
import { nowIsoUtc } from "../common/time.js";
import { BlockedStateError, RejectedProgressionError } from "../../contracts/errors.js";
import { loadAndValidateStageResult } from "./stage-result-validator.js";
import { decideNextRouting } from "./workflow-router.js";
import { hasUncommittedChanges, listCommitRange, readHeadCommit } from "../converge/git.js";
import type { PraxisStateRepository } from "../state/repository.js";
import type { SubmitStageResultOutcome } from "./types.js";
import type { RunRecord } from "../../contracts/model.js";

type AcceptedStageResult = Awaited<ReturnType<typeof loadAndValidateStageResult>>;
type LoadedLedger = Awaited<ReturnType<PraxisStateRepository["loadStoryLedger"]>>;

interface StageResultIngestPhase {
  run: RunRecord;
  accepted: AcceptedStageResult;
  ledger: LoadedLedger;
  ledgerNeedsCommit: boolean;
}

interface StageResultRoutingPhase {
  run: RunRecord;
  accepted: AcceptedStageResult;
  ledger: LoadedLedger;
  ledgerNeedsCommit: boolean;
  routingDecision: ReturnType<typeof decideNextRouting>;
}

export class StageResultService {
  constructor(private readonly repo: PraxisStateRepository) {}

  async submitStageResult(stageResultPath: string): Promise<SubmitStageResultOutcome> {
    const ingestPhase = await this.ingestStageResultPhase(stageResultPath);
    const routingPhase = this.routingProjectionPhase(ingestPhase);
    const boundaryPhase = await this.boundaryMutationPhase(routingPhase);
    return this.persistenceCommitPhase(boundaryPhase);
  }

  private async ingestStageResultPhase(stageResultPath: string): Promise<StageResultIngestPhase> {
    const run = await this.repo.loadRun();
    if (!run) {
      throw new BlockedStateError("No active run found at .praxis/run.json.");
    }
    if (!run.active.dispatch_id) {
      throw new RejectedProgressionError(
        "No active dispatch exists for this run. Prepare a dispatch before submitting a stage result.",
      );
    }
    const activeDispatch = await this.repo.loadDispatch(run.active.dispatch_id);
    if (!activeDispatch) {
      throw new BlockedStateError(`Active dispatch ${run.active.dispatch_id} does not exist.`);
    }

    const accepted = await loadAndValidateStageResult(
      this.repo.paths.root,
      stageResultPath,
      run,
      activeDispatch,
    );
    validateStageResult(accepted.result);
    let ledger = await this.repo.loadStoryLedger();
    let ledgerNeedsCommit = false;

    if (
      accepted.result.stage === "slicing-stories" &&
      accepted.result.data.outcome_code === "slice_map_ready"
    ) {
      ledger = await initializeStoryLedgerFromSliceMap(
        this.repo.paths.root,
        run,
        run.execution.mode,
      );
      ledgerNeedsCommit = true;
    }

    return { run, accepted, ledger, ledgerNeedsCommit };
  }

  private routingProjectionPhase(phase: StageResultIngestPhase): StageResultRoutingPhase {
    const { run, accepted, ledger, ledgerNeedsCommit } = phase;
    const routingDecision = decideNextRouting(run, accepted);

    run.status = routingDecision.status;
    run.current.stage = routingDecision.current_stage;
    run.routing.next_action = routingDecision.next_action;
    run.routing.next_stage = routingDecision.next_stage;
    run.routing.reason = routingDecision.reason;
    run.routing.stop_reason_code = routingDecision.stop_reason_code;
    run.routing.entered_from_stage = accepted.result.stage;
    run.routing.entered_from_outcome_code = accepted.result.data.outcome_code;
    run.timestamps.updated_at = nowIsoUtc();
    run.active.dispatch_id = null;
    run.active.worker_id = null;
    run.active.resumable = false;
    run.active.session_id = null;

    return { run, accepted, ledger, ledgerNeedsCommit, routingDecision };
  }

  private async boundaryMutationPhase(
    phase: StageResultRoutingPhase,
  ): Promise<StageResultRoutingPhase> {
    const { run, accepted, routingDecision } = phase;
    let { ledger, ledgerNeedsCommit } = phase;
    const boundarySourceStoryId = ledger?.stories.active ?? null;

    const boundaryTransitionRequired =
      run.mode === "multi_slice" &&
      (accepted.transition.route_kind === "next_slice" ||
        accepted.transition.route_kind === "done" ||
        (accepted.transition.route_kind === "proceed" && accepted.transition.next_stage === null));

    if (boundaryTransitionRequired) {
      if (!ledger) {
        throw new BlockedStateError(
          "Story boundary transition requires .praxis/story-ledger.json.",
        );
      }
      const boundary = await checkpointStoryBoundary(
        this.repo.paths.root,
        run,
        ledger,
        accepted.result,
      );
      ledger = boundary.ledger;
      ledgerNeedsCommit = true;
      run.routing.reason = boundary.handoff_path
        ? `Story boundary checkpointed (${boundary.handoff_path}). ${run.routing.reason}`
        : run.routing.reason;
      await this.applyCommitPerStoryBoundaryGate(run, boundarySourceStoryId);
    }

    clearBoundaryHandoffIfConsumed(run);

    return {
      run,
      accepted,
      ledger,
      ledgerNeedsCommit,
      routingDecision,
    };
  }

  private async applyCommitPerStoryBoundaryGate(
    run: RunRecord,
    completedStoryId: string | null,
  ): Promise<void> {
    const commitPolicy = run.constraints?.commit_per_story;
    if (!commitPolicy?.enabled || !completedStoryId) {
      return;
    }

    // For the terminal story, converge still verifies commit policy before reassessment.
    if (run.current.stage === null) {
      return;
    }

    const head = await readHeadCommit(this.repo.paths.root);
    const producedCommits = await listCommitRange(
      this.repo.paths.root,
      commitPolicy.last_verified_head,
      head,
    );
    const worktreeDirty = await hasUncommittedChanges(this.repo.paths.root);

    if (!worktreeDirty && producedCommits.length > 0) {
      commitPolicy.last_verified_head = head;
      commitPolicy.pending_story_id = null;
      return;
    }

    commitPolicy.pending_story_id = completedStoryId;
    run.status = "waiting_for_user";
    run.routing.next_action = "ask_user";
    run.routing.stop_reason_code = "commit_per_story_required";
    run.routing.reason = worktreeDirty
      ? `Story ${completedStoryId} completed, but commit-per-story is enabled and the worktree still has uncommitted changes. Commit the story before continuing.`
      : `Story ${completedStoryId} completed, but commit-per-story is enabled and no new commit was detected for this boundary. Commit the story before continuing.`;
  }

  private async persistenceCommitPhase(
    phase: StageResultRoutingPhase,
  ): Promise<SubmitStageResultOutcome> {
    const { run, accepted, routingDecision, ledger, ledgerNeedsCommit } = phase;

    if (ledgerNeedsCommit && ledger) {
      await this.repo.saveRunAndStoryLedger(run, ledger);
    } else {
      await this.repo.saveRun(run);
    }
    const auditWarnings: string[] = [];
    await this.tryAuditWrite("stage_history_append_failed", auditWarnings, async () =>
      this.repo.appendStageResultRecord(accepted.result),
    );
    const telemetry = new ToolTelemetry(this.repo);
    await this.tryAuditWrite("tool_telemetry_submit_failed", auditWarnings, async () =>
      telemetry.recordToolUse({
        run_id: run.run_id,
        stage: accepted.result.stage,
        tool: "submit-stage-result",
        status: "granted",
      }),
    );
    for (const toolUse of accepted.result.tool_uses ?? []) {
      await this.tryAuditWrite(`tool_telemetry_${toolUse.tool}_failed`, auditWarnings, async () =>
        telemetry.recordToolUse({
          run_id: run.run_id,
          stage: accepted.result.stage,
          tool: toolUse.tool,
          status: toolUse.status,
          reason: toolUse.reason ?? undefined,
        }),
      );
    }

    await this.tryAuditWrite("lifecycle_event_append_failed", auditWarnings, async () =>
      this.repo.appendLifecycleEvent({
        ts: run.timestamps.updated_at,
        type: "stage_result_accepted",
        run_id: run.run_id,
        stage: accepted.result.stage,
        action: "submit-stage-result",
        details: {
          outcome_code: accepted.result.data.outcome_code,
          route_kind: accepted.transition.route_kind,
          next_stage: routingDecision.next_stage,
          next_action: routingDecision.next_action,
          run_status: routingDecision.status,
        },
      }),
    );

    if (auditWarnings.length > 0) {
      await this.recordAuditDegradedState(run, accepted.result.stage, auditWarnings);
    } else if (
      run.audit_status !== undefined ||
      (run.audit_warnings && run.audit_warnings.length > 0)
    ) {
      // Clear a stale degraded marker carried over from an earlier stage once the
      // current acceptance committed cleanly — the run is no longer partially audited.
      delete run.audit_status;
      delete run.audit_warnings;
      await this.repo.saveRun(run);
    }

    return {
      stage: accepted.result.stage,
      outcome_code: accepted.result.data.outcome_code,
      route_kind: accepted.transition.route_kind,
      next_stage: routingDecision.next_stage,
      next_action: routingDecision.next_action,
      run_status: routingDecision.status,
      reason: routingDecision.reason,
      ...(auditWarnings.length > 0 ? { audit_warnings: auditWarnings } : {}),
    };
  }

  private async tryAuditWrite(
    code: string,
    warnings: string[],
    operation: () => Promise<void>,
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      warnings.push(`${code}: ${detail}`);
    }
  }

  private async recordAuditDegradedState(
    run: RunRecord,
    stage: string,
    warnings: string[],
  ): Promise<void> {
    run.audit_status = "degraded";
    run.audit_warnings = warnings;
    try {
      await this.repo.saveRun(run);
    } catch {
      // Run already committed with the routing change. If the second save fails, the
      // appendAuditWarning call below still records the warnings out-of-band.
    }
    try {
      await this.repo.appendAuditWarning({
        ts: nowIsoUtc(),
        run_id: run.run_id,
        stage,
        action: "submit-stage-result",
        warning_count: warnings.length,
        warnings,
      });
    } catch {
      // Best effort marker: the stage result is still accepted even when warning persistence fails.
    }
  }
}
