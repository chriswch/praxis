import { EXIT_CODE } from "../exit-codes.js";
import { PraxisStateRepository } from "../../runtime/state/index.js";
import { RunController } from "../../runtime/control/index.js";
import { runCommandWithEnvelope } from "./shared.js";

export async function runDispatchCommand(repoRoot: string, json: boolean): Promise<number> {
  return runCommandWithEnvelope(json, async () => {
    const controller = new RunController(new PraxisStateRepository(repoRoot));
    const dispatch = await controller.createDispatch();

    return {
      ok: true,
      code: EXIT_CODE.OK,
      message: `Prepared dispatch ${dispatch.dispatch_id} for ${dispatch.stage}.`,
      data: dispatch,
    };
  });
}
