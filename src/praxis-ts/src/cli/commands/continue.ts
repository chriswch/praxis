import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { RunController } from "../../runtime/control/index.js";
import { runCommandWithEnvelope } from "./shared.js";

export type ContinueCommandOptions = {
  orchestrate?: boolean;
};

export async function runContinueCommand(
  repoRoot: string,
  json: boolean,
  options: ContinueCommandOptions = {}
): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const controller = new RunController(new PraxisStateRepository(repoRoot));
    const outcome = await controller.continueRun();
    const launched = options.orchestrate ? await controller.launchReadyStage() : null;

    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: launched
        ? `Run ${outcome.run_id} continued and launched ${launched.stage}.`
        : `Run ${outcome.run_id} continued at ${outcome.next_stage}.`,
      data: {
        ...outcome,
        launched
      }
    };
  });
}
