import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { ConvergeCampaignService } from "../../runtime/converge/index.js";
import { runCommandWithEnvelope } from "./shared.js";

export async function runConvergeContinueCommand(repoRoot: string, json: boolean): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const service = new ConvergeCampaignService(new PraxisStateRepository(repoRoot));
    const outcome = await service.continueCampaign();
    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: `Campaign ${outcome.campaign_id} continued.`,
      data: outcome,
    };
  });
}
