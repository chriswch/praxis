import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { RunController } from "../../runtime/control/index.js";
import { runCommandWithEnvelope } from "./shared.js";

export type ApproveCommandOptions = {
  orchestrate?: boolean;
};

export async function runApproveCommand(
  repoRoot: string,
  json: boolean,
  note: string | null,
  options: ApproveCommandOptions = {},
): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const controller = new RunController(new PraxisStateRepository(repoRoot));
    const outcome = await controller.approveRun(note);
    const launched = options.orchestrate ? await controller.launchReadyStage() : null;

    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: launched
        ? `Run ${outcome.run_id} approved and launched ${launched.stage}.`
        : `Run ${outcome.run_id} approved for ${outcome.next_stage}.`,
      data: {
        ...outcome,
        launched,
      },
    };
  });
}
