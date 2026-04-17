import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { ConvergeCampaignService } from "../../runtime/converge/index.js";
import { runCommandWithEnvelope } from "./shared.js";

export async function runConvergeInspectCommand(repoRoot: string, json: boolean): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const service = new ConvergeCampaignService(new PraxisStateRepository(repoRoot));
    const inspection = await service.inspectCampaign();
    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: `Inspecting campaign ${inspection.campaign.campaign_id}.`,
      data: inspection,
    };
  });
}
