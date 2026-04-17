import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { RunController } from "../../runtime/control/index.js";
import { runCommandWithEnvelope } from "./shared.js";

export async function runBuildWorkerLaunchCommand(
  repoRoot: string,
  json: boolean,
): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const controller = new RunController(new PraxisStateRepository(repoRoot));
    const payload = await controller.buildWorkerLaunch();

    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: `Built worker launch payload for dispatch ${payload.dispatch_id}.`,
      data: payload,
    };
  });
}
