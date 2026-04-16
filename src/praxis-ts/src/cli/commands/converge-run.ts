import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { ConvergeCampaignService } from "../../runtime/converge/index.js";
import { runCommandWithEnvelope } from "./shared.js";
import type {
  AdapterName,
  ConvergeProfile,
  FindingSeverity
} from "../../contracts/model.js";

export type ConvergeRunCommandArgs = {
  adapter: AdapterName;
  objective: string;
  profile: ConvergeProfile;
  severityThreshold: FindingSeverity;
  maxPasses: number;
  maxFindingsPerPass: number;
  maxStoriesPerPass: number;
  scope: string[];
  commitPerStory: boolean;
  autoContinue: boolean;
  allowWaive: boolean;
};

export async function runConvergeRunCommand(
  repoRoot: string,
  json: boolean,
  args: ConvergeRunCommandArgs
): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const service = new ConvergeCampaignService(new PraxisStateRepository(repoRoot));
    const outcome = await service.runCampaign({
      adapter: args.adapter,
      objective: args.objective,
      profile: args.profile,
      severityThreshold: args.severityThreshold,
      maxPasses: args.maxPasses,
      maxFindingsPerPass: args.maxFindingsPerPass,
      maxStoriesPerPass: args.maxStoriesPerPass,
      scope: args.scope,
      commitPerStory: args.commitPerStory,
      autoContinue: args.autoContinue,
      allowWaive: args.allowWaive
    });

    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: `Campaign ${outcome.campaign_id} is ${outcome.status}.`,
      data: outcome
    };
  });
}
