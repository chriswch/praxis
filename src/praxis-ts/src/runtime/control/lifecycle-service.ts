import { getAdapter } from "../adapters/index.js";
import { BlockedStateError, RejectedProgressionError } from "../../contracts/errors.js";
import { nowIsoUtc } from "../common/time.js";
import { hasUncommittedChanges, listCommitRange, readHeadCommit } from "../converge/git.js";
import type { RunRecord } from "../../contracts/model.js";
import type { PraxisStateRepository } from "../state/repository.js";
import type { LifecycleActionOutcome } from "./types.js";
import type { AdapterCancellationHandle } from "../adapters/types.js";

type SessionRecord = {
  locator?: unknown;
};

export class RunLifecycleService {
  constructor(private readonly repo: PraxisStateRepository) {}

  async continueRun(): Promise<LifecycleActionOutcome> {
    const run = await this.loadRunOrThrow();
    if (!run.current.stage) {
      throw new BlockedStateError("Cannot continue a run without an active stage.");
    }

    if (!["confirm_then_run", "ask_user"].includes(run.routing.next_action)) {
      throw new RejectedProgressionError(
        `continue is only valid when next_action is confirm_then_run or ask_user (found ${run.routing.next_action}).`
      );
    }

    const reason =
      run.routing.next_action === "ask_user"
        ? `User input acknowledged. Ready to re-run ${run.current.stage}.`
        : `Continue acknowledged. Ready to run ${run.current.stage}.`;

    await this.enforcePendingCommitGate(run);
    this.activateStage(run, reason);

    await this.repo.saveRun(run);
    await this.repo.appendLifecycleEvent({
      ts: run.timestamps.updated_at,
      type: "run_continued",
      run_id: run.run_id,
      stage: run.current.stage,
      action: "continue"
    });

    return this.toOutcome(run);
  }

  async approveRun(note: string | null): Promise<LifecycleActionOutcome> {
    const run = await this.loadRunOrThrow();
    if (!run.current.stage) {
      throw new BlockedStateError("Cannot approve a run without an active stage.");
    }
    if (run.routing.next_action !== "confirm_then_run") {
      throw new RejectedProgressionError(
        `approve is only valid when next_action is confirm_then_run (found ${run.routing.next_action}).`
      );
    }

    const approvalId = `approval_${Date.now()}`;
    this.activateStage(run, `Approval ${approvalId} accepted for stage ${run.current.stage}.`);

    await this.repo.saveApprovalRecord(approvalId, {
      run_id: run.run_id,
      stage: run.current.stage,
      note,
      approved_at: run.timestamps.updated_at
    });
    await this.repo.saveRun(run);
    await this.repo.appendLifecycleEvent({
      ts: run.timestamps.updated_at,
      type: "run_approved",
      run_id: run.run_id,
      stage: run.current.stage,
      action: "approve",
      details: {
        approval_id: approvalId
      }
    });

    return this.toOutcome(run);
  }

  async resumeRun(): Promise<LifecycleActionOutcome> {
    const run = await this.loadRunOrThrow();
    if (!run.current.stage) {
      throw new BlockedStateError("Cannot resume a run without an active stage.");
    }

    if (run.status === "cancelled" || run.routing.next_action === "finish") {
      throw new RejectedProgressionError("Cannot resume a terminal run.");
    }

    if (run.routing.next_action === "confirm_then_run" || run.routing.next_action === "ask_user") {
      throw new RejectedProgressionError("Run is waiting for operator input. Use continue or approve.");
    }

    if (!run.active.resumable || !run.active.session_id) {
      throw new RejectedProgressionError(
        "No resumable adapter session is registered for this run."
      );
    }

    this.activateStage(run, `Resume requested. Continue ${run.current.stage}.`);

    await this.repo.saveRun(run);
    await this.repo.appendLifecycleEvent({
      ts: run.timestamps.updated_at,
      type: "run_resumed",
      run_id: run.run_id,
      stage: run.current.stage,
      action: "resume",
      details: {
        session_id: run.active.session_id
      }
    });

    return this.toOutcome(run);
  }

