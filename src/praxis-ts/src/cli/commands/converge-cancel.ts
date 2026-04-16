import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { ConvergeCampaignService } from "../../runtime/converge/index.js";
import { runCommandWithEnvelope } from "./shared.js";

export async function runConvergeCancelCommand(
  repoRoot: string,
  json: boolean,
  note: string | null
): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const service = new ConvergeCampaignService(new PraxisStateRepository(repoRoot));
    const outcome = await service.cancelCampaign(note);
    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: `Campaign ${outcome.campaign_id} cancelled.`,
      data: outcome
    };
  });
}
