import { BlockedStateError } from "../../contracts/errors.js";
import type { RunRecord } from "../../contracts/model.js";
import { nowIsoUtc } from "../common/time.js";
import type { PraxisStateRepository } from "../state/repository.js";

export class ChildRunSlotService {
  constructor(private readonly repo: PraxisStateRepository) {}

  async assertCanClaim(campaignId: string, passId: string): Promise<void> {
    const slot = await this.repo.loadChildRunSlot();
    if (!slot || slot.status !== "active") {
      return;
    }
    throw new BlockedStateError(
      `Child run slot is active for ${slot.campaign_id}/${slot.pass_id} (${slot.child_run_id}); release it before launching ${campaignId}/${passId}.`,
    );
  }

  async claim(
    campaignId: string,
    passId: string,
    childRunId: string,
    reason: string,
  ): Promise<void> {
    await this.repo.saveChildRunSlot({
      version: 1,
      campaign_id: campaignId,
      pass_id: passId,
      child_run_id: childRunId,
      status: "active",
      reason,
      updated_at: nowIsoUtc(),
    });
  }

  async release(campaignId: string, passId: string, reason: string): Promise<void> {
    const slot = await this.repo.loadChildRunSlot();
    if (!slot || slot.status !== "active") {
      return;
    }
    if (slot.campaign_id !== campaignId || slot.pass_id !== passId) {
      return;
    }
    await this.repo.saveChildRunSlot({
      ...slot,
      status: "released",
      reason,
      updated_at: nowIsoUtc(),
    });
  }

  async assertOwnedRun(
    campaignId: string,
    passId: string,
    expectedRunId: string,
    currentRun: RunRecord | null,
  ): Promise<void> {
    const slot = await this.repo.loadChildRunSlot();
    if (!slot || slot.status !== "active") {
      throw new BlockedStateError(`Missing active child run slot for ${campaignId}/${passId}.`);
    }
    if (slot.campaign_id !== campaignId || slot.pass_id !== passId) {
      throw new BlockedStateError(
        `Child run slot ownership mismatch: expected ${campaignId}/${passId}, found ${slot.campaign_id}/${slot.pass_id}.`,
      );
    }
    if (slot.child_run_id !== expectedRunId) {
      throw new BlockedStateError(
        `Child run slot mismatch: expected run ${expectedRunId}, found ${slot.child_run_id}.`,
      );
    }
    if (currentRun && currentRun.run_id !== expectedRunId) {
      throw new BlockedStateError(
        `Active run ${currentRun.run_id} replaced expected child run ${expectedRunId}.`,
      );
    }
  }
}