  async cancelRun(note: string | null): Promise<LifecycleActionOutcome> {
    const run = await this.loadRunOrThrow();

    let cancellationReason = "Run cancelled by operator.";
    if (run.active.worker_id) {
      const cancellationHandle = await this.loadCancellationHandle(run);
      if (!cancellationHandle) {
        throw new BlockedStateError(
          "Active worker cannot be cancelled because no session_id or locator is registered."
        );
      }
      const adapter = getAdapter(run.runtime.adapter);
      const cancellation = await adapter.cancel(cancellationHandle);
      // Invariant: we only rewrite run state once the adapter confirms the worker is
      // gone. A `cancelled: false` result throws above, so by this point the worker has
      // terminated and it is safe to move the run to the `cancelled` state below.
      if (!cancellation.cancelled) {
        throw new BlockedStateError(cancellation.reason);
      }
      cancellationReason = cancellation.reason;
    }

    run.status = "cancelled";
    run.routing.next_action = "finish";
    run.routing.next_stage = null;
    run.routing.stop_reason_code = "cancelled";
    run.routing.reason = note ? `${cancellationReason} Note: ${note}` : cancellationReason;
    run.current.stage = null;
    run.timestamps.updated_at = nowIsoUtc();
    run.active.dispatch_id = null;
    run.active.worker_id = null;
    run.active.session_id = null;
    run.active.resumable = false;

    await this.repo.saveRun(run);
    await this.repo.appendLifecycleEvent({
      ts: run.timestamps.updated_at,
      type: "run_cancelled",
      run_id: run.run_id,
      stage: null,
      action: "cancel",
      details: note ? { note } : undefined
    });

    return this.toOutcome(run);
  }

  private async loadCancellationHandle(run: RunRecord): Promise<AdapterCancellationHandle | null> {
    const sessionId = run.active.session_id;
    let locator: string | null = null;

    if (run.active.worker_id) {
      const workerRecord = await this.repo.loadSessionRecord(`worker_${run.active.worker_id}`);
      locator = this.readLocatorFromSessionRecord(workerRecord);
    }

    if (!locator && sessionId) {
      const sessionRecord = await this.repo.loadSessionRecord(sessionId);
      locator = this.readLocatorFromSessionRecord(sessionRecord);
    }

    if (!sessionId && !locator) {
      return null;
    }

    return {
      session_id: sessionId,
      locator
    };
  }

  private readLocatorFromSessionRecord(sessionRecord: Record<string, unknown> | null): string | null {
    if (!sessionRecord) {
      return null;
    }
    const candidate = (sessionRecord as SessionRecord).locator;
    return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
  }

  private async loadRunOrThrow(): Promise<RunRecord> {
    const run = await this.repo.loadRun();
    if (!run) {
      throw new BlockedStateError("No active run found at .praxis/run.json.");
    }
    return run;
  }

  private activateStage(run: RunRecord, reason: string): void {
    if (!run.current.stage) {
      throw new BlockedStateError("Cannot activate a run without an active stage.");
    }

    run.status = "running";
    run.routing.next_action = "run_stage";
    run.routing.next_stage = run.current.stage;
    run.routing.stop_reason_code = null;
    run.routing.reason = reason;
    run.timestamps.updated_at = nowIsoUtc();
  }

  private async enforcePendingCommitGate(run: RunRecord): Promise<void> {
    const commitPolicy = run.constraints?.commit_per_story;
    if (!commitPolicy?.enabled || !commitPolicy.pending_story_id) {
      return;
    }

    const dirty = await hasUncommittedChanges(this.repo.paths.root);
    const head = await readHeadCommit(this.repo.paths.root);
    const producedCommits = await listCommitRange(
      this.repo.paths.root,
      commitPolicy.last_verified_head,
      head
    );

    if (dirty || producedCommits.length === 0) {
      throw new RejectedProgressionError(
        dirty
          ? `Story ${commitPolicy.pending_story_id} requires a clean commit checkpoint before continuing. Commit or stash local changes first.`
          : `Story ${commitPolicy.pending_story_id} requires at least one new commit before continuing.`
      );
    }

    commitPolicy.last_verified_head = head;
    commitPolicy.pending_story_id = null;
  }

  private toOutcome(run: RunRecord): LifecycleActionOutcome {
    return {
      run_id: run.run_id,
      status: run.status,
      next_action: run.routing.next_action,
      next_stage: run.routing.next_stage,
      reason: run.routing.reason
    };
  }
}
