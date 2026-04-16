import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { ConvergeCampaignService } from "../../runtime/converge/index.js";
import { runCommandWithEnvelope } from "./shared.js";

export async function runConvergeStatusCommand(repoRoot: string, json: boolean): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const service = new ConvergeCampaignService(new PraxisStateRepository(repoRoot));
    const status = await service.getStatus();
    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: `Campaign ${status.campaign_id} is ${status.status}.`,
      data: status
    };
  });
}
